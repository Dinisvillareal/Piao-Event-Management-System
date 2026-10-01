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
            // Optional photo -- a new file replaces whatever was there
            // before. Remove the photo outright by sending `remove_photo=1`
            // with no new file.
            'photo'            => 'nullable|file|mimes:jpg,jpeg,png,gif,webp|max:5120',
            'remove_photo'     => 'nullable|boolean',
        ];
    }
}