<?php

namespace App\Http\Requests\Auth;

use Illuminate\Auth\Events\Lockout;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class LoginRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ];
    }

    /**
     * Attempt to authenticate the request's credentials.
     *
     * @throws ValidationException
     */
    public function authenticate(): void
    {
        // 1. Gerbang anti brute-force: kalau kombinasi email|IP ini sudah gagal
        //    5 kali, langsung lempar error 422 dan berhenti di sini.
        $this->ensureIsNotRateLimited();

        // 2. Cek email + password ke database. Jika cocok, Laravel menyimpan
        //    user ke sesi (login). Argumen kedua = centang "ingat saya"
        //    (cookie remember-me); bernilai false bila field `remember` tidak dikirim.
        if (! Auth::attempt($this->only('email', 'password'), $this->boolean('remember'))) {
            // 3. Gagal: tambah hitungan percobaan gagal untuk kunci ini.
            RateLimiter::hit($this->throttleKey());

            // Pesan sengaja umum ("email atau password salah"), tidak membedakan
            // email tak terdaftar vs password salah, agar email tidak bisa ditebak.
            // Dipasang di field `email` supaya frontend menampilkannya di sana (422).
            throw ValidationException::withMessages([
                'email' => trans('auth.failed'),
            ]);
        }

        // 4. Berhasil: reset hitungan gagal, jadi salah ketik sesekali tidak
        //    menumpuk menjadi penguncian.
        RateLimiter::clear($this->throttleKey());
    }

    /**
     * Ensure the login request is not rate limited.
     *
     * @throws ValidationException
     */
    public function ensureIsNotRateLimited(): void
    {
        if (! RateLimiter::tooManyAttempts($this->throttleKey(), 5)) {
            return;
        }

        event(new Lockout($this));

        $seconds = RateLimiter::availableIn($this->throttleKey());

        throw ValidationException::withMessages([
            'email' => trans('auth.throttle', [
                'seconds' => $seconds,
                'minutes' => ceil($seconds / 60),
            ]),
        ]);
    }

    /**
     * Get the rate limiting throttle key for the request.
     */
    public function throttleKey(): string
    {
        return Str::transliterate(Str::lower($this->string('email')).'|'.$this->ip());
    }
}
