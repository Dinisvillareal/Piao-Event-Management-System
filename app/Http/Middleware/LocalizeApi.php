<?php

namespace App\Http\Middleware;

use App\Support\ApiMessageTranslator;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Sets the request locale from the user's interface language (the plain
 * `piao_lang` cookie the SPA writes, or an X-Lang header) and translates the
 * message text in JSON responses to Filipino / Bisaya. English is the default
 * and is left untouched.
 */
class LocalizeApi
{
    public function handle(Request $request, Closure $next): Response
    {
        $locale = $request->cookies->get('piao_lang') ?: $request->header('X-Lang');
        $locale = in_array($locale, ApiMessageTranslator::SUPPORTED, true) ? $locale : 'en';
        app()->setLocale($locale);

        $response = $next($request);

        if ($locale !== 'en' && $response instanceof JsonResponse) {
            $content = (string) $response->getContent();
            if (str_contains($content, '"message"') || str_contains($content, '"error') || str_contains($content, '"warning"')) {
                $data = $response->getData(true);
                if (is_array($data)) {
                    $response->setData(ApiMessageTranslator::translatePayload($data, $locale));
                }
            }
        }

        return $response;
    }
}
