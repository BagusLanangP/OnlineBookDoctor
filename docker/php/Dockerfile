# Base image: PHP 8.4 dalam mode FPM (FastCGI Process Manager).
# FPM tidak melayani HTTP langsung; ia menunggu request dari Nginx di port 9000.
FROM php:8.4-fpm

# Install paket sistem yang dibutuhkan ekstensi PHP & composer.
# Digabung dalam satu RUN supaya hanya membuat 1 layer.
# "rm -rf /var/lib/apt/lists/*" membersihkan cache apt agar image lebih kecil.
RUN apt-get update && apt-get install -y \
        git \
        unzip \
        libzip-dev \
    && rm -rf /var/lib/apt/lists/*

# Ekstensi PHP yang dibutuhkan Laravel + MySQL.
# pdo_mysql : koneksi database MySQL
# zip       : dipakai composer untuk unpack paket
# bcmath    : perhitungan angka presisi
# pcntl     : dibutuhkan queue worker / signal handling
# opcache   : cache bytecode PHP (performa)
RUN docker-php-ext-install pdo_mysql zip bcmath pcntl opcache

# Multi-stage trick: ambil binary composer dari image resmi composer,
# tanpa perlu install composer manual.
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Folder kerja default. Perintah selanjutnya (dan `docker compose exec`)
# dijalankan dari sini. Ini sama dengan path mount di docker-compose.yml.
WORKDIR /var/www/html
