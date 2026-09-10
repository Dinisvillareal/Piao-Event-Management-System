<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreInventoryItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name'             => 'required|string|max:150',
            'quantity'         => 'required|integer|min:0',
            'condition'        => 'required|in:New,Good,Fair,Poor,Disposed,Lost',
            'storage_location' => 'nullable|string|max:150',
            'notes'            => 'nullable|string|max:255',
        ];
    }
}
