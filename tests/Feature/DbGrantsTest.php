<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class DbGrantsTest extends TestCase
{
    use RefreshDatabase;

    private function sql(array $args = []): string
    {
        Artisan::call('db:grants', $args + ['--database' => 'piao_db']);

        return Artisan::output();
    }

    public function test_the_history_tables_get_no_delete_and_only_the_ledger_gets_update(): void
    {
        $sql = $this->sql();
        $this->assertStringContainsString("GRANT SELECT, INSERT ON `piao_db`.`activity_logs`", $sql);
        $this->assertStringContainsString("GRANT SELECT, INSERT ON `piao_db`.`generated_reports`", $sql);
        $this->assertStringContainsString("GRANT SELECT, INSERT, UPDATE ON `piao_db`.`inventory_unit_logs`", $sql);
        $this->assertStringContainsString("GRANT SELECT, INSERT ON `piao_db`.`attendance_scans`", $sql);
    }

    public function test_no_account_ever_gets_trigger_alter_drop_or_a_global_grant(): void
    {
        $lines = array_filter(explode("\n", $this->sql()), fn ($l) => str_starts_with($l, 'GRANT '));
        $this->assertNotEmpty($lines);
        foreach ($lines as $line) {
            foreach (['TRIGGER', 'ALTER', 'DROP', 'CREATE', 'ALL PRIVILEGES', 'GRANT OPTION', '*.*'] as $bad) {
                $this->assertStringNotContainsString($bad, $line, $bad);
            }
        }
    }

    public function test_every_table_is_listed_once_and_the_migrations_table_is_left_out(): void
    {
        $sql = $this->sql();
        $this->assertStringContainsString('`users`', $sql);
        $this->assertStringContainsString('`events`', $sql);
        $this->assertStringNotContainsString('`migrations`', $sql);
        $lines = array_values(array_filter(explode("\n", $sql), fn ($l) => str_starts_with($l, 'GRANT ')));
        $this->assertSame(count($lines), count(array_unique($lines)));
    }

    public function test_odd_names_are_refused_so_nothing_can_be_injected(): void
    {
        $this->assertSame(1, Artisan::call('db:grants', ['--user' => "x'; DROP USER y; --", '--database' => 'piao_db']));
    }
}
