<?php

namespace App\Http\Controllers;

use App\Services\FacebookService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class IntegrationController extends Controller
{
    // Adviser recommendation: "2 in 1 — Facebook Page (Developer Portal / API)"
    public function facebookStatus(FacebookService $fb)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json($fb->status());
    }

    public function connectFacebook(Request $request, FacebookService $fb)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'page_id' => 'required|string|max:100',
            'access_token' => 'required|string',
        ]);

        $fb->connect($request->page_id, $request->access_token);

        return response()->json(['message' => 'Facebook Page connected.', 'status' => $fb->status()]);
    }

    public function disconnectFacebook(FacebookService $fb)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $fb->disconnect();

        return response()->json(['message' => 'Facebook Page disconnected.']);
    }

    /**
     * Facebook Messenger webhook verification (GET) — public route, no auth.
     * Register this URL in the Meta Developer Portal along with FACEBOOK_VERIFY_TOKEN.
     */
    public function webhookVerify(Request $request)
    {
        $verifyToken = config('services.facebook.verify_token', 'piao-verify-token');

        if ($request->get('hub_mode') === 'subscribe' && $request->get('hub_verify_token') === $verifyToken) {
            return response($request->get('hub_challenge'), 200);
        }

        return response('Forbidden', 403);
    }

    /**
     * Receives Messenger events (e.g. a resident messaging the Page). Logged
     * for now — wire up auto-replies here once a real Page token is set.
     */
    public function webhookReceive(Request $request)
    {
        Log::info('Facebook webhook payload', $request->all());

        return response()->json(['status' => 'received']);
    }
}
