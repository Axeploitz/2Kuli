// Edit file ini untuk mengubah isi halaman Home. Tidak perlu menyentuh kode lain.
export const community = {
  name: '2Kuli',

  // Logo: file di public/logo/ (tulis nama file lengkap dengan ekstensi)
  // wordmark: true  -> logo berupa tulisan (nama tidak ditulis ulang di sebelahnya)
  // invert: true    -> logo hitam di latar putih dibalik jadi putih di latar gelap
  logo: { file: 'logo.png', wordmark: true, invert: true },
  tagline: 'Kerja bareng, tumbuh bareng.',
  intro:
    'Komunitas yang dibangun dari orang-orang yang mau turun tangan. Kami bikin kegiatan, saling bantu, dan jalan terus walau dimulai dari kecil.',

  about: [
    'duakuli berdiri dari 2 orang dengan satu tujuan dan ide besar, berawal dari ThinkBros yang kini beralih menjadi 2Kuli membawa hal baru dengan satu tujuan.',
    'Siapa pun boleh bergabung. Kamu tidak perlu jago atau memiliki background tertentu, cukup mau datang dan ikut bantu. Kita open untuk semua player yang ingin berkembang bersama.',
  ],

  // Foto owner: taruh di public/images/owners/ dengan nama sesuai `photo`
  // Tulis nama file LENGKAP dengan ekstensi, huruf besar/kecil harus sama persis.
  ownersIntro: 'Dua orang di balik setiap experience 2Kuli, dari ide pertama sampai update terbaru.',
  owners: [
    { name: 'JustAxe', role: 'Owner', photo: 'justaxe.jpg' },
    { name: 'Thalvior', role: 'Owner', photo: 'thalvior.jpg' },
  ],

  // Gambar experience: taruh di public/images/experiences/, tulis nama file lengkap di `image`.
  // Ukuran ideal persegi 1:1, contoh 1000x1000.
  // Isi `url` dengan link game Roblox-nya supaya muncul tombol "Mainkan".
  experiences: [
    { name: 'Mount Talaraya', image: 'mount-talaraya.jpg', url: 'https://www.roblox.com/games/126890368341569/Mount-Talaraya' },
    { name: 'Saujana', image: 'saujana.jpg', url: 'https://www.roblox.com/games/89346234653070/SAUJANA' },
  ],

  join: {
    text: 'Gabung ke grup Roblox kami dan ngobrol bareng anggota lain di Discord.',
    links: [
      { platform: 'roblox', label: 'Grup Roblox', sub: 'Join grup 2Kuli Project', href: 'https://www.roblox.com/share/g/559137025' },
      { platform: 'discord', label: 'Discord', sub: 'Ngobrol bareng member lain', href: 'https://discord.gg/tM7Kz3ueBQ' },
    ],
  },
}
