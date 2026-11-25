<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Support;
use Tests\TestCase;

/** Staff can change a resident's ID photo straight from the profile, without opening Edit Record. */
class ResidentPhotoUpdateTest extends TestCase
{
    use RefreshDatabase, Support;

    private function resident(): User
    {
        $this->actingAs($this->staff())->postJson('/users', [
            'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'contact_number' => '09171234567', 'role' => 'Resident',
        ])->assertStatus(201);

        return User::where('first_name', 'Juan')->first();
    }

    public function test_staff_can_replace_a_residents_photo_and_the_old_file_is_removed(): void
    {
        Storage::fake('public');
        $user = $this->resident();

        $this->actingAs($this->staff())
            ->post("/users/{$user->id}/photo", ['validation_id' => UploadedFile::fake()->image('first.jpg')], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonStructure(['validation_id_url']);
        $first = $user->fresh()->validation_id;
        Storage::disk('public')->assertExists($first);

        $this->actingAs($this->staff())
            ->post("/users/{$user->id}/photo", ['validation_id' => UploadedFile::fake()->image('second.png')], ['Accept' => 'application/json'])
            ->assertOk();

        $second = $user->fresh()->validation_id;
        $this->assertNotSame($first, $second);
        Storage::disk('public')->assertMissing($first);
        Storage::disk('public')->assertExists($second);
    }

    public function test_only_pictures_are_accepted(): void
    {
        Storage::fake('public');
        $user = $this->resident();

        $this->actingAs($this->staff())
            ->post("/users/{$user->id}/photo", ['validation_id' => UploadedFile::fake()->create('note.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertStatus(422);
    }

    public function test_an_archived_record_keeps_its_photo(): void
    {
        Storage::fake('public');
        $user = $this->resident();
        $user->delete();

        $this->actingAs($this->staff())
            ->post("/users/{$user->id}/photo", ['validation_id' => UploadedFile::fake()->image('x.jpg')], ['Accept' => 'application/json'])
            ->assertStatus(422);
    }
}
