public function rules()
{
    return [
        'first_name' => 'required|string|max:70',
        'last_name' => 'required|string|max:70',
        'middle_name' => 'nullable|string|max:70',

        'contact_number' => [
            'required',
            'regex:/^(\+?63|0)9\d{9}$/'
        ],

        'role' => 'required|in:Staff,Member',

        'password' => 'required|string|min:6|max:100'
    ];
}
