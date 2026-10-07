<?php

namespace App\Http\Requests;

use App\Rules\StrongPassword;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

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
            'suffix'           => 'nullable|string|max:10',

            // Barangay Captain / Secretary designation. One active holder per
            // post: the controller refuses a second holder unless the caller
            // explicitly confirms the replacement (replace_barangay_position).
            'barangay_position'         => 'nullable|in:captain,secretary',
            'replace_barangay_position' => 'nullable|boolean',

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
            // Portal login is opt-in. When has_account is on, a password is
            // required (strong, 8+ chars) -- the username is the generated PR-#### code.
            'has_account'      => 'nullable|boolean',
            'password'         => [
                Rule::requiredIf(fn () => filter_var($this->input('has_account'), FILTER_VALIDATE_BOOLEAN)),
                'nullable', 'string', new StrongPassword(),
            ],
            'validation_id'    => 'nullable',
            'membership_ids'   => 'nullable|array',
            'membership_ids.*' => 'exists:memberships,id',

            // Adviser recommendation: "Profiling (Filter for Age)"
            'birth_date'       => 'nullable|date|before_or_equal:today',
            'address'          => 'nullable|string|max:150',
            'civil_status_id'  => 'nullable|exists:civil_statuses,id',
            'current_status_ids'   => 'nullable|array',
            'current_status_ids.*' => 'integer|exists:current_statuses,id',
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
