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
            'condition'        => 'required|in:New,Good,Fair,Poor',
            'storage_location' => 'nullable|string|max:150',
            'notes'            => 'nullable|string|max:255',
            // Optional photo -- same conventions as Resident ID photos /
            // expense receipts (image file, up to 5 MB).
            'photo'            => 'nullable|file|mimes:jpg,jpeg,png,gif,webp|max:5120',
            // Several photos per item (first = cover), up to 5 MB each.
            'photos'           => 'nullable|array|max:5',
            'photos.*'         => 'file|mimes:jpg,jpeg,png,gif,webp|max:5120',
            'photos_sync'      => 'nullable|boolean',
            'keep_photos'      => 'nullable|array',
            'keep_photos.*'    => 'integer|min:0',
        ];
    }
}