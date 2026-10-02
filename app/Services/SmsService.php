<?php

namespace App\Services;

use App\Models\SmsLog;
use App\Models\User;
use App\Models\Household;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Adviser recommendation: "Piao has slow/limited connectivity — notify by
 * household. Head of the household gets an SMS to a per-household contact
 * number" (rather than relying solely on in-app notifications, which
 * require the resident's phone to be online).
 *
 * Provider: IPROG SMS (https://www.iprogsms.com).
 *
 * IPROG send endpoint accepts exactly three parameters (per their API docs):
 *   - api_token    (string, required)  -- account API Token
 *   - phone_number (string, required)  -- recipient number
 *   - message      (string, required)  -- message body
 *
 * Their `sms_provider` parameter (integer 0/1/2, default 0) is optional
 * and is deliberately omitted -- 0 is the default and is what this account
 * needs (shared sender name). No sender_name is sent either; IPROG picks
 * the sender automatically from the account settings.
 *
 * Sender name note: currently on the default shared sender (iprogSMS),
 * which only reaches Globe / TM / DITO / GOMO. Smart/TNT numbers are
 * rejected by IPROG at send time and land in sms_logs with
 * status = "failed" (with IPROG's error in provider_response), so staff
 * can see which households weren't reached. To cover Smart/TNT later,
 * apply for a custom sender name; once approved, IPROG uses it
 * automatically with no code change needed here.
 *
 * Without SMS_API_KEY configured in .env, messages are just logged
 * (status = "simulated"), so the feature is fully wired end-to-end and
 * only needs the real token to start sending.
 */
class SmsService
{
    private const IPROG_SEND_ENDPOINT = 'https://www.iprogsms.com/api/v1/sms_messages';

    // =========================================================
    // LOW-LEVEL: send one SMS + log it
    // =========================================================

    public function send(?int $userId, ?int $eventId, string $toNumber, string $message): SmsLog
    {
        $apiToken = config('services.sms.api_key');

        $status = 'simulated';
        $providerResponse = null;

        if ($apiToken) {
            try {
                $response = Http::asJson()->post(self::IPROG_SEND_ENDPOINT, [
                    'api_token'    => $apiToken,
                    'phone_number' => $this->normalizeNumber($toNumber),
                    'message'      => $message,
                ]);

                $status = $response->successful() ? 'sent' : 'failed';
                $providerResponse = substr($response->body(), 0, 255);

                if (!$response->successful()) {
                    Log::warning('IPROG SMS send failed: ' . $response->body());
                }
            } catch (\Throwable $e) {
                $status = 'failed';
                $providerResponse = substr($e->getMessage(), 0, 255);
                Log::warning('SMS send failed: ' . $e->getMessage());
            }
        } else {
            Log::info("[SMS-SIMULATED] To: {$toNumber} — {$message}");
        }

        return SmsLog::create([
            'user_id'           => $userId,
            'event_id'          => $eventId,
            'to_number'         => $toNumber,
            'message'           => $message,
            'status'            => $status,
            'provider_response' => $providerResponse,
        ]);
    }

    private function normalizeNumber(string $number): string
    {
        $digits = preg_replace('/\D/', '', $number);
        if (str_starts_with($digits, '63') && strlen($digits) === 12) {
            $digits = '0' . substr($digits, 2);
        }
        return $digits;
    }

    // =========================================================
    // Broadcast to every household head in the barangay
    // =========================================================
    // Sends ONE SMS to every user flagged `is_household_head = true`,
    // regardless of whether their household has any member matching the
    // event's membership targeting.
    //
    // Then, as a fallback, covers households with NO head assigned --
    // without this step, a headless household would silently receive
    // ZERO SMS for every event, forever, because the primary loop only
    // walks users where is_household_head = true.
    //
    // Rationale (adviser rec + local reality):
    //   - Low internet connectivity and low smartphone ownership mean
    //     in-app notifications don't reach most residents.
    //   - Household heads are, by definition, the people with phones.
    //   - Heads acting as neighborhood relays is how info already
    //     spreads in a barangay.
    //
    // Cost note: this is a real SMS send per head. With N households and
    // M events, that's N×M messages per period. Deliberately a separate
    // method so it's obvious at every call site that this one broadcasts
    // to everyone.
    //
    // @return \App\Models\SmsLog[]
    // =========================================================

    public function broadcastToAllHouseholdHeads(?int $eventId, string $message): array
    {
        $logs = [];

        // ─── Primary pass: every assigned household head ─────────────
        $heads = User::where('role', 'Resident')
            ->where('is_household_head', true)
            ->whereNull('deleted_at')
            ->with('household:id,contact_number')
            ->get([
                'id',
                'first_name',
                'last_name',
                'contact_number',
                'household_id',
                'household_code',
                'household_contact_number',
                'is_household_head',
            ]);

        foreach ($heads as $head) {
            // Prefer the household's own shared contact number, then the
            // legacy free-text one, then the head's personal number.
            $number = $head->household?->contact_number
                ?: $head->household_contact_number
                ?: $head->contact_number;

            if (!$number) {
                continue;
            }

            $personalized = $this->personalizeMessage($message, $head);
            $logs[] = $this->send($head->id, $eventId, $number, $personalized);
        }

        // ─── Fallback: households with NO head assigned ──────────────
        // The loop above only finds heads. A household that has nobody
        // flagged is_household_head = true would otherwise get ZERO SMS
        // for every event, forever. Fall back to texting any one member
        // of that household who has a phone number on file, so the
        // household still gets reached.
        //
        // The eager-load closure filters the members list down to only
        // members with a usable contact number, so `->first()` is
        // guaranteed to pick one that can actually be reached (rather
        // than skipping the whole household because the alphabetically
        // first member happens to have no phone).
        $headlessHouseholds = Household::whereDoesntHave('head')
            ->whereNull('deleted_at')
            ->with(['members' => function ($q) {
                $q->whereNull('deleted_at')
                  ->whereNotNull('contact_number')
                  ->where('contact_number', '!=', '');
            }])
            ->get();

        foreach ($headlessHouseholds as $household) {
            $fallback = $household->members->first();
            if (!$fallback) {
                // Household has no reachable member at all -- nothing we
                // can do. Skip silently (an SMS cannot be sent to a
                // number that doesn't exist).
                continue;
            }

            $personalized = $this->personalizeMessage($message, $fallback);
            $logs[] = $this->send($fallback->id, $eventId, $fallback->contact_number, $personalized);
        }

        return $logs;
    }

    // =========================================================
    // Original eligible-households method -- kept for any other
    // callers or future targeted use.
    // =========================================================

    public function notifyHouseholds(iterable $residents, ?int $eventId, string $message): array
    {
        $logs = [];

        $groups = [];
        foreach ($residents as $resident) {
            if ($resident->household_id) {
                $key = 'hh:' . $resident->household_id;
            } elseif ($resident->household_code) {
                $key = 'code:' . $resident->household_code;
            } else {
                $key = 'user:' . $resident->id;
            }
            $groups[$key][] = $resident;
        }

        foreach ($groups as $members) {
            $head = null;
            foreach ($members as $member) {
                if ($member->is_household_head ?? false) {
                    $head = $member;
                    break;
                }
            }

            if ($head) {
                $number = $head->household?->contact_number
                    ?: $head->household_contact_number
                    ?: $head->contact_number;

                if ($number) {
                    $personalized = $this->personalizeMessage($message, $head);
                    $logs[] = $this->send($head->id, $eventId, $number, $personalized);
                }
                continue;
            }

            foreach ($members as $resident) {
                $number = $resident->household?->contact_number
                    ?: $resident->household_contact_number
                    ?: $resident->contact_number;

                if (!$number) {
                    continue;
                }
                $personalized = $this->personalizeMessage($message, $resident);
                $logs[] = $this->send($resident->id, $eventId, $number, $personalized);
            }
        }

        return $logs;
    }

    // =========================================================
    // Shared: replace {name} in the message with the recipient's full name
    // =========================================================

    private function personalizeMessage(string $message, $resident): string
    {
        $fullName = trim(($resident->first_name ?? '') . ' ' . ($resident->last_name ?? ''));
        if ($fullName === '') {
            $fullName = 'Resident';
        }
        return str_replace('{name}', $fullName, $message);
    }
}