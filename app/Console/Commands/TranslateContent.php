<?php

namespace App\Console\Commands;

use App\Models\AgeBracket;
use App\Models\CivilStatus;
use App\Models\ContentTranslation;
use App\Models\CurrentStatus;
use App\Models\Event;
use App\Models\EventExpense;
use App\Models\Feedback;
use App\Models\InventoryItem;
use App\Models\Membership;
use Illuminate\Console\Command;
use Stichoza\GoogleTranslate\GoogleTranslate;

class TranslateContent extends Command
{
    protected $signature = 'content:translate';
    protected $description = 'Translate all DB content into tl/ceb and store in content_translations';

    public function handle()
    {
        if (! class_exists(GoogleTranslate::class)) {
            $this->error('The translation package is not installed yet.');
            $this->line('Run:  composer require stichoza/google-translate-php');
            $this->line('Then run this command again.');
            return self::FAILURE;
        }

        $locales = ['tl' => 'fil', 'ceb' => 'ceb'];

        $strings = [];

        // Memberships
        foreach (Membership::withoutTrashed()->get() as $m) {
            foreach (['name', 'description'] as $f) {
                if ($m->$f) $strings[] = $m->$f;
            }
        }

        // Events
        foreach (Event::withoutTrashed()->get() as $e) {
            foreach (['name', 'description', 'location', 'notification_message'] as $f) {
                if ($e->$f) $strings[] = $e->$f;
            }
        }

        // Inventory
        foreach (InventoryItem::withoutTrashed()->get() as $i) {
            foreach (['name', 'notes', 'storage_location'] as $f) {
                if ($i->$f) $strings[] = $i->$f;
            }
        }

        // Event expenses (budget)
        foreach (EventExpense::withTrashed()->get() as $x) {
            foreach (['item', 'notes'] as $f) {
                if ($x->$f) $strings[] = $x->$f;
            }
        }

        // Civil statuses
        foreach (CivilStatus::withTrashed()->get() as $c) {
            if ($c->label) $strings[] = $c->label;
        }

        // Current statuses
        foreach (CurrentStatus::withTrashed()->get() as $c) {
            if ($c->label) $strings[] = $c->label;
        }

        // Age brackets
        foreach (AgeBracket::withTrashed()->get() as $a) {
            if ($a->label) $strings[] = $a->label;
        }

        // Feedback comments (optional, but included since they're user-visible)
        foreach (Feedback::all() as $fb) {
            if ($fb->comment) $strings[] = $fb->comment;
        }

        $strings = array_values(array_unique(array_filter($strings)));
        $this->info("Collected " . count($strings) . " unique strings to translate.");

        foreach ($locales as $ourCode => $googleCode) {
            $this->info("Translating to {$ourCode} ({$googleCode})...");
            $bar = $this->output->createProgressBar(count($strings));
            $bar->start();

            foreach ($strings as $text) {
                $exists = ContentTranslation::where('key', $text)
                    ->where('locale', $ourCode)
                    ->exists();
                if ($exists) {
                    $bar->advance();
                    continue;
                }

                try {
                    $tr = new GoogleTranslate('en');
                    $tr->setTarget($googleCode);
                    $translated = $tr->translate($text);

                    ContentTranslation::create([
                        'key'    => $text,
                        'locale' => $ourCode,
                        'value'  => $translated,
                    ]);
                } catch (\Exception $e) {
                    $this->newLine();
                    $this->error("Failed: " . substr($text, 0, 50) . " — " . $e->getMessage());
                }
                $bar->advance();
            }
            $bar->finish();
            $this->newLine();
        }

        $this->info('DONE.');
        return 0;
    }
}