<?php

use App\Http\Controllers\ProfileController;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ScheduleController;
use Inertia\Inertia;


// main entry point for the application, defining web routes and their associated controllers and middleware.
Route::get('/', function () {
    return Inertia::render('Welcome', [
        'canLogin' => Route::has('login'),
        'canRegister' => Route::has('register'),
        'laravelVersion' => Application::VERSION,
        'phpVersion' => PHP_VERSION,
    ]);
});

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

Route::middleware(['auth', 'verified', 'has.clinic'])->group(function () {
    Route::get('/dashboard', function () {
        return Inertia::render('Dashboard', [
            'clinic' => auth()->user()->clinic,
        ]);
    })->name('dashboard');

    Route::get('/practitioners/{practitioner}/schedules', [ScheduleController::class, 'index']);
    Route::post('/practitioners/{practitioner}/schedules', [ScheduleController::class, 'store']);
    Route::put('/schedules/{schedule}', [ScheduleController::class, 'update']);
    Route::delete('/schedules/{schedule}', [ScheduleController::class, 'destroy']);
});


require __DIR__.'/auth.php';
