public function rules()
{
    return [
        'first_name' => 'nullable|string|max:100',
        'last_name' => 'nullable|string|max:100',
        'middle_name' => 'nullable|string|max:100',

        'contact_number' => [
            'nullable',
            'regex:/^(\+?63|0)9\d{9}$/'
        ],

        'role' => 'nullable|in:Staff,Member',

        'password' => 'nullable|string|min:6|max:100'
    ];
}
