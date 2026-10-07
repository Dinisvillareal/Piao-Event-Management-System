<?php

namespace Database\Seeders;

use App\Models\Event;
use App\Models\EventInventoryItem;
use App\Models\EventInventoryRelease;
use App\Models\InventoryItem;
use App\Models\User;
use Illuminate\Database\Seeder;

class EventInventoryReleaseSeeder extends Seeder
{
    /**
     * A few recent returns, so the Returns page's Recently Released tab has
     * real history (and the Pending Returns queue shows a mix of fully
     * returned and still-outstanding events) instead of starting empty.
     * Each one mirrors EventController::releaseBorrowedItem exactly: the
     * returned quantity goes back onto the InventoryItem's stock, comes off
     * the event's borrow row (deleted once nothing is left), and an
     * EventInventoryRelease log row is written. No evidence photo is
     * attached (the column is nullable; real returns made in the app always
     * carry one). Must run after EventInventoryItemSeeder.
     */
    public function run(): void
    {
        $staffCodes = User::where('role', 'Staff')->orderBy('id')->pluck('user_code')->all();

        $returns = [
            // Fully returned -- the borrow row disappears from Pending Returns.
            ['event' => 'Senior Citizen Wellness Check', 'item' => 'First Aid Kit (Complete)', 'qty' => 2, 'hours_ago' => 48],
            ['event' => 'Health Insurance Claims Clinic', 'item' => 'Multipurpose Printer/Scanner', 'qty' => 1, 'hours_ago' => 6],
            // Partly returned -- the rest of the tables is still pending.
            ['event' => 'Pantawid Pamilya Livelihood Workshop', 'item' => 'Folding Tables (6ft)', 'qty' => 2, 'hours_ago' => 24],
        ];

        foreach ($returns as $i => $return) {
            $event = Event::where('name', $return['event'])->first();
            $item = InventoryItem::where('name', $return['item'])->first();
            if (!$event || !$item) {
                continue;
            }

            $borrow = EventInventoryItem::where('event_id', $event->id)
                ->where('inventory_item_id', $item->id)
                ->first();
            if (!$borrow) {
                continue;
            }

            $qty = min((int) $return['qty'], (int) $borrow->quantity);

            $item->quantity += $qty;
            $item->save();

            if ($qty >= $borrow->quantity) {
                $borrow->delete();
            } else {
                $borrow->quantity -= $qty;
                $borrow->save();
            }

            $at = now()->subHours($return['hours_ago']);

            // forceFill so the backdated created_at is kept (it isn't mass-assignable).
            (new EventInventoryRelease())->forceFill([
                'event_id' => $event->id,
                'inventory_item_id' => $item->id,
                'quantity' => $qty,
                'released_by' => $staffCodes[$i % max(count($staffCodes), 1)] ?? null,
                'created_at' => $at,
                'updated_at' => $at,
            ])->save();
        }
    }
}
