<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('practitioner_id')
                  ->constrained('practitioners')
                  ->cascadeOnDelete();
            $table->string('patient_name');
            $table->string('patient_phone');
            $table->string('visit_reason');
            $table->timestamp('booked_time');
            $table->enum('status', ['confirmed', 'completed', 'cancelled'])
                  ->default('confirmed');
            $table->timestamps();

            $table->unique(['practitioner_id', 'booked_time']);
            $table->index('practitioner_id');
            $table->index('booked_time');
            $table->index('patient_phone');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bookings');
    }
};
