# Bot Discord 2Kuli

Tiket topup Robux + cek apakah buyer sudah join community Roblox **2Kuli Project** (ID 559137025).

## Alur
1. Admin mengetik `/setup-tiket` di channel publik → bot memasang panel dengan tombol **Topup**.
2. Buyer klik **Topup** → bot membuat channel privat `topup-namabuyer` (hanya buyer + staff + bot).
3. Buyer klik **Masukkan username Roblox** → isi username.
4. Bot menampilkan foto profil, display name, dan status:
   - ✅ Sudah member → staff di-tag untuk melanjutkan.
   - ❌ Belum member → tombol **Join community** + **Cek ulang**.
5. **Tutup tiket** → channel dihapus (buyer atau staff).

## Setup (sekali saja)

### 1. Buat aplikasi bot
1. Buka https://discord.com/developers/applications → **New Application** → beri nama (mis. `2Kuli Bot`).
2. **General Information** → salin **Application ID** → ini `CLIENT_ID`.
3. Menu **Bot** → **Reset Token** → salin → ini `DISCORD_TOKEN` (rahasia!).
   Privileged Gateway Intents tidak perlu dinyalakan.

### 2. Ambil ID dari Discord
Discord → **User Settings → Advanced → Developer Mode: ON**. Lalu klik kanan:
- nama server → **Copy Server ID** → `GUILD_ID`
- role admin/staff → **Copy Role ID** → `STAFF_ROLE_ID`
- (opsional) kategori untuk tiket → **Copy Category ID** → `TICKET_CATEGORY_ID`

### 3. Isi .env
```bash
cd bot
cp .env.example .env     # lalu isi nilainya
npm install
npm start
```
Saat jalan, terminal menampilkan **link undang bot**. Buka link itu, pilih server, Authorize.
Setelah bot masuk server, hentikan (Ctrl+C) dan `npm start` lagi supaya command terdaftar.

### 4. Pasang panel
Di channel publik (mis. `#topup`), ketik `/setup-tiket`.

> Pastikan role bot posisinya **di atas** role staff di Server Settings → Roles,
> supaya bot bisa mengatur izin channel tiket.

## Catatan
- Bot hanya online selama `npm start` berjalan. Untuk online 24 jam nanti dipindah ke hosting (Railway/Render/VPS).
- Cek eligible payout memakai Roblox Open Cloud API key (`ROBLOX_API_KEY`, izin `group:read`, dibuat dari akun alt):
  bot mengambil tanggal join grup dan memastikan buyer sudah member minimal 14 hari.
