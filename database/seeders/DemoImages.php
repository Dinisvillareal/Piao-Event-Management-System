<?php

namespace Database\Seeders;

use Illuminate\Support\Facades\Storage;

/**
 * Draws the demo attachments (receipts, resident ID photos, item photos, return photos) as small PNG
 * files on the public disk, so the screens that show an attachment have a real picture to show.
 *
 * Each one can be a PNG, a JPG (like a phone photo) or, for receipts, a PDF (like an e-receipt), so the
 * attachment lists look mixed like real ones.
 * They are named the way the app names its own uploads (the database refuses any other shape).
 * They are made with PHP's built-in GD extension. Every one is marked as sample data on purpose: it
 * looks like the real thing, but it is not a real receipt or ID. If GD is not switched on
 * (php.ini: extension=gd) nothing is drawn and the seeders simply leave the attachment empty.
 *
 * The files go to the same folders the app itself uses:
 *   expense_receipts/  validation_ids/  inventory_photos/  release_evidence_photos/
 * (run `php artisan storage:link` once if the pictures do not show in the browser).
 */
class DemoImages
{
    public static function available(): bool
    {
        return extension_loaded('gd') && function_exists('imagepng');
    }

    // ------------------------------------------------------------------ receipt

    /**
     * A small-shop receipt.
     *
     * @param  array<int, array{0:string,1:int,2:float}>  $lines  description, quantity, unit price
     */
    public static function receipt(string $store, string $place, string $date, string $no, array $lines, string $slug, string $format = 'png'): ?string
    {
        if (!self::available()) {
            return self::fromBundle($slug, 'expense_receipts', $format);
        }

        $w = 420;
        $h = 190 + count($lines) * 26 + 110;
        $im = imagecreatetruecolor($w, $h);
        $paper = self::c($im, 'fbfaf6');
        $ink = self::c($im, '2b2b2b');
        $grey = self::c($im, '8a8a8a');
        imagefill($im, 0, 0, $paper);
        imagerectangle($im, 0, 0, $w - 1, $h - 1, self::c($im, 'd9d6cc'));

        $y = 22;
        self::centered($im, $store, $w, $y, 17, $ink, true); $y += 28;
        self::centered($im, $place, $w, $y, 11, $grey); $y += 20;
        self::centered($im, 'OFFICIAL RECEIPT', $w, $y, 12, $ink, true); $y += 26;
        self::dashed($im, 18, $w - 18, $y, $grey); $y += 12;
        self::text($im, 20, $y, "OR No. $no", 11, $ink);
        self::right($im, $date, $w - 20, $y, 11, $ink); $y += 26;
        self::dashed($im, 18, $w - 18, $y, $grey); $y += 12;

        $total = 0.0;
        foreach ($lines as [$desc, $qty, $unit]) {
            $amount = $qty * $unit;
            $total += $amount;
            self::text($im, 20, $y, mb_strimwidth($desc, 0, 30, '.'), 11, $ink);
            self::right($im, number_format($amount, 2), $w - 20, $y, 11, $ink);
            self::text($im, 34, $y + 14, $qty . ' x ' . number_format($unit, 2), 9, $grey);
            $y += 32;
        }

        self::dashed($im, 18, $w - 18, $y, $grey); $y += 12;
        self::text($im, 20, $y, 'TOTAL', 14, $ink, true);
        self::right($im, 'PHP ' . number_format($total, 2), $w - 20, $y, 14, $ink, true); $y += 30;
        self::text($im, 20, $y, 'Cash', 11, $ink);
        self::right($im, number_format($total, 2), $w - 20, $y, 11, $ink); $y += 32;
        self::centered($im, 'Salamat po! Balik kayo ulit.', $w, $y, 11, $ink); $y += 22;
        self::centered($im, 'SAMPLE RECEIPT - DEMO DATA', $w, $y, 9, $grey);

        return self::save($im, 'expense_receipts', $slug, $format);
    }

    // ------------------------------------------------------------------ valid ID

    public static function idCard(string $name, string $birth, string $address, string $code, string $role, string $slug, string $format = 'png'): ?string
    {
        if (!self::available()) {
            return self::fromBundle($slug, 'validation_ids', $format);
        }

        $w = 640; $h = 400;
        $im = imagecreatetruecolor($w, $h);
        imagefill($im, 0, 0, self::c($im, 'eef3ee'));
        $green = self::c($im, '1f3a2d');
        $ink = self::c($im, '222222');
        $grey = self::c($im, '6b6b6b');

        imagefilledrectangle($im, 0, 0, $w, 78, $green);
        self::text($im, 24, 14, 'BARANGAY PIAO', 20, self::c($im, 'ffffff'), true);
        self::text($im, 24, 46, 'RESIDENT VALID ID', 13, self::c($im, 'cfe3d6'));

        // photo box with a plain silhouette
        imagefilledrectangle($im, 28, 110, 208, 320, self::c($im, 'd5ddd7'));
        imagefilledellipse($im, 118, 190, 70, 76, self::c($im, '9aa89f'));
        imagefilledellipse($im, 118, 300, 140, 120, self::c($im, '9aa89f'));
        imagefilledrectangle($im, 20, 321, 216, 380, self::c($im, 'eef3ee'));   // hide the shoulders below the box
        imagerectangle($im, 28, 110, 208, 320, $grey);

        $x = 236; $y = 112;
        foreach ([['NAME', $name], ['BIRTH DATE', $birth], ['ADDRESS', $address], ['ID NO.', $code], ['ROLE', $role]] as [$label, $value]) {
            self::text($im, $x, $y, $label, 9, $grey);
            self::text($im, $x, $y + 14, mb_strimwidth($value, 0, 34, '.'), 14, $ink, true);
            $y += 44;
        }

        imagefilledrectangle($im, 0, $h - 34, $w, $h, $green);
        self::centered($im, 'SAMPLE ID - DEMO DATA, NOT A REAL DOCUMENT', $w, $h - 26, 10, self::c($im, 'ffffff'));

        return self::save($im, 'validation_ids', $slug, $format);
    }

    // ------------------------------------------------------------------ item / return photo

    /**
     * A simple picture of an item, with a caption strip. $kind: chairs | tables | sound | tent | bp.
     * Pass a $banner (for example "Returned after Barangay Assembly") for a return photo.
     */
    public static function itemPhoto(string $kind, string $caption, string $slug, string $dir, ?string $banner = null, string $format = 'jpg'): ?string
    {
        if (!self::available()) {
            return self::fromBundle($slug, $dir, $format);
        }

        $w = 640; $h = 480;
        $im = imagecreatetruecolor($w, $h);
        imagefill($im, 0, 0, self::c($im, 'e8e3d8'));                                   // wall
        imagefilledrectangle($im, 0, 300, $w, $h, self::c($im, 'cbc2b2'));              // floor
        imagefilledrectangle($im, 0, 296, $w, 302, self::c($im, 'b9af9d'));

        match ($kind) {
            'chairs' => self::drawChairs($im),
            'tables' => self::drawTables($im),
            'sound' => self::drawSound($im),
            'tent' => self::drawTent($im),
            default => self::drawBp($im),
        };

        if ($banner) {
            imagefilledrectangle($im, 0, 0, $w, 44, self::c($im, '1f3a2d'));
            self::text($im, 18, 11, $banner, 15, self::c($im, 'ffffff'), true);
        }
        imagefilledrectangle($im, 0, $h - 46, $w, $h, self::c($im, '2b2b2b'));
        self::text($im, 18, $h - 36, mb_strimwidth($caption, 0, 60, '.'), 14, self::c($im, 'ffffff'));

        return self::save($im, $dir, $slug, $format);
    }

    private static function drawChairs($im): void
    {
        $plastic = self::c($im, 'f4f4f0'); $edge = self::c($im, '9c9c94'); $leg = self::c($im, '777770');
        foreach ([[70, 0], [250, 0], [430, 0]] as [$x]) {
            imagefilledrectangle($im, $x, 120, $x + 120, 230, $plastic);       // back
            imagerectangle($im, $x, 120, $x + 120, 230, $edge);
            imagefilledrectangle($im, $x - 10, 230, $x + 130, 262, $plastic);  // seat
            imagerectangle($im, $x - 10, 230, $x + 130, 262, $edge);
            foreach ([$x, $x + 112] as $lx) {
                imagefilledrectangle($im, $lx, 262, $lx + 8, 340, $leg);
            }
        }
    }

