<?php
// includes/config.php (REVISED & ROBUST VERSION)

if (session_status() == PHP_SESSION_NONE) {
    session_start();
}

// --- PENGATURAN LINGKUNGAN (PENTING!) ---
// Set ke 'development' saat di localhost, dan 'production' saat di server live.
define('ENVIRONMENT', 'development'); // Ganti ke 'production' saat di-upload

// --- Konfigurasi Database ---
if (ENVIRONMENT === 'production') {
    // Pengaturan untuk server live (project48.xyz)

} else {
    // Pengaturan untuk server lokal (localhost)
    define('DB_SERVER', '127.0.0.1');
    define('DB_USERNAME', 'mave');     
    define('DB_PASSWORD', 'Plerr321');
    define('DB_NAME', 'maverick_streaming');
}

// --- Konfigurasi Pembayaran (Winpay & PayPal) ---
define('PAYPAL_MODE', 'live');
define('WINPAY_MODE', 'sandbox'); 
define('WINPAY_PARTNER_ID', 'zanssxploit@gmail.com');
define('WINPAY_SECRET_KEY', '303b39f1b273dfb5930df4b0b2a3cdcd');

// --- PENGATURAN URL DASAR (BASE_URL) ---
if (ENVIRONMENT === 'production') {
    // URL untuk server live Anda
    define('BASE_URL', 'https://project48.xyz/'); // Sesuaikan jika ada di subfolder
} else {
    // URL untuk server lokal Anda. SESUAIKAN PORT JIKA PERLU.
    define('BASE_URL', 'http://localhost:8080/'); // Pastikan ini cocok dengan address bar Anda
}

// --- Pengaturan API Pembayaran Dinamis Berdasarkan BASE_URL ---
define('WINPAY_API_BASE', WINPAY_MODE == 'sandbox' ? 'https://sandbox-payment.winpay.id' : 'https://payment.winpay.id');
if (PAYPAL_MODE == 'live') {
    define('PAYPAL_CLIENT_ID', 'AW26oJZ4u1U5b8CjyeS4WEyCwcwPmjdyzIYslq3bT2hzVW4y4uOnkrHgeAxYvtA7VTvAX2V0itp3yOTH');
    define('PAYPAL_CLIENT_SECRET', 'EGoktYw3Ku68qt9iwYFaEm95ySU21D2iwmtbYwu4DwmijnUDQ63hwWzQG9nCMRgJlBShq43o0gZu_so6');
    define('PAYPAL_API_BASE', 'https://api-m.paypal.com');
} else {
    define('PAYPAL_CLIENT_ID', 'GANTI_DENGAN_CLIENT_ID_SANDBOX_ANDA');
    define('PAYPAL_CLIENT_SECRET', 'GANTI_DENGAN_SECRET_SANDBOX_ANDA');
    define('PAYPAL_API_BASE', 'https://api-m.sandbox.paypal.com');
}

// --- Buat Koneksi Database ---
$conn = new mysqli(DB_SERVER, DB_USERNAME, DB_PASSWORD, DB_NAME);
if ($conn->connect_error) {
    die("Koneksi database gagal: " . $conn->connect_error);
}

date_default_timezone_set('Asia/Jakarta');