<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Nothing the person sees may silently fall back to English.
 *
 *  - every message the server sends (messages, errors, thrown user-facing exceptions) has a Filipino and a
 *    Bisaya version in lang/{tl,ceb}/messages.php;
 *  - every interface text in resources/js/i18n has an English, Filipino and Bisaya version, with the same
 *    {placeholders};
 *  - a Filipino or Bisaya text identical to the English one is only allowed for names, codes and loanwords
 *    listed below -- a NEW untranslated text fails the test until it is translated (or listed on purpose);
 *  - every t("key") used in a screen exists;
 *  - a screen shows dates in the app language and never writes a user-facing error in English by hand.
 *
 * Adding a text without its translations, or a server message without a lang entry, fails here.
 */
class TranslationCoverageTest extends TestCase
{
    /** Interface texts whose Filipino / Bisaya wording is deliberately the same as English (names, codes, loanwords). */
    private const SAME_AS_ENGLISH_TL = [
        'dashboard', 'scan', 'timestampColumnLabel', 'moduleColumnLabel', 'contactNumberPlaceholder',
        'secAccountTitle', 'secTwoStepBadge', 'secHeadStaff', 'secSectionAccount', 'secStock', 'facebookPageTitle',
        'facebookPageIdLabel', 'pageAccessTokenLabel', 'printBarangayLabel', 'printAddressLabel', 'printSystemName',
        'ageSenior', 'itemColumn', 'liveLabel', 'coverPhotoLabel', 'fileLabel', 'archiveActivityOption', 'okLabel',
        'locationPlaceholder', 'idColumn', 'idFieldLabel', 'purokPlaceholder', 'resExportExcel', 'resExportPdf',
        'usernameLabel', 'passwordLabel', 'ageGroupSeniorOption', 'cameraScannerLabel', 'cameraScanLabel',
        'signInWord', 'signOutWord', 'liveBadge', 'systemQrTitle', 'systemQrName', 'relMinutes', 'rptColId',
        'rptColContact', 'rptRowPresent', 'rptRowAbsent', 'rptStatPresent', 'rptStatAbsent', 'rptColItem',
        'fltMembership', 'fltEvent', 'tabHeadStaff', 'uiMonthShort3', 'uiMonthShort5', 'uiWeekdayShort6', 'uiMin',
        'uiLogoAlt', 'uiSplashPortal', 'resPurok', 'resAccount', 'rcOrg', 'rcAccount', 'rcUserCode', 'rcBarangay',
        'rcAddress', 'rcSystem', 'rcDocRole', 'memFeedbackTab', 'fbShortMinutes', 'cmtStaff', 'loginLogoAlt',
        'loginBarangayWord', 'dashLogoAlt', 'rpLive', 'rpPresetCustom', 'rpPtsSuffix', 'rpFormatHeading', 'rpFmtPdf',
        'rpFmtWord', 'rpFmtCsv', 'rpPreview', 'rpHistFormat', 'activityFieldItem', 'actCol_ip',
    ];

