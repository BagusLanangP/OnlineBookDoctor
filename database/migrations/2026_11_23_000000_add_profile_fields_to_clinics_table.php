<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Task 11: kolom profil klinik yang dilihat pasien. Semua nullable supaya klinik
// lama tetap sah tanpa diisi ulang.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clinics', function (Blueprint $table) {
            $table->string('description', 300)->nullable()->after('name');
            $table->string('address', 500)->nullable()->after('description');
            $table->string('city', 100)->nullable()->after('address');
            $table->string('maps_url', 2048)->nullable()->after('city');
        });
    }

    public function down(): void
    {
        Schema::table('clinics', function (Blueprint $table) {
            $table->dropColumn(['description', 'address', 'city', 'maps_url']);
        });
    }
};
