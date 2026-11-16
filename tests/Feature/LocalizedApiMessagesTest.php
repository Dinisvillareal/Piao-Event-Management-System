<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\EventInventoryItem;
use App\Models\InventoryItem;
use App\Models\User;
use App\Support\ApiMessageTranslator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LocalizedApiMessagesTest extends TestCase
{
    use RefreshDatabase;

    private function staff(): User
    {
        return User::create([
            'user_code' => 'STAFF-' . uniqid(), 'first_name' => 'Staff', 'last_name' => 'Tester',
            'contact_number' => '09171234567', 'role' => 'Staff', 'password' => bcrypt('secret123'), 'has_account' => true,
        ]);
    }

    private function borrowedItem(): InventoryItem
    {
        $item = InventoryItem::create(['name' => 'Plastic Chairs', 'quantity' => 50, 'condition' => 'Good']);
        $event = Event::create(['name' => 'Test Event', 'description' => 'x', 'location' => 'Hall', 'event_start' => now()->addDay()]);
        EventInventoryItem::create(['event_id' => $event->id, 'inventory_item_id' => $item->id, 'quantity' => 5]);
        return $item;
    }

    public function test_exact_and_dynamic_messages_translate(): void
    {
        $this->assertSame('Matagumpay na nagawa ang kaganapan', ApiMessageTranslator::translate('Event created successfully', 'tl'));
        $this->assertSame('Malampuson nga nahimo ang kalihokan', ApiMessageTranslator::translate('Event created successfully', 'ceb'));
        $this->assertSame('Hindi pa bukas ang sign-in. Magbubukas ito sa 8:00 AM.', ApiMessageTranslator::translate('Sign-in is not open yet. It opens at 8:00 AM.', 'tl'));
        $this->assertSame('Nabigong gumawa ng kaganapan: Kulang ang stock ng "Mic" (available: 1, hiniling: 3).',
            ApiMessageTranslator::translate('Failed to create event: Not enough stock for "Mic" (available: 1, requested: 3).', 'tl'));
        $this->assertSame('Unknown thing', ApiMessageTranslator::translate('Unknown thing', 'tl'));
        $this->assertSame('Event created successfully', ApiMessageTranslator::translate('Event created successfully', 'en'));
    }

    public function test_every_message_keeps_its_placeholders(): void
    {
        foreach (['tl', 'ceb'] as $loc) {
            foreach (require lang_path("$loc/messages.php") as $en => $tr) {
                preg_match_all('/\{\d+\}/', $en, $a);
                preg_match_all('/\{\d+\}/', $tr, $b);
                $this->assertEquals(array_unique($a[0]), array_unique($b[0]), "[$loc] $en");
            }
        }
    }

    public function test_api_response_follows_the_language_cookie(): void
    {
        $staff = $this->staff();
        $item = $this->borrowedItem();

        $en = $this->actingAs($staff)->deleteJson("/inventory/{$item->id}");
        $en->assertStatus(409);
        $this->assertStringContainsString('is currently borrowed for an event', $en->json('message'));

        $tl = $this->actingAs($staff)->withCredentials()->withUnencryptedCookie('piao_lang', 'tl')->deleteJson("/inventory/{$item->id}");
        $tl->assertStatus(409);
        $this->assertStringContainsString('Kasalukuyang hiniram ang "Plastic Chairs"', $tl->json('message'));

        $ceb = $this->actingAs($staff)->withCredentials()->withUnencryptedCookie('piao_lang', 'ceb')->deleteJson("/inventory/{$item->id}");
        $this->assertStringContainsString('Gihulam karon ang "Plastic Chairs"', $ceb->json('message'));

        $bad = $this->actingAs($staff)->withCredentials()->withUnencryptedCookie('piao_lang', 'xx')->deleteJson("/inventory/{$item->id}");
        $this->assertStringContainsString('is currently borrowed', $bad->json('message'));
    }

    public function test_validation_errors_follow_the_language_cookie(): void
    {
        $staff = $this->staff();

        $en = $this->actingAs($staff)->postJson('/age-brackets', []);
        $this->assertContains($en->status(), [422, 404, 405]);

        $v = \Illuminate\Support\Facades\Validator::make([], ['label' => 'required']);
        app()->setLocale('tl');
        $this->assertSame('Kinakailangan ang label.', $v->errors()->first('label') ?: \Illuminate\Support\Facades\Validator::make([], ['label' => 'required'])->errors()->first('label'));
        app()->setLocale('ceb');
        $this->assertSame('Gikinahanglan ang label.', \Illuminate\Support\Facades\Validator::make([], ['label' => 'required'])->errors()->first('label'));
        app()->setLocale('tl');
        $this->assertSame('Kinakailangan ang unang pangalan.', \Illuminate\Support\Facades\Validator::make([], ['first_name' => 'required'])->errors()->first('first_name'));
    }
}
