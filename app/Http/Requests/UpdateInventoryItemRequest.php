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
            // Units reported lost (the rest keep their own condition) --
            // see InventoryController::update / InventoryItem::settleLostOnLoan.
            'lost_quantity'    => 'sometimes|integer|min:0',
            'disposed_quantity' => 'sometimes|integer|min:0',
            'condition'        => 'sometimes|in:New,Good,Fair,Poor',
            'storage_location' => 'nullable|string|max:150',
            'notes'            => 'nullable|string|max:255',
            // Optional photo -- a new file replaces whatever was there
            // before. Remove the photo outright by sending `remove_photo=1`
            // with no new file.
            'photo'            => 'nullable|file|mimes:jpg,jpeg,png,gif,webp|max:5120',
            // Several photos per item (first = cover), up to 5 MB each.
            'photos'           => 'nullable|array|max:5',
            'photos.*'         => 'file|mimes:jpg,jpeg,png,gif,webp|max:5120',
            'photos_sync'      => 'nullable|boolean',
            'keep_photos'      => 'nullable|array',
            'keep_photos.*'    => 'integer|min:0',
            'remove_photo'     => 'nullable|boolean',
        ];
    }
}