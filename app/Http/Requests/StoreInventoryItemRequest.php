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
            'quantity'         => 'required|integer|min:0|max:1000000',
            // Units in stock per condition (e.g. 45 Good + 15 New). When sent,
            // their sum is the item's in-stock quantity.
            'new_quantity'     => 'sometimes|integer|min:0|max:1000000',
            'good_quantity'    => 'sometimes|integer|min:0|max:1000000',
            'fair_quantity'    => 'sometimes|integer|min:0|max:1000000',
            'poor_quantity'    => 'sometimes|integer|min:0|max:1000000',
            'storage_location' => 'nullable|string|max:150',
            'notes'            => 'nullable|string|max:255',
            // Optional photo -- same conventions as Resident ID photos /
            // expense receipts (image file, up to 5 MB).
            'photo'            => 'nullable|' . \App\Support\Uploads::IMAGE_RULE,
        ];
    }
}