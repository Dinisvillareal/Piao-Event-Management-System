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
            // Units in stock per condition (e.g. 45 Good + 15 New). When sent,
            // their sum is the item's in-stock quantity.
            'new_quantity'     => 'sometimes|integer|min:0',
            'good_quantity'    => 'sometimes|integer|min:0',
            'fair_quantity'    => 'sometimes|integer|min:0',
            'poor_quantity'    => 'sometimes|integer|min:0',
            'storage_location' => 'nullable|string|max:150',
            'notes'            => 'nullable|string|max:255',
            // Optional photo -- a new file replaces whatever was there
            // before. Remove the photo outright by sending `remove_photo=1`
            // with no new file.
            'photo'            => 'nullable|file|mimes:jpg,jpeg,png,gif,webp|max:5120',
            'remove_photo'     => 'nullable|boolean',
            // The counts the form was opened with, to detect a concurrent change.
            'base_new_quantity'  => 'nullable|integer|min:0',
            'base_good_quantity' => 'nullable|integer|min:0',
            'base_fair_quantity' => 'nullable|integer|min:0',
            'base_poor_quantity' => 'nullable|integer|min:0',
        ];
    }
}