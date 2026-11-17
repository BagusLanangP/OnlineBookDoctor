<?php

namespace App\Providers;

use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;
use App\Repositories\Contracts\BookingRepositoryInterface;
use App\Repositories\Contracts\PractitionerRepositoryInterface;
use App\Repositories\Eloquent\EloquentBookingRepository;
use App\Repositories\Eloquent\EloquentPractitionerRepository;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(
        BookingRepositoryInterface::class,
        EloquentBookingRepository::class,);
        
        $this->app->bind(
        PractitionerRepositoryInterface::class,
        EloquentPractitionerRepository::class,);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Vite::prefetch(concurrency: 3);
    }
}
