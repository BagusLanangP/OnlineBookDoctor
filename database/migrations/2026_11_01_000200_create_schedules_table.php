<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('practitioner_id')
                  ->constrained('practitioners')
                  ->cascadeOnDelete();
            $table->tinyInteger('day_of_week'); // 0=Sun, 1=Mon, ..., 6=Sat
            $table->time('start_time');
            $table->time('end_time');
            $table->timestamps();

            $table->unique(['practitioner_id', 'day_of_week']);
            $table->index('practitioner_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('schedules');
    }
};
