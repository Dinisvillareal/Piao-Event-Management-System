<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;

/**
 * Prints the SQL that creates a restricted database account for the running application.
 *
 * Why: the triggers and the hash chain protect the records, but an account that may drop triggers or
 * rewrite the log tables could still undo them. The application account therefore gets only what it needs:
 *   - the three history tables: SELECT and INSERT (the ledger also UPDATE, for the one-time undo mark)
 *   - every other table: SELECT, INSERT, UPDATE, DELETE
 *   - never TRIGGER, ALTER, DROP, CREATE, or any global privilege
 * Migrations are run by a separate administrator account, never by this one.
 * The command only prints; it changes nothing, so it can be read and reviewed before it is run.
 */
class DbGrants extends Command
{
    protected $signature = 'db:grants {--user=piao_app : account name} {--host=localhost : host it connects from} {--database= : database name}';

    protected $description = 'Print the SQL for a restricted application database account (read it, then run it as the administrator).';

    /** table => privileges. Anything not listed gets the default. */
    public const HISTORY = [
        'activity_logs'      => 'SELECT, INSERT',
        'generated_reports'  => 'SELECT, INSERT',
        'inventory_unit_logs' => 'SELECT, INSERT, UPDATE',
    ];

    public const DEFAULT = 'SELECT, INSERT, UPDATE, DELETE';

    public function handle(): int
    {
        $db = $this->option('database') ?: config('database.connections.' . config('database.default') . '.database');
        $user = $this->option('user');
        $host = $this->option('host');
        if (! preg_match('/^[A-Za-z0-9_]+$/', (string) $user) || ! preg_match('/^[A-Za-z0-9_.%-]+$/', (string) $host) || ! preg_match('/^[A-Za-z0-9_]+$/', (string) $db)) {
            $this->error('The account, host and database names may only hold letters, digits, and _ . % -');

            return self::FAILURE;
        }

        $this->line("-- Run as the database administrator. Replace the password first.");
        $this->line("CREATE USER IF NOT EXISTS '{$user}'@'{$host}' IDENTIFIED BY 'CHANGE-THIS-PASSWORD';");
        $this->line("REVOKE ALL PRIVILEGES, GRANT OPTION FROM '{$user}'@'{$host}';");

        foreach ($this->tables() as $table) {
            $this->line("GRANT " . (self::HISTORY[$table] ?? self::DEFAULT) . " ON `{$db}`.`{$table}` TO '{$user}'@'{$host}';");
        }
        $this->line('FLUSH PRIVILEGES;');
        $this->line("-- Then set DB_USERNAME={$user} and DB_PASSWORD in .env. Keep the administrator account for `php artisan migrate` only.");

        return self::SUCCESS;
    }

    /** @return string[] */
    public function tables(): array
    {
        $names = array_map(fn ($t) => $t['name'], Schema::getTables());
        $names = array_values(array_unique(array_filter($names, fn ($n) => $n !== 'migrations')));
        sort($names);

        return $names;
    }
}
