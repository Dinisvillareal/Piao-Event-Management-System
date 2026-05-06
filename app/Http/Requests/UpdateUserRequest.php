<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateUserRequest extends FormRequest
{
    public function authorize()
    {
        return true;
    }

    public function rules()
    {
        $userId = $this->route('id');

        return [
            'first_name' => 'nullable|string|max:100',
            'last_name' => 'nullable|string|max:100',
            'middle_name' => 'nullable|string|max:100',

            'contact_number' => [
                'nullable',
                'regex:/^(\+?63|0)9\d{9}$/'
            ],

            'role' => 'nullable|in:Staff,Member',

            'username' => "nullable|string|max:50|unique:accounts,username,{$userId},user_id",
            'password' => 'nullable|string|min:6|max:100'
        ];
    }
}
