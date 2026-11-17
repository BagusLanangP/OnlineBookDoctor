<p align="center"><a href="https://laravel.com" target="_blank"><img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="400" alt="Laravel Logo"></a></p>

<p align="center">
<a href="https://github.com/laravel/framework/actions"><img src="https://github.com/laravel/framework/workflows/tests/badge.svg" alt="Build Status"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/dt/laravel/framework" alt="Total Downloads"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/v/laravel/framework" alt="Latest Stable Version"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/l/laravel/framework" alt="License"></a>
</p>

## About Laravel

Laravel is a web application framework with expressive, elegant syntax. We believe development must be an enjoyable and creative experience to be truly fulfilling. Laravel takes the pain out of development by easing common tasks used in many web projects, such as:

- [Simple, fast routing engine](https://laravel.com/docs/routing).
- [Powerful dependency injection container](https://laravel.com/docs/container).
- Multiple back-ends for [session](https://laravel.com/docs/session) and [cache](https://laravel.com/docs/cache) storage.
- Expressive, intuitive [database ORM](https://laravel.com/docs/eloquent).
- Database agnostic [schema migrations](https://laravel.com/docs/migrations).
- [Robust background job processing](https://laravel.com/docs/queues).
- [Real-time event broadcasting](https://laravel.com/docs/broadcasting).

Laravel is accessible, powerful, and provides tools required for large, robust applications.

## Menjalankan dengan Docker

Environment development memakai Docker Compose dengan 4 service:

| Service | Fungsi | Port host |
|---|---|---|
| `app` | PHP 8.4-FPM (Laravel) | - |
| `nginx` | Web server | `8088` |
| `db` | MySQL 8.0 | `3308` |
| `node` | Vite dev server (hot reload) | `5173` |

Prasyarat: [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
# 1. Siapkan environment (nilai DB di .env.example sudah cocok dengan Docker)
cp .env.example .env

# 2. Build dan jalankan semua container
docker compose up -d --build

# 3. Install dependency, generate key, migrasi + seed database
docker compose exec app composer install
docker compose exec app php artisan key:generate
docker compose exec app php artisan migrate --seed
```

Buka aplikasi di <http://localhost:8088>.

Perintah yang sering dipakai:

```bash
docker compose ps                       # status container
docker compose logs -f app              # log PHP (ganti nama service sesuai kebutuhan)
docker compose exec app bash            # masuk ke container app
docker compose exec app php artisan test
docker compose down                     # stop & hapus container (data DB tetap aman)
docker compose down -v                  # sekaligus hapus data DB
```

Jika port bentrok dengan aplikasi lain, ubah sisi kiri mapping `ports` di `docker-compose.yml`
(misalnya `"8089:80"`), lalu samakan `APP_URL` di `.env`. Koneksi antar-container tidak terpengaruh
karena memakai `db:3306`.

Untuk mengakses database dari luar Docker (mis. TablePlus): host `127.0.0.1`, port `3308`,
user `laravel`, password `secret`.

> Catatan: kredensial di atas hanya untuk development lokal.

## Learning Laravel

Laravel has the most extensive and thorough [documentation](https://laravel.com/docs) and video tutorial library of all modern web application frameworks, making it a breeze to get started with the framework.

In addition, [Laracasts](https://laracasts.com) contains thousands of video tutorials on a range of topics including Laravel, modern PHP, unit testing, and JavaScript. Boost your skills by digging into our comprehensive video library.

You can also watch bite-sized lessons with real-world projects on [Laravel Learn](https://laravel.com/learn), where you will be guided through building a Laravel application from scratch while learning PHP fundamentals.

## Agentic Development

Laravel's predictable structure and conventions make it ideal for AI coding agents like Claude Code, Cursor, and GitHub Copilot. Install [Laravel Boost](https://laravel.com/docs/ai) to supercharge your AI workflow:

```bash
composer require laravel/boost --dev

php artisan boost:install
```

Boost provides your agent 15+ tools and skills that help agents build Laravel applications while following best practices.

## Contributing

Thank you for considering contributing to the Laravel framework! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

If you discover a security vulnerability within Laravel, please send an e-mail to Taylor Otwell via [taylor@laravel.com](mailto:taylor@laravel.com). All security vulnerabilities will be promptly addressed.

## License

The Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).
