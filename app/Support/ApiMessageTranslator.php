<?php

namespace App\Support;

/**
 * Translates the English messages that controllers put in JSON responses
 * (message / error / errors) into Filipino (tl) or Bisaya (ceb).
 *
 * Source of truth: lang/{locale}/messages.php — English template => translation,
 * where {1}, {2}… stand for dynamic values (names, counts, times). Values that
 * are themselves known messages are translated too (e.g. "Failed to create
 * event: Not enough stock…").
 */
class ApiMessageTranslator
{
    /** @var array<string, array{exact: array<string,string>, patterns: array<int, array{0:string,1:array<int,int>,2:string}>}> */
    private static array $compiled = [];

    public const SUPPORTED = ['tl', 'ceb'];

    public static function translate(string $text, string $locale, int $depth = 0): string
    {
        if (! in_array($locale, self::SUPPORTED, true) || $text === '' || $depth > 3) {
            return $text;
        }
        $c = self::compiled($locale);
        $trim = trim($text);
        if (isset($c['exact'][$trim])) {
            return $c['exact'][$trim];
        }
        foreach ($c['patterns'] as [$regex, $map, $tr]) {
            if (preg_match($regex, $trim, $m)) {
                $values = [];
                foreach ($map as $i => $n) {
                    $values[$n] = self::translate($m[$i + 1], $locale, $depth + 1);
                }
                return preg_replace_callback('/\{(\d+)\}/', fn ($x) => $values[(int) $x[1]] ?? $x[0], $tr);
            }
        }
        return $text;
    }

    /** Walks only the message-carrying keys of a decoded JSON payload. */
    public static function translatePayload(mixed $data, string $locale): mixed
    {
        if (! is_array($data)) {
            return $data;
        }
        foreach (['message', 'error', 'warning'] as $key) {
            if (isset($data[$key]) && is_string($data[$key])) {
                $data[$key] = self::translate($data[$key], $locale);
            }
        }
        if (isset($data['errors']) && is_array($data['errors'])) {
            $data['errors'] = self::walk($data['errors'], $locale);
        }
        return $data;
    }

    private static function walk(array $node, string $locale): array
    {
        foreach ($node as $k => $v) {
            if (is_string($v)) {
                $node[$k] = self::translate($v, $locale);
            } elseif (is_array($v)) {
                $node[$k] = self::walk($v, $locale);
            }
        }
        return $node;
    }

    private static function compiled(string $locale): array
    {
        if (isset(self::$compiled[$locale])) {
            return self::$compiled[$locale];
        }
        $file = lang_path($locale . '/messages.php');
        $table = is_file($file) ? (array) require $file : [];
        $exact = [];
        $patterns = [];
        foreach ($table as $en => $tr) {
            if (! preg_match('/\{\d+\}/', $en)) {
                $exact[$en] = $tr;
                continue;
            }
            $parts = preg_split('/\{(\d+)\}/', $en, -1, PREG_SPLIT_DELIM_CAPTURE);
            $re = '';
            $map = [];
            foreach ($parts as $i => $p) {
                if ($i % 2 === 0) {
                    $re .= preg_quote($p, '/');
                } else {
                    $re .= '(.*?)';
                    $map[] = (int) $p;
                }
            }
            $patterns[] = ['/^' . $re . '$/su', $map, $tr, strlen($en)];
        }
        usort($patterns, fn ($a, $b) => $b[3] <=> $a[3]);
        $patterns = array_map(fn ($p) => [$p[0], $p[1], $p[2]], $patterns);
        return self::$compiled[$locale] = ['exact' => $exact, 'patterns' => $patterns];
    }
}
