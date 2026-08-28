<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'sms' => [
        // Adviser recommendation: household head SMS notifications.
        // Set SMS_PROVIDER=semaphore and SMS_API_KEY=... to send real texts;
        // left unset, messages are logged only (see App\Services\SmsService).
        'provider' => env('SMS_PROVIDER'),
        'api_key' => env('SMS_API_KEY'),
        'sender_name' => env('SMS_SENDER_NAME', 'BrgyPiao'),
    ],

    'facebook' => [
        'verify_token' => env('FACEBOOK_VERIFY_TOKEN', 'piao-verify-token'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
