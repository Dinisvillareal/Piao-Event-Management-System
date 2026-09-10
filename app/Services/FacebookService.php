<?php

namespace App\Services;

use App\Models\IntegrationSetting;
use Illuminate\Support\Facades\Http;

/**
 * Adviser recommendation: "2 in 1 — Facebook Page (Developer Portal / API)
 * + Text/physical QR ID". This service posts event announcements to the
 * barangay's connected Facebook Page via the Graph API, as a second
 * notification channel alongside in-app notifications and the printed/QR
 * check-in flow (see ScanView's Manual/Physical ID tab).
 */
class FacebookService
{
    public function settings(): ?IntegrationSetting
    {
        return IntegrationSetting::where('key', 'facebook_page')->first();
    }

    public function isConnected(): bool
    {
        $s = $this->settings();
        return (bool) ($s && $s->is_enabled && !empty($s->value['page_id'] ?? null) && !empty($s->value['access_token'] ?? null));
    }

    public function status(): array
    {
        $s = $this->settings();
        return [
            'connected' => $this->isConnected(),
            'page_id' => $s->value['page_id'] ?? null,
            'connected_at' => $s->value['connected_at'] ?? null,
        ];
    }

    public function connect(string $pageId, string $accessToken): IntegrationSetting
    {
        return IntegrationSetting::updateOrCreate(
            ['key' => 'facebook_page'],
            [
                'value' => [
                    'page_id' => $pageId,
                    'access_token' => $accessToken,
                    'connected_at' => now()->toIso8601String(),
                ],
                'is_enabled' => true,
            ]
        );
    }

    public function disconnect(): void
    {
        IntegrationSetting::where('key', 'facebook_page')->update(['is_enabled' => false]);
    }

    /**
     * @return array{0: bool, 1: string} [success, message]
     */
    public function postEvent(string $title, string $message): array
    {
        $s = $this->settings();
        if (!$this->isConnected() || !$s) {
            return [false, 'Facebook Page is not connected yet.'];
        }

        $pageId = $s->value['page_id'];
        $token = $s->value['access_token'];
        $text = trim("{$title}\n\n{$message}");

        try {
            $response = Http::post("https://graph.facebook.com/v19.0/{$pageId}/feed", [
                'message' => $text,
                'access_token' => $token,
            ]);

            if ($response->successful()) {
                return [true, 'Posted to the Facebook Page.'];
            }

            return [false, $response->json('error.message') ?? 'Facebook API request failed.'];
        } catch (\Throwable $e) {
            return [false, $e->getMessage()];
        }
    }
}
