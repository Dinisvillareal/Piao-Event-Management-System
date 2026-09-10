<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateInventoryItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name'             => 'sometimes|string|max:150',
            'quantity'         => 'sometimes|integer|min:0',
            'condition'        => 'sometimes|in:New,Good,Fair,Poor,Disposed,Lost',
            'storage_location' => 'nullable|string|max:150',
            'notes'            => 'nullable|string|max:255',
        ];
    }
}