    private const SAME_AS_ENGLISH_CEB = [
        'dashboard', 'scan', 'timestampColumnLabel', 'moduleColumnLabel', 'staffColumnLabel',
        'contactNumberPlaceholder', 'secAccountTitle', 'secTwoStepBadge', 'secHeadStaff', 'secSectionAccount',
        'secStock', 'facebookPageTitle', 'facebookPageIdLabel', 'pageAccessTokenLabel', 'reportForLabel',
        'printBarangayLabel', 'printAddressLabel', 'printSystemName', 'ageSenior', 'itemColumn', 'liveLabel',
        'coverPhotoLabel', 'fileLabel', 'archiveActivityOption', 'okLabel', 'locationPlaceholder', 'suffixLabel',
        'idColumn', 'idFieldLabel', 'staffOption', 'purokPlaceholder', 'resExportExcel', 'resExportPdf',
        'usernameLabel', 'passwordLabel', 'ageGroupSeniorOption', 'cameraScannerLabel', 'cameraScanLabel',
        'scanModeStep3', 'signInWord', 'signOutWord', 'genderLabel', 'liveBadge', 'systemQrTitle', 'systemQrName',
        'relMinutes', 'rptColId', 'rptColGender', 'rptColContact', 'rptRowPresent', 'rptRowAbsent', 'rptStatPresent',
        'rptStatAbsent', 'rptColItem', 'rptTotalLabel', 'staffBadge', 'fltMembership', 'fltEvent', 'tabHeadStaff',
        'uiMonthShort3', 'uiMonthShort5', 'uiMonthShort9', 'uiWeekdayShort6', 'uiMin', 'uiLogoAlt', 'uiSplashPortal',
        'resPurok', 'resAccount', 'rcOrg', 'rcAccount', 'rcUserCode', 'rcBarangay', 'rcAddress', 'rcSystem',
        'rcDocRole', 'memFeedbackTab', 'fbShortMinutes', 'cmtStaff', 'loginLogout', 'loginLogoAlt',
        'loginBarangayWord', 'dashLogoAlt', 'dashStaffAdminRole', 'rpLive', 'rpPresetCustom', 'rpPtsSuffix',
        'rpFormatHeading', 'rpFmtPdf', 'rpFmtWord', 'rpFmtCsv', 'rpPreview', 'rpHistType', 'rpHistFormat',
        'rpAudGender', 'activityFieldItem', 'actCol_ip',
    ];

    /** Documents that are English by design (printed/exported reports) may format dates without the app language. */
    private const ENGLISH_DOCUMENT_FILES = [
        'lib/expenseReportExport.ts', 'lib/residentsExport.ts', 'lib/tableExport.ts', 'lib/activityLogExport.ts', 'lib/reportExcelExport.ts', 'lib/reportMessage.ts',
    ];

    // ---------------------------------------------------------------- server messages

    /** Every user-facing sentence the server can send, as a template with {1}, {2}... for values. */
    private function serverMessages(): array
    {
        $found = [];
        $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(app_path(), \FilesystemIterator::SKIP_DOTS));
        foreach ($files as $file) {
            if ($file->getExtension() !== 'php') {
                continue;
            }
            $src = file_get_contents($file->getPathname());
            // Comments are not messages.
            $src = preg_replace('~^\s*(//|\*|/\*|#).*$~m', '', $src);
            $name = str_replace(app_path() . DIRECTORY_SEPARATOR, '', $file->getPathname());

            $starts = [];
            if (preg_match_all('~[\'"](?:message|error)[\'"]\s*=>\s*~', $src, $m, PREG_OFFSET_CAPTURE)) {
                foreach ($m[0] as [$t, $o]) { $starts[] = $o + strlen($t); }
            }
            if (preg_match_all('~UserFacingException\(\s*~', $src, $m, PREG_OFFSET_CAPTURE)) {
                foreach ($m[0] as [$t, $o]) { $starts[] = $o + strlen($t); }
            }
            // 'field' => ['Text'] inside an 'errors' array or ValidationException::withMessages([...])
            if (preg_match_all('~[\'"]\w+[\'"]\s*=>\s*\[\s*~', $src, $m, PREG_OFFSET_CAPTURE)) {
                foreach ($m[0] as [$t, $o]) {
                    $before = substr($src, max(0, $o - 400), min(400, $o));
                    if (str_contains($before, "'errors'") || str_contains($before, '"errors"') || str_contains($before, 'withMessages')) {
                        $starts[] = $o + strlen($t);
                    }
                }
            }

            foreach ($starts as $at) {
                $text = $this->parseTemplate($src, $at);
                // A sentence starts with a capital; this skips validation rules ('nullable|boolean') and codes.
                if ($text !== null && preg_match('/^[A-Z"].*[a-z]/s', $text)) {
                    $found[$text][] = $name;
                }
            }
        }
        ksort($found);

