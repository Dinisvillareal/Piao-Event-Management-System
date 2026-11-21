<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Activity-log chain key
    |--------------------------------------------------------------------------
    |
    | Every activity-log row carries a fingerprint (an HMAC) of its own content and of
    | the fingerprint of the row before it. The key below is part of that fingerprint, so
    | someone who can only reach the database cannot recalculate the chain after editing a
    | row. Keep it out of the database; by default it is the application key. If this key
    | is changed, `php artisan log:verify` will report every row written under the old one.
    |
    */

    'key' => env('AUDIT_LOG_KEY') ?: env('APP_KEY'),

];
