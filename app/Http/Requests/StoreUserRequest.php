<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreUserRequest extends FormRequest
{
    public function authorize()
    {
        return true;
    }

    public function rules()
    {
        return [
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'middle_name' => 'nullable|string|max:100',

            'contact_number' => [
                'required',
                'regex:/^(\+?63|0)9\d{9}$/'
            ],

            'role' => 'required|in:Staff,Member',

            'username' => 'required|string|max:50|unique:accounts,username',
            'password' => 'required|string|min:6|max:100'
        ];
    }
}