        return $found;
    }

    /** Reads "'a ' . $x . ' b'" (or an interpolated "..{$x}..") from $i; null if it does not start with a string. */
    private function parseTemplate(string $s, int $i): ?string
    {
        $parts = [];
        $n = strlen($s);
        $first = true;
        while ($i < $n) {
            while ($i < $n && ctype_space($s[$i])) { $i++; }
            if ($i >= $n) { break; }
            $c = $s[$i];
            if ($c === "'" || $c === '"') {
                $buf = '';
                $k = $i + 1;
                while ($k < $n && $s[$k] !== $c) {
                    if ($s[$k] === '\\' && $k + 1 < $n) {
                        $nx = $s[$k + 1];
                        if (($c === "'" && ($nx === "'" || $nx === '\\')) || ($c === '"' && ($nx === '"' || $nx === '\\' || $nx === '$'))) {
                            $buf .= $nx;
                        } else {
                            $buf .= $s[$k] . $nx;
                        }
                        $k += 2;
                        continue;
                    }
                    $buf .= $s[$k++];
                }
                if ($c === '"') {
                    $buf = preg_replace('/\{\$[^}]*\}/', "\0", $buf);
                    $buf = preg_replace('/\$\w+(?:->\w+)*(?:\[[^\]]*\])?/', "\0", $buf);
                }
                $parts[] = $buf;
                $i = $k + 1;
            } else {
                if ($first) { return null; }
                $d = 0;
                $k = $i;
                while ($k < $n) {
                    $ch = $s[$k];
                    if ($ch === "'" || $ch === '"') {
                        $q = $ch; $k++;
                        while ($k < $n && $s[$k] !== $q) { $k += $s[$k] === '\\' ? 2 : 1; }
                        $k++;
                        continue;
                    }
                    if (strpos('([{', $ch) !== false) { $d++; }
                    elseif (strpos(')]}', $ch) !== false) { if ($d === 0) { break; } $d--; }
                    elseif ($d === 0 && ($ch === ',' || ($ch === '.' && !ctype_digit($s[$k + 1] ?? '')))) { break; }
                    $k++;
                }
                $parts[] = "\0";
                $i = $k;
            }
            $first = false;
            while ($i < $n && ctype_space($s[$i])) { $i++; }
            if ($i < $n && $s[$i] === '.' && !ctype_digit($s[$i + 1] ?? '')) { $i++; continue; }
            break;
        }

        $out = '';
        $count = 0;
        foreach ($parts as $p) {
            while (($pos = strpos($p, "\0")) !== false) {
                $p = substr($p, 0, $pos) . '{' . (++$count) . '}' . substr($p, $pos + 1);
            }
            $out .= $p;
        }

        return $out;
    }

    public function test_every_server_message_has_a_filipino_and_a_bisaya_translation(): void
    {
        $messages = $this->serverMessages();
        $this->assertGreaterThan(150, count($messages), 'the message scan found far fewer messages than expected -- the scanner is broken');

        foreach (['tl' => 'Filipino', 'ceb' => 'Bisaya'] as $locale => $name) {
            $lang = require lang_path("{$locale}/messages.php");
            $missing = [];
            foreach ($messages as $text => $where) {
                if (!isset($lang[$text]) || trim((string) $lang[$text]) === '') {
                    $missing[] = $text . '   [' . $where[0] . ']';
                }
            }
            $this->assertSame([], $missing, "These server messages have no {$name} translation in lang/{$locale}/messages.php:\n" . implode("\n", $missing));
        }
    }

    public function test_filipino_and_bisaya_message_files_cover_the_same_messages_and_translate_them(): void
    {
        $tl = require lang_path('tl/messages.php');
        $ceb = require lang_path('ceb/messages.php');

        $this->assertSame([], array_values(array_diff(array_keys($tl), array_keys($ceb))), 'in Filipino only');
        $this->assertSame([], array_values(array_diff(array_keys($ceb), array_keys($tl))), 'in Bisaya only');
        foreach (['tl' => $tl, 'ceb' => $ceb] as $loc => $lang) {
            foreach ($lang as $en => $tr) {
                $this->assertNotSame('', trim($tr), "[$loc] empty translation for: $en");
            }
        }
    }

    // ---------------------------------------------------------------- interface texts

    private function jsDir(): string
    {
        $dir = resource_path('js');
        if (!is_dir($dir . '/i18n')) {
            $this->markTestSkipped('The frontend sources are not on this machine.');
        }

        return $dir;
    }

    /** @return array<string, array<string, array{en: ?string, tl: ?string, ceb: ?string}>> file => key => texts */
    private function dictionaries(): array
    {
        $dir = $this->jsDir() . '/i18n';
        $files = array_merge([$dir . '/translations.ts'], glob($dir . '/locales/*.ts'));
        $all = [];
        foreach ($files as $file) {
            $src = file_get_contents($file);
            $rel = str_replace($dir . '/', '', $file);
            preg_match_all('~(?:^|\n)\s*"?([A-Za-z0-9_]+)"?\s*:\s*\{\s*en\s*:~', $src, $m, PREG_OFFSET_CAPTURE);
            foreach ($m[1] as $idx => [$key, $_]) {
                $open = strpos($src, '{', $m[0][$idx][1]);
                $body = $this->braceBody($src, $open);
                $entry = ['en' => null, 'tl' => null, 'ceb' => null];
                foreach (['en', 'tl', 'ceb'] as $lang) {
                    if (preg_match('~\b' . $lang . '\s*:\s*("(?:[^"\\\\]|\\\\.)*"|`(?:[^`\\\\]|\\\\.)*`|\'(?:[^\'\\\\]|\\\\.)*\')~s', $body, $v)) {
                        $entry[$lang] = substr($v[1], 1, -1);
                    }
                }
                $all[$rel][$key] = $entry;
            }
        }

        return $all;
    }

    /** The text between the { at $open and its matching }, ignoring braces inside strings. */
    private function braceBody(string $s, int $open): string
    {
        $depth = 0;
        $n = strlen($s);
        for ($i = $open; $i < $n; $i++) {
            $c = $s[$i];
            if ($c === '"' || $c === "'" || $c === '`') {
                for ($i++; $i < $n && $s[$i] !== $c; $i++) {
                    if ($s[$i] === '\\') { $i++; }
                }
                continue;
            }
            if ($c === '{') { $depth++; }
            if ($c === '}' && --$depth === 0) {
                return substr($s, $open + 1, $i - $open - 1);
            }
        }

        return substr($s, $open + 1);
    }

    private function placeholders(string $text): array
    {
        preg_match_all('/\{[A-Za-z0-9_]+\}/', $text, $m);
        $found = array_unique($m[0]);
        sort($found);

        return $found;
    }

    public function test_every_interface_text_has_english_filipino_and_bisaya_with_the_same_placeholders(): void
    {
        $dicts = $this->dictionaries();
        $total = array_sum(array_map('count', $dicts));
        $this->assertGreaterThan(2000, $total, 'the dictionary scan found far fewer texts than expected -- the scanner is broken');

        $problems = [];
        foreach ($dicts as $file => $entries) {
            foreach ($entries as $key => $e) {
                foreach (['en', 'tl', 'ceb'] as $lang) {
                    if ($e[$lang] === null || trim($e[$lang]) === '') {
                        $problems[] = "{$file}: {$key} has no {$lang} text";
                    }
                }
                if ($e['en'] !== null) {
                    foreach (['tl', 'ceb'] as $lang) {
                        if ($e[$lang] !== null && $this->placeholders($e['en']) !== $this->placeholders($e[$lang])) {
                            $problems[] = "{$file}: {$key} {$lang} text does not keep the placeholders of the English text";
                        }
                    }
                }
            }
        }

        $this->assertSame([], $problems, implode("\n", $problems));
    }

    public function test_no_text_is_defined_twice(): void
    {
        $seen = [];
        $twice = [];
        foreach ($this->dictionaries() as $file => $entries) {
            foreach (array_keys($entries) as $key) {
                if (isset($seen[$key])) {
                    $twice[] = "{$key} ({$seen[$key]} and {$file})";
                }
                $seen[$key] = $file;
            }
        }

        $this->assertSame([], $twice, "A key defined in two places: the later one silently wins.\n" . implode("\n", $twice));
    }

    public function test_a_filipino_or_bisaya_text_may_equal_the_english_one_only_when_listed(): void
    {
        $untranslated = [];
        foreach ($this->dictionaries() as $file => $entries) {
            foreach ($entries as $key => $e) {
                if ($e['en'] === null || !preg_match('/[A-Za-z]{3}/', $e['en'])) {
                    continue;
                }
                if ($e['tl'] === $e['en'] && !in_array($key, self::SAME_AS_ENGLISH_TL, true)) {
                    $untranslated[] = "{$key} (Filipino): {$e['en']}";
                }
                if ($e['ceb'] === $e['en'] && !in_array($key, self::SAME_AS_ENGLISH_CEB, true)) {
                    $untranslated[] = "{$key} (Bisaya): {$e['en']}";
                }
            }
        }

        $this->assertSame([], $untranslated, "These texts are still English. Translate them, or list them in the SAME_AS_ENGLISH lists if English is right.\n" . implode("\n", $untranslated));
    }

    public function test_the_same_as_english_lists_only_hold_texts_that_really_are_the_same(): void
    {
        $dicts = array_merge(...array_values($this->dictionaries()));
        $stale = [];
        foreach (self::SAME_AS_ENGLISH_TL as $key) {
            if (!isset($dicts[$key]) || $dicts[$key]['tl'] !== $dicts[$key]['en']) { $stale[] = "{$key} (Filipino)"; }
        }
        foreach (self::SAME_AS_ENGLISH_CEB as $key) {
            if (!isset($dicts[$key]) || $dicts[$key]['ceb'] !== $dicts[$key]['en']) { $stale[] = "{$key} (Bisaya)"; }
        }

        $this->assertSame([], $stale, "Remove these from the SAME_AS_ENGLISH lists (they are translated or gone):\n" . implode("\n", $stale));
    }

    // ---------------------------------------------------------------- screens

    /** @return array<string, string> relative path => source with comment lines blanked */
    private function screenSources(): array
    {
        $dir = $this->jsDir();
        $out = [];
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS));
        foreach ($it as $file) {
            if (!in_array($file->getExtension(), ['ts', 'tsx'], true)) { continue; }
            $rel = str_replace($dir . '/', '', $file->getPathname());
            if (str_starts_with($rel, 'i18n/')) { continue; }
            $out[$rel] = preg_replace('~^\s*(//|\*|/\*).*$~m', '', file_get_contents($file->getPathname()));
        }

        return $out;
    }

    public function test_every_text_a_screen_asks_for_exists(): void
    {
        $defined = [];
        foreach ($this->dictionaries() as $entries) {
            $defined += $entries;
        }

        $missing = [];
        foreach ($this->screenSources() as $rel => $src) {
            if (preg_match_all('~\bt\(\s*["\']([A-Za-z0-9_]+)["\']\s*\)~', $src, $m)) {
                foreach (array_unique($m[1]) as $key) {
                    if (!isset($defined[$key])) {
                        $missing[] = "{$key}  [{$rel}]";
                    }
                }
            }
        }

        $this->assertSame([], $missing, "These t(\"key\") calls have no entry, so the raw key would show on screen:\n" . implode("\n", $missing));
    }

    public function test_screens_show_dates_in_the_app_language(): void
    {
        $bad = [];
        foreach ($this->screenSources() as $rel => $src) {
            if (in_array($rel, self::ENGLISH_DOCUMENT_FILES, true)) { continue; }
            // new Date(...).toLocaleString() / toLocaleDateString() / toLocaleTimeString() with no language given
            if (preg_match_all('~new Date\((?:[^()]|\([^()]*\))*\)\.toLocale(?:Date|Time)?String\(\s*\)~', $src, $m)) {
                foreach ($m[0] as $call) {
                    $bad[] = "{$rel}: {$call}";
                }
            }
        }

        $this->assertSame([], $bad, "Pass the app language (locale from useLanguage) so the date follows it:\n" . implode("\n", $bad));
    }

    public function test_screens_never_write_a_user_facing_error_in_english_by_hand(): void
    {
        $bad = [];
        foreach ($this->screenSources() as $rel => $src) {
            if (preg_match_all('~\bset\w*(?:Error|Message|Note|Msg)\(\s*(["\'`])[A-Z][A-Za-z ,\'.!?-]{6,}\1~', $src, $m)) {
                foreach ($m[0] as $call) {
                    $bad[] = "{$rel}: {$call}";
                }
            }
        }

        $this->assertSame([], $bad, "Use t(\"key\") so the text can be translated:\n" . implode("\n", $bad));
    }
}
