<?php

namespace App\Services;

use App\Models\SmsLog;
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

    public function send(?int $userId, ?int $eventId, string $toNumber, string $message): SmsLog
    {
        $apiToken = config('services.sms.api_key');

        $status = 'simulated';
        $providerResponse = null;

        if ($apiToken) {
            try {
                // Sent as a JSON body, matching IPROG's documented sample.
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

    /**
     * IPROG accepts 09XXXXXXXXX, +639XXXXXXXXX, or 639XXXXXXXXX.
     * We store numbers as 09XXXXXXXXX everywhere, so just strip any
     * formatting characters and normalize the country-code form.
     */
    private function normalizeNumber(string $number): string
    {
        $digits = preg_replace('/\D/', '', $number);

        // 639XXXXXXXXX -> 09XXXXXXXXX
        if (str_starts_with($digits, '63') && strlen($digits) === 12) {
            $digits = '0' . substr($digits, 2);
        }

        return $digits;
    }

    /**
     * Send one SMS per household (to the household head's contact number),
     * instead of texting every resident, so households aren't spammed and
     * the barangay doesn't burn SMS credits per-member.
     *
     * Groups by the real `household_id` relationship (Household module)
     * when a resident has one; falls back to the legacy free-text
     * `household_code` string for any older, unmigrated data.
     *
     * @param  iterable<\App\Models\User>  $residents
     * @return \App\Models\SmsLog[]
     */
    public function notifyHouseholds(iterable $residents, ?int $eventId, string $message): array
    {
        $logs = [];

        // First pass: group residents by household so we can tell, per
        // household, whether a head was actually designated.
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
                // Normal case: one SMS to the designated head's number only,
                // so the rest of the household isn't texted separately.
                // Prefer the real Household record's shared contact_number
                // (the number staff actually manage on the Households page)
                // over the legacy per-user household_contact_number, which
                // is never shown or editable there -- falling all the way
                // back to the head's own personal number if neither is set.
                $number = $head->household?->contact_number ?: $head->household_contact_number ?: $head->contact_number;
                if ($number) {
                    $logs[] = $this->send($head->id, $eventId, $number, $message);
                }
                continue;
            }

            // No head was designated for this household (or the resident
            // isn't grouped into one at all) — don't silently drop everyone.
            // A household with no head checked used to mean nobody in it
            // ever got notified; instead, notify every member on their own
            // number so a missed "head" pick doesn't cost a whole family
            // their event notice.
            foreach ($members as $resident) {
                $number = $resident->household?->contact_number ?: $resident->household_contact_number ?: $resident->contact_number;
                if (!$number) {
                    continue;
                }
                $logs[] = $this->send($resident->id, $eventId, $number, $message);
            }
        }

        return $logs;
    }
}