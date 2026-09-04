<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'first_name'       => 'required|string|max:70',
            'last_name'        => 'required|string|max:70',
            'middle_name'      => 'nullable|string|max:70',

            // strips dashes before regex — frontend sends 0917-123-4567
            'contact_number'   => [
                'required',
                'string',
                function ($attribute, $value, $fail) {
                    $stripped = preg_replace('/\D/', '', $value);
                    if (!preg_match('/^(\+?63|0)9\d{9}$/', $stripped)) {
                        $fail('The contact number format is invalid.');
                    }
                },
            ],

            'role'             => 'required|in:Staff,Resident',
            'password'         => 'nullable|string|min:6|max:100',
            'validation_id'    => 'nullable',
            'membership_ids'   => 'nullable|array',
            'membership_ids.*' => 'exists:memberships,id',

            // Adviser recommendation: "Profiling (Filter for Age)"
            'birth_date'       => 'nullable|date|before_or_equal:today',
            'address'          => 'nullable|string|max:150',
            'civil_status_id'  => 'nullable|exists:civil_statuses,id',
            'gender'           => 'nullable|in:Male,Female',

            // Real Household module -- link this resident to an existing
            // household record (see HouseholdController) instead of the
            // old free-text household_code/household_contact_number pair,
            // which never actually connected to the households table.
            'household_id'      => 'nullable|integer|exists:households,id',
            'is_household_head' => 'nullable|boolean',

            // UC-17: Switch Interface Language
            'preferred_language' => 'nullable|in:en,tl,ceb',
        ];
    }
}
