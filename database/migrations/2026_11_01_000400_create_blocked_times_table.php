<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('blocked_times', function (Blueprint $table) {
            $table->id();
            $table->foreignId('practitioner_id')
                  ->constrained('practitioners')
                  ->cascadeOnDelete();
            $table->timestamp('start_time');
            $table->timestamp('end_time');
            $table->string('reason');
            $table->timestamps();

            $table->index('practitioner_id');
            $table->index(['practitioner_id', 'start_time']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('blocked_times');
    }
};
