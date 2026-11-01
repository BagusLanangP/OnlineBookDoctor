<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserHasClinic
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()?->clinic) {
            abort(403, 'No clinic is associated with this account.');
        }

        return $next($request);
    }
}
