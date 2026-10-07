<?php

namespace App\Http\Controllers;

use App\Support\BarangayOfficials;

class BarangayOfficialController extends Controller
{
    /**
     * Current Barangay Captain and Secretary (formal "HON. ..." names), used by
     * the ID card, report previews and exports. Readable by any signed-in user.
     */
    public function index()
    {
        return response()->json(BarangayOfficials::current());
    }
}
