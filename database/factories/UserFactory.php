<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    public function definition(): array
    {
        return [
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'middle_name' => fake()->lastName(),

            // Philippine format: 09 + 9 digits
            'contact_number' => '09' . fake()->numberBetween(100000000, 999999999),

            // FIXED ROLE VALUES ONLY
            'role' => fake()->randomElement(['Staff', 'Member']),
        ];
    }
}
