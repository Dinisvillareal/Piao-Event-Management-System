<?php

namespace App\Support;

use App\Exceptions\UserFacingException;
use Illuminate\Http\UploadedFile;

/**
 * The one definition of which files each module accepts, used by the upload
 * rules, by the code that names the stored file, and (as a copy) by the
 * database triggers of 2026_11_19_000004_lock_upload_file_types.
 *
 *   IMAGE    photos and the resident's validation ID   .jpg .jpeg .png
 *   RECEIPT  expense receipts                          .jpg .jpeg .png .pdf
 */
class Uploads
{
    public const IMAGE = ['jpg', 'jpeg', 'png'];
    public const RECEIPT = ['jpg', 'jpeg', 'png', 'pdf'];

    /** Laravel rule for a single photo or ID image (5 MB). */
    public const IMAGE_RULE = 'file|mimes:jpg,jpeg,png|max:5120';

    /** Laravel rule for a single receipt (5 MB). */
    public const RECEIPT_RULE = 'file|mimes:jpg,jpeg,png,pdf|max:5120';

    /**
     * The extension to store the file under, decided from what the file really
     * is, never from the name the browser sent (a PHP script renamed to .png, or
     * a PNG named .php, must not be saved under the wrong extension).
     *
     * @param  string[]  $allowed
     */
    public static function extension(UploadedFile $file, array $allowed): string
    {
        $allowed = array_map([self::class, 'normalize'], $allowed);

        $real = self::normalize((string) $file->guessExtension());
        if ($real !== '') {
            if (in_array($real, $allowed, true)) {
                return $real;
            }
            throw new UserFacingException('This file type is not accepted.');
        }

        // The content could not be identified at all: fall back to the name, but only for an allowed type.
        $named = self::normalize($file->getClientOriginalExtension());
        if (in_array($named, $allowed, true)) {
            return $named;
        }

        throw new UserFacingException('This file type is not accepted.');
    }

    /**
     * Every column that stores the path of an uploaded file, with the types it may hold:
     * [table, column, allowed extensions, holds a JSON list of paths].
     */
    public static function columns(): array
    {
        return [
            ['users',                         'validation_id',              self::IMAGE,   false],
            ['inventory_items',               'photo_path',                 self::IMAGE,   false],
            ['event_inventory_releases',      'evidence_photo_path',        self::IMAGE,   false],
            ['event_inventory_releases',      'extra_evidence_photo_paths', self::IMAGE,   true],
            ['inventory_unit_logs',           'photo_path',                 self::IMAGE,   false],
            ['inventory_unit_logs',           'extra_photo_paths',          self::IMAGE,   true],
            ['event_expenses',                'receipt_path',               self::RECEIPT, false],
            ['event_expenses',                'extra_receipt_paths',        self::RECEIPT, true],
        ];
    }

    /** Lower-case extension without the dot, with jpeg written as jpg. */
    public static function normalize(string $ext): string
    {
        $ext = strtolower(ltrim($ext, '.'));
        return $ext === 'jpeg' ? 'jpg' : $ext;
    }
}
