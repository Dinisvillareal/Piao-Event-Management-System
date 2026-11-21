<?php

namespace Tests;

use App\Models\User;
use App\Support\Totp;
use Illuminate\Support\Facades\Crypt;

/** Small helpers shared by the Chapter IV functional tests. */
trait Support
{
    /**
     * A tiny real PNG that passes Laravel's "image" rule. UploadedFile::fake()->image()
     * needs PHP's GD extension, which many Windows PHP installs leave switched off,
     * and the test suite should not depend on it.
     */
    protected function fakeImage(string $name = 'photo.png'): \Illuminate\Http\UploadedFile
    {
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');

        return \Illuminate\Http\UploadedFile::fake()->createWithContent(preg_replace('/\.[^.]+$/', '', $name) . '.png', $png);
    }

    protected function makeUser(string $role = 'Resident', array $extra = []): User
    {
        static $n = 100;
        $n++;
        $u = new User();
        $u->forceFill(array_merge([
            'user_code'      => 'PR-' . str_pad((string) $n, 4, '0', STR_PAD_LEFT),
            'first_name'     => 'Test' . $n,
            'last_name'      => 'User' . $n,
            'contact_number' => '0917' . str_pad((string) $n, 7, '1', STR_PAD_LEFT),
            'role'           => $role,
            'password'       => bcrypt('Passw0rd!Strong#1'),
            'has_account'    => true,
        ], $extra))->save();
        return $u->fresh();
    }

    /**
     * Moves an event into the past. Money is recorded while an event is still open, so a test
     * that needs an ended event WITH expenses records them first and calls this afterwards
     * (once an event has ended, the database no longer accepts expenses for it).
     */
    protected function endEvent(\App\Models\Event $event, int $daysAgo = 10): \App\Models\Event
    {
        $event->update([
            'event_start' => now()->subDays($daysAgo)->setTime(8, 0),
            'event_end'   => now()->subDays($daysAgo)->setTime(10, 0),
        ]);

        return $event->fresh();
    }

    /** Archives a record the way the app does: says who archived it, then removes it. */
    protected function archived($model, string $by = 'PR-0001')
    {
        $model->forceFill(['deleted_by' => $by])->save();
        $model->delete();

        return $model;
    }

    /** Puts $qty units of $itemId out on loan to $eventId (a loan row), so a return or a loss can be recorded against it. */
    protected function loanRow(int $eventId, int $itemId, int $qty): int
    {
        $db = \Illuminate\Support\Facades\DB::class;
        $stock = fn (int $by) => $db::table('inventory_items')->where('id', $itemId)->update([
            'quantity' => $db::raw("quantity + ({$by})"), 'good_quantity' => $db::raw("good_quantity + ({$by})"),
        ]);

        $stock($qty);   // the units were on the shelf...
        $id = $db::table('event_inventory_items')->insertGetId([
            'event_id' => $eventId, 'inventory_item_id' => $itemId, 'quantity' => $qty, 'good_quantity' => $qty,
        ]);
        $stock(-$qty);  // ...and left it when they were lent out

        return $id;
    }

    /**
     * Runs $setup with the "recorded times cannot be rewritten" locks (migration 2026_11_19_000018) lifted, then puts
     * them back. For test set-up that needs history written the way no screen can write it (a back-dated archive time,
     * a repaired code in the log), exactly like the seeders do.
     */
    protected function withoutTimeLocks(callable $setup)
    {
        $locks = [
            require database_path('migrations/2026_11_19_000018_lock_recorded_times_and_activity_log.php'),
            require database_path('migrations/2026_11_19_000020_lock_report_history_and_hash_chain.php'),
            require database_path('migrations/2026_11_19_000021_lock_inventory_ledger_and_hash_chain.php'),
        ];
        $locks[0]->down();
        $locks[1]->down(false);   // lifts the add-only lock but keeps the chain columns
        $locks[2]->down(false);
        try {
            return $setup();
        } finally {
            foreach (array_reverse($locks) as $lock) {
                $lock->up();
            }
        }
    }

    protected function staff(array $extra = []): User { return $this->makeUser('Staff', $extra); }
    protected function headStaff(array $extra = []): User { return $this->makeUser('Staff', array_merge(['is_head_staff' => true], $extra)); }

    /** Turn two-step verification on for $u and return the plain secret. */
    protected function enableTwoFactor(User $u): string
    {
        $secret = Totp::generateSecret();
        $u->forceFill([
            'two_factor_secret'       => Crypt::encryptString($secret),
            'two_factor_confirmed_at' => now(),
        ])->save();
        return $secret;
    }

    protected function otp(string $secret, int $stepOffset = 0): string
    {
        return Totp::at($secret, intdiv(time(), 30) + $stepOffset);
    }
}
