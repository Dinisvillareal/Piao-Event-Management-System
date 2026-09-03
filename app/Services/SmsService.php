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
 * This is a thin, provider-agnostic wrapper: without SMS_PROVIDER / SMS_API_KEY
 * configured in .env it just logs the message (status = "simulated"), so the
 * feature is fully wired end-to-end and only needs real gateway credentials
 * (e.g. Semaphore, popular for PH numbers) to start sending real texts.
 */
class SmsService
{
    public function send(?int $userId, ?int $eventId, string $toNumber, string $message): SmsLog
    {
        $provider = config('services.sms.provider');
        $apiKey = config('services.sms.api_key');
        $sender = config('services.sms.sender_name', 'BrgyPiao');

        $status = 'simulated';
        $providerResponse = null;

        if ($provider === 'semaphore' && $apiKey) {
            try {
                $response = Http::asForm()->post('https://api.semaphore.co/api/v4/messages', [
                    'apikey' => $apiKey,
                    'number' => $toNumber,
                    'message' => $message,
                    'sendername' => $sender,
                ]);
                $status = $response->successful() ? 'sent' : 'failed';
                $providerResponse = substr($response->body(), 0, 255);
            } catch (\Throwable $e) {
                $status = 'failed';
                $providerResponse = substr($e->getMessage(), 0, 255);
                Log::warning('SMS send failed: ' . $e->getMessage());
            }
        } else {
            Log::info("[SMS-SIMULATED] To: {$toNumber} — {$message}");
        }

        return SmsLog::create([
            'user_id' => $userId,
            'event_id' => $eventId,
            'to_number' => $toNumber,
            'message' => $message,
            'status' => $status,
            'provider_response' => $providerResponse,
        ]);
    }

    /**
     * Send one SMS per household (to the household head\'s contact number),
     * instead of texting every resident, so households aren\'t spammed and
     * the barangay doesn\'t burn SMS credits per-member.
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
                // Normal case: one SMS to the designated head\'s number only,
                // so the rest of the household isn\'t texted separately.
                $number = $head->household_contact_number ?: $head->contact_number;
                if ($number) {
                    $logs[] = $this->send($head->id, $eventId, $number, $message);
                }
                continue;
            }

            // No head was designated for this household (or the resident
            // isn\'t grouped into one at all) — don\'t silently drop everyone.
            // A household with no head checked used to mean nobody in it
            // ever got notified; instead, notify every member on their own
            // number so a missed "head" pick doesn\'t cost a whole family
            // their event notice.
            foreach ($members as $resident) {
                $number = $resident->household_contact_number ?: $resident->contact_number;
                if (!$number) {
                    continue;
                }
                $logs[] = $this->send($resident->id, $eventId, $number, $message);
            }
        }

        return $logs;
    }
}