    private static function drawTables($im): void
    {
        $top = self::c($im, 'f1efe8'); $edge = self::c($im, '8f8a7c'); $leg = self::c($im, '6f6b60');
        imagefilledpolygon($im, [90, 190, 550, 190, 600, 250, 40, 250], $top);
        imagepolygon($im, [90, 190, 550, 190, 600, 250, 40, 250], $edge);
        imagesetthickness($im, 8);
        imageline($im, 90, 250, 150, 360, $leg); imageline($im, 150, 250, 90, 360, $leg);
        imageline($im, 490, 250, 550, 360, $leg); imageline($im, 550, 250, 490, 360, $leg);
        imagesetthickness($im, 1);
    }

    private static function drawSound($im): void
    {
        $box = self::c($im, '2e2e33'); $cone = self::c($im, '55555c'); $dot = self::c($im, '1a1a1d');
        imagefilledrectangle($im, 200, 90, 440, 330, $box);
        imagefilledellipse($im, 320, 160, 120, 120, $cone); imagefilledellipse($im, 320, 160, 40, 40, $dot);
        imagefilledellipse($im, 320, 270, 70, 70, $cone); imagefilledellipse($im, 320, 270, 22, 22, $dot);
        imagefilledrectangle($im, 470, 290, 484, 340, self::c($im, '3a3a40'));      // microphone
        imagefilledellipse($im, 477, 284, 30, 36, self::c($im, '8f8f98'));
    }

    private static function drawTent($im): void
    {
        $red = self::c($im, 'c4402f'); $white = self::c($im, 'f4f1ea'); $pole = self::c($im, '777770');
        imagesetthickness($im, 7);
        foreach ([120, 520] as $x) { imageline($im, $x, 190, $x, 340, $pole); }
        imagesetthickness($im, 1);
        imagefilledpolygon($im, [320, 70, 560, 190, 80, 190], $red);
        imagefilledpolygon($im, [320, 70, 380, 190, 260, 190], $white);
        imagefilledrectangle($im, 80, 190, 560, 214, $red);
        imagefilledrectangle($im, 260, 190, 380, 214, $white);
    }

    private static function drawBp($im): void
    {
        $body = self::c($im, 'f2f2f2'); $edge = self::c($im, '8a8a8a'); $screen = self::c($im, '1f4d3a'); $cuff = self::c($im, '33506b');
        imagefilledrectangle($im, 210, 140, 420, 290, $body); imagerectangle($im, 210, 140, 420, 290, $edge);
        imagefilledrectangle($im, 232, 162, 398, 226, $screen);
        self::text($im, 250, 172, '120/80', 26, self::c($im, 'c8f3dc'), true);
        imagefilledellipse($im, 315, 256, 30, 30, self::c($im, 'd44a3a'));
        imagefilledrectangle($im, 440, 210, 560, 300, $cuff);                         // cuff
        imagesetthickness($im, 5); imageline($im, 420, 250, 440, 250, self::c($im, '555555')); imagesetthickness($im, 1);
    }

    // ------------------------------------------------------------------ drawing helpers

    private static function c($im, string $hex): int
    {
        return imagecolorallocate($im, hexdec(substr($hex, 0, 2)), hexdec(substr($hex, 2, 2)), hexdec(substr($hex, 4, 2)));
    }

    /** A TrueType font if the machine has one, otherwise null (the built-in GD font is used instead). */
    private static function font(bool $bold): ?string
    {
        if (!function_exists('imagettftext')) {
            return null;
        }
        $files = $bold
            ? ['C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/calibrib.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf']
            : ['C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/calibri.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf'];
        foreach ($files as $f) {
            if (is_file($f)) {
                return $f;
            }
        }

        return null;
    }

    private static function width(string $s, int $size, bool $bold): int
    {
        if ($font = self::font($bold)) {
            $box = imagettfbbox($size * 0.75, 0, $font, $s);
            return (int) abs($box[2] - $box[0]);
        }

        return strlen($s) * imagefontwidth(self::builtin($size));
    }

    private static function builtin(int $size): int
    {
        return $size <= 10 ? 2 : ($size <= 13 ? 3 : ($size <= 16 ? 4 : 5));
    }

    private static function text($im, int $x, int $y, string $s, int $size, int $color, bool $bold = false): void
    {
        if ($font = self::font($bold)) {
            imagettftext($im, $size * 0.75, 0, $x, $y + (int) ($size * 0.95), $color, $font, $s);
            return;
        }
        imagestring($im, self::builtin($size), $x, $y, $s, $color);
    }

