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
     * Send one SMS per household (to the household head's contact number),
     * instead of texting every resident, so households aren't spammed and
     * the barangay doesn't burn SMS credits per-member.
     *
     * @param  iterable<\App\Models\User>  $residents
     * @return \App\Models\SmsLog[]
     */
    public function notifyHouseholds(iterable $residents, ?int $eventId, string $message): array
    {
        $sentHouseholds = [];
        $logs = [];

        foreach ($residents as $resident) {
            $householdCode = $resident->household_code ?? null;
            $isHead = (bool) ($resident->is_household_head ?? false);

            // If grouped into a household, only the head's number receives the SMS.
            if ($householdCode && !$isHead) {
                continue;
            }

            $dedupeKey = $householdCode ?: ('user:' . $resident->id);
            if (isset($sentHouseholds[$dedupeKey])) {
                continue;
            }

            $number = $resident->household_contact_number ?: $resident->contact_number;
            if (!$number) {
                continue;
            }

            $sentHouseholds[$dedupeKey] = true;
            $logs[] = $this->send($resident->id, $eventId, $number, $message);
        }

        return $logs;
    }
}
