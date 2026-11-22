<?php

namespace App\Console\Commands;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Random\Engine\Mt19937;
use Random\Randomizer;

/**
 * Draws the survey respondents at random from the resident list, inside age quotas, with
 * backups. Read-only: it never changes the database. Use the same --seed to get the same draw.
 */
class SurveyDraw extends Command
{
    protected $signature = 'survey:draw {--seed= : number that makes the draw repeatable} {--backups=5 : backups per age group}';

    protected $description = 'Randomly pick the survey respondents (50 by default) by age group, plus backups';

    /** age group => [from, to, how many] */
    private const GROUPS = [
        '18-30' => [18, 30, 15],
        '31-45' => [31, 45, 15],
        '46-59' => [46, 59, 10],
        '60+'   => [60, 150, 10],
    ];

    public function handle(): int
    {
        $seed = $this->option('seed') !== null ? (int) $this->option('seed') : random_int(1, 999999);
        $backups = max(0, (int) $this->option('backups'));
        $random = new Randomizer(new Mt19937($seed));
        $rows = [];

        $residents = User::where('role', 'Resident')->whereNotNull('birth_date')->orderBy('user_code')->get();

        foreach (self::GROUPS as $label => [$from, $to, $quota]) {
            $pool = $residents->filter(fn ($u) => Carbon::parse($u->birth_date)->age >= $from && Carbon::parse($u->birth_date)->age <= $to)->values()->all();
            $picked = $random->shuffleArray($pool);

            if (count($picked) < $quota) {
                $this->warn("Age {$label}: only " . count($picked) . " eligible residents, quota is {$quota}.");
            }

            foreach (array_slice($picked, 0, $quota + $backups) as $i => $u) {
                $rows[] = [
                    $label,
                    $i < $quota ? 'Respondent ' . ($i + 1) : 'Backup ' . ($i - $quota + 1),
                    $u->user_code,
                    trim($u->first_name . ' ' . $u->last_name),
                    Carbon::parse($u->birth_date)->age,
                ];
            }
        }

        $this->table(['Age group', 'Role', 'Code', 'Name', 'Age'], $rows);
        $this->info('Seed: ' . $seed . '  (run again with --seed=' . $seed . ' to get the same list)');

        $path = storage_path('app/survey-draw-' . $seed . '.csv');
        $out = fopen($path, 'w');
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, ['Age group', 'Role', 'Code', 'Name', 'Age']);
        foreach ($rows as $r) {
            fputcsv($out, $r);
        }
        fclose($out);
        $this->info('Saved: ' . $path);

        return self::SUCCESS;
    }
}
