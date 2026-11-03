<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Groups the staff-managed current statuses so the resident form can
     * show them in labelled sections (and treat "employment" as pick-one)
     * instead of one flat checkbox list. Option ids are untouched, so
     * membership eligibility rules and recorded statuses keep working.
     * Unrecognised / staff-added options start as "other" until staff set
     * a category in Settings.
     */
    public function up(): void
    {
        Schema::table('current_statuses', function (Blueprint $table) {
            $table->string('category', 20)->default('other')->after('label');
        });

        $map = [
            'employment' => ['Unemployed', 'Student', 'Out-of-School Youth', 'Employed', 'Self-employed'],
            'household'  => ['Solo Parent', 'OFW Dependent'],
            'economic'   => ['Indigent', '4Ps Beneficiary'],
            'sector'     => ['Person with Disability (PWD)', 'Indigenous Person'],
        ];

        foreach ($map as $category => $labels) {
            DB::table('current_statuses')->whereIn('label', $labels)->update(['category' => $category]);
        }

        // Common options a barangay profile expects but the old list lacked
        // (employment / school only had Student, Unemployed, Out-of-School
        // Youth). Added only when missing; staff can rename or archive them.
        $extras = [
            ['Employed',          'employment'],
            ['Self-employed',     'employment'],
            ['Retired',           'employment'],
            ['4Ps Beneficiary',   'economic'],
            ['Indigenous Person', 'sector'],
        ];
        $next = (int) DB::table('current_statuses')->max('sort_order');
        foreach ($extras as [$label, $category]) {
            $exists = DB::table('current_statuses')->whereRaw('LOWER(TRIM(label)) = ?', [mb_strtolower($label)])->exists();
            if (!$exists) {
                DB::table('current_statuses')->insert([
                    'label' => $label, 'category' => $category, 'sort_order' => ++$next,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('current_statuses', function (Blueprint $table) {
            $table->dropColumn('category');
        });
    }
};
