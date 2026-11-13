# duakuli

- `duakuli.com` → halaman Home komunitas (isi diatur di `src/config/community.js`)
- `duakuli.com/owner` → login owner
- `duakuli.com/owner/dashboard` → dashboard transaksi Robux (CRUD + foto bukti)

Stack: React + Vite + Tailwind v4, Supabase (database, auth, storage), Vercel (hosting). Semua bisa pakai paket gratis.

## 1. Jalankan di laptop

```bash
npm install
cp .env.example .env   # lalu isi (langkah 2)
npm run dev            # buka http://localhost:5173
```

## 2. Setup Supabase (gratis)

1. Buat project di https://supabase.com → **New project** (region Singapore paling dekat).
2. **Project Settings → API**: salin **Project URL** dan **anon public key** ke `.env`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
   Anon key memang aman ditaruh di frontend; datanya dilindungi Row Level Security.
3. Buka `supabase/schema.sql`, **ganti `ganti-dengan-email-kamu@gmail.com`** dengan email owner.
   Lalu **SQL Editor → New query** → paste seluruh isi file → **Run**.
   Ini membuat tabel `robux_transactions`, allowlist `owners`, dan bucket private `bukti` untuk foto.
4. **Authentication → Users → Add user → Create new user**: isi email (yang sama dengan langkah 3) + password, centang **Auto Confirm User**.
5. **Authentication → Sign In / Providers → Email**: matikan **Allow new users to sign up**, supaya orang lain tidak bisa daftar sendiri.
   (Walaupun ada yang berhasil daftar, mereka tetap ditolak karena emailnya tidak ada di tabel `owners`.)

Tambah owner lain nanti: buat user di langkah 4, lalu jalankan di SQL Editor:
```sql
insert into public.owners (email) values ('email-lain@gmail.com');
```

## 3. Deploy ke Vercel

1. Push folder ini ke repo GitHub (file `.env` otomatis tidak ikut, sudah ada di `.gitignore`).
2. https://vercel.com → **Add New → Project** → import repo. Framework terdeteksi sebagai Vite.
3. Di **Environment Variables**, tambahkan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` → **Deploy**.
4. Domain: **Project → Settings → Domains** → tambah `duakuli.com`, lalu ikuti instruksi DNS dari Vercel di tempat kamu beli domain.
5. Di Supabase **Authentication → URL Configuration**, set **Site URL** ke `https://duakuli.com`.

`vercel.json` sudah mengarahkan semua path ke `index.html`, jadi `/owner` tidak 404 saat di-refresh.

## Fitur dashboard

- Tambah / edit / hapus transaksi: tanggal pembelian, username buyer, nominal (Rp), jumlah Robux, catatan, foto bukti
- Foto otomatis diperkecil (maks 1600px, JPEG) sebelum upload, supaya kuota storage 1 GB awet
- Foto disimpan di bucket private; hanya owner yang bisa melihat (lewat link sementara 1 jam)
- Ringkasan: total nominal, total Robux, jumlah transaksi & buyer, rata-rata harga per 1.000 Robux
- Filter bulan, cari username, urutkan, pagination, export CSV

## Catatan paket gratis Supabase

Project gratis akan **di-pause kalau tidak ada aktivitas 7 hari**. Data tidak hilang; tinggal klik **Restore** di dashboard Supabase.
