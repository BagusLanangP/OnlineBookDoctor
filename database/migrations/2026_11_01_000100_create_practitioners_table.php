<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('practitioners', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clinic_id')
                  ->constrained('clinics')
                  ->cascadeOnDelete();
            $table->string('name');
            $table->string('specialty')->nullable();
            $table->timestamps();

            $table->unique(['clinic_id', 'name']);
            $table->index('clinic_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('practitioners');
    }
};
