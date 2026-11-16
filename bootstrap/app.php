<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();

        // The SPA stores the chosen interface language in a plain (unencrypted)
        // cookie so the server can answer in the same language.
        $middleware->encryptCookies(except: ['piao_lang']);
        $middleware->web(append: [\App\Http\Middleware\LocalizeApi::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();