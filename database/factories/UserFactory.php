<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;


class UserFactory extends Factory
{
    public function definition(): array
    {
        return [
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'middle_name' => fake()->lastName(),

            'contact_number' => '09' . fake()->numberBetween(100000000, 999999999),


            'role' => fake()->randomElement(['Staff', 'Member']),
        ];
    }
}