    private static function centered($im, string $s, int $w, int $y, int $size, int $color, bool $bold = false): void
    {
        self::text($im, (int) (($w - self::width($s, $size, $bold)) / 2), $y, $s, $size, $color, $bold);
    }

    private static function right($im, string $s, int $xRight, int $y, int $size, int $color, bool $bold = false): void
    {
        self::text($im, $xRight - self::width($s, $size, $bold), $y, $s, $size, $color, $bold);
    }

    private static function dashed($im, int $x1, int $x2, int $y, int $color): void
    {
        for ($x = $x1; $x < $x2; $x += 8) {
            imageline($im, $x, $y, min($x + 4, $x2), $y, $color);
        }
    }

    private static function save($im, string $dir, string $slug, string $format = 'png'): string
    {
        $w = imagesx($im);
        $h = imagesy($im);

        ob_start();
        if ($format === 'png') {
            imagepng($im);
        } else {
            imagejpeg($im, null, 90); // jpg, and the picture inside a pdf
        }
        $bytes = ob_get_clean();
        imagedestroy($im);

        if ($format === 'pdf') {
            $bytes = self::pdf($bytes, $w, $h);
        }
        $ext = in_array($format, ['jpg', 'pdf'], true) ? $format : 'png';

        return self::store($bytes, $dir, $slug, $ext);
    }

    /** Where the ready-made pictures live, for a PHP that has no GD (see fromBundle). */
    private static function bundleDir(): string
    {
        return __DIR__ . '/demo-images';
    }

    /** True when the pictures can be made (GD on) or copied (the demo-images folder is there). */
    public static function ready(): bool
    {
        return self::available() || (is_dir(self::bundleDir()) && glob(self::bundleDir() . '/*.*') !== []);
    }

    /** The file name part the app expects, made from the picture's slug. */
    private static function cleanName(string $slug): string
    {
        return trim(preg_replace('/[^a-z0-9]+/', '_', strtolower($slug)), '_');
    }

    /**
     * No GD? Use the same pictures, already drawn and saved in database/seeders/demo-images,
     * so the demo looks the same on every computer.
     */
    private static function fromBundle(string $slug, string $dir, string $format): ?string
    {
        $ext = in_array($format, ['jpg', 'pdf'], true) ? $format : 'png';
        $file = self::bundleDir() . '/' . self::cleanName($slug) . '.' . $ext;
        if (!is_file($file)) {
            return null;
        }

        return self::store(file_get_contents($file), $dir, $slug, $ext, false);
    }

    /**
     * The same shape the app gives every file it saves (the database refuses any other):
     * folder / 10-digit timestamp _ [6 random letters or digits for inventory photos] _ name . extension
     */
    private static function store(string $bytes, string $dir, string $slug, string $ext, bool $record = true): string
    {
        $name = self::cleanName($slug);
        $random = $dir === 'inventory_photos' ? \Illuminate\Support\Str::random(6) . '_' : '';
        $path = $dir . '/' . time() . '_' . $random . 'demo_' . $name . '.' . $ext;
        Storage::disk('public')->put($path, $bytes);

        // (used once, to make the demo-images folder) keep a copy of every picture that is drawn
        if ($record && ($copyTo = getenv('DEMO_IMAGES_COPY_TO'))) {
            @mkdir($copyTo, 0777, true);
            file_put_contents($copyTo . '/' . $name . '.' . $ext, $bytes);
        }

        return $path;
    }

    /** A one-page PDF that holds the JPEG picture, the page being the size of the picture. */
    private static function pdf(string $jpeg, int $w, int $h): string
    {
        $content = "q $w 0 0 $h 0 0 cm /Im0 Do Q";
        $objects = [
            1 => '<< /Type /Catalog /Pages 2 0 R >>',
            2 => '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            3 => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 $w $h] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
            4 => "<< /Type /XObject /Subtype /Image /Width $w /Height $h /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " . strlen($jpeg) . " >>\nstream\n" . $jpeg . "\nendstream",
            5 => '<< /Length ' . strlen($content) . " >>\nstream\n" . $content . "\nendstream",
        ];

        $out = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objects as $n => $body) {
            $offsets[$n] = strlen($out);
            $out .= "$n 0 obj\n$body\nendobj\n";
        }
        $xref = strlen($out);
        $out .= "xref\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";
        foreach ($offsets as $o) {
            $out .= sprintf("%010d 00000 n \n", $o);
        }
        $out .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n$xref\n%%EOF\n";

        return $out;
    }
}
