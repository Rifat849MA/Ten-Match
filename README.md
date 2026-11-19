# Ruang Angka — Ten Match

Game puzzle matematika berbasis web untuk project kelompok. Pemain menghapus pasangan angka yang nilainya sama atau berjumlah 10. Sepasang angka hanya bisa dihapus jika terhubung lewat garis horizontal, vertikal, diagonal, atau sambungan urutan dari ujung satu baris ke awal baris berikutnya, dan jalurnya kosong. Setiap ronde menyediakan tiga nyawa; salah memilih mengurangi satu nyawa.

## Fitur

- Papan angka 8 × 8 dengan susunan teka-teki yang dikontrol (4–5 pasangan awal di level 1–3, 3–4 di level 4–6, lalu 2–3); label kesulitan naik dari Menengah ke Sulit lalu Ahli.
- Pemain dapat langsung bermain sebagai tamu. Skor lokal tersimpan di browser dan ditandai **AKUN TIDAK RESMI**.
- Daftar dan login email/password melalui Firebase Authentication.
- Ranking global berdasarkan skor terbaik, dengan akun tamu ditandai **TAMU · TIDAK RESMI**.
- Tanpa konfigurasi Firebase, gameplay tetap bisa dimainkan; leaderboard hanya lokal di perangkat itu.
- Tampilan responsif dan seluruh antarmuka menggunakan Bahasa Indonesia.

## Menjalankan

1. Buka folder project di VS Code.
2. Jalankan `index.html` memakai server lokal (contoh: ekstensi Live Server). ES modules dan konfigurasi Firebase tidak berjalan andal bila file dibuka langsung memakai `file://`.
3. Tanpa Firebase, langsung main sebagai tamu.

## Mengaktifkan Firebase

1. Buat project di Firebase Console, tambahkan aplikasi Web, lalu salin konfigurasi web ke `firebase-config.js`.
2. Aktifkan **Authentication → Sign-in method → Email/Password** dan **Anonymous**.
3. Buat database **Cloud Firestore** pada project yang sama.
4. Salin isi `firestore.rules` ke tab **Firestore Database → Rules**, lalu publish.
5. Jalankan app lewat hosting lokal atau deploy file statis. Status akan berubah ke **Firebase aktif**, dan leaderboard menampilkan 10 skor terbaik global.

Dokumen ranking disimpan di `scores/{uid}` dengan field `displayName`, `bestScore`, `isGuest`, dan `updatedAt`. Aturan Firestore membatasi perubahan ke dokumen milik UID yang sedang login. Firebase web config memang dapat dilihat di browser; jangan pernah menaruh service-account key atau kredensial admin di aplikasi frontend. Untuk kompetisi berhadiah atau ranking yang perlu tahan manipulasi, validasi skor harus dipindahkan ke backend tepercaya.

## Rancangan arsitektur

Project memakai **arsitektur client-server dengan Firebase sebagai Backend as a Service (BaaS)**:

- **Presentation/client:** `index.html`, `style.css`, dan `app.js` menangani antarmuka, aturan permainan, dan interaksi pemain.
- **Layanan backend terkelola:** Firebase Authentication mengelola akun dan sesi; Cloud Firestore menyimpan skor dan menyediakan ranking global.
- **Penyimpanan lokal:** `localStorage` menyimpan skor demo saat Firebase belum diaktifkan; data ini hanya tersedia pada browser/perangkat yang sama dan bukan ranking global.

### Kelebihan

- Cepat dikembangkan untuk project kelompok; tidak perlu merawat server API sendiri.
- Authentication, database terkelola, dan sinkronisasi ranking tersedia tanpa menyiapkan infrastruktur backend.
- Klien dapat di-host sebagai situs statis dan antarmuka tetap bisa dimainkan sebagai tamu saat Firebase belum dikonfigurasi.
- Batas dokumen berdasarkan UID mengurangi kemungkinan pemain mengubah dokumen skor pemain lain.

### Kekurangan

- Fitur akun dan ranking global bergantung pada internet, konfigurasi, kuota, serta ketersediaan Firebase.
- Logika permainan di browser dapat dimodifikasi; Firestore Rules membatasi akses dokumen, tetapi tidak membuktikan skor benar. Backend tepercaya diperlukan bila anti-cheat penting.
- Data guest demo tanpa Firebase hanya tersimpan di satu browser dan dapat hilang jika data browser dihapus.
- Vendor lock-in dan struktur data Firebase perlu dipertimbangkan jika kelak backend dipindahkan.

## Laporan dan pembagian kerja

**Judul:** Ruang Angka — Game Matematika Ten Match  
**Tujuan:** Membuat game latihan logika matematika yang mendorong pemain menemukan pasangan angka lewat jalur kosong.  
**Target:** Pelajar dan pemain kasual.  
**Aturan inti:** Pasangan valid jika angkanya sama atau jumlahnya 10, terhubung lewat salah satu dari delapan arah atau jalur urutan ujung-baris-ke-awal-baris, dan tidak ada angka di antara keduanya. Pemain memulai dengan tiga nyawa; salah memilih mengurangi satu nyawa. Setiap level menyediakan tiga petunjuk (−25 poin per petunjuk) dan dua acak ulang (−75 poin per acak ulang).  
**Rancangan data:** Satu dokumen per UID pada koleksi `scores`; akun tamu dilabeli tidak resmi, akun terdaftar memakai nama profil.  
**Pengujian manual:** Uji pasangan sama, pasangan jumlah 10, pasangan tidak valid, jalur terhalang, jalur diagonal, sambungan ujung baris, pengurangan nyawa hingga game over, animasi benar/salah, penghapusan seluruh papan, batas petunjuk/acak ulang, kondisi buntu, akun tamu, serta daftar/login setelah Firebase dikonfigurasi.

Contoh pembagian tugas untuk tiga anggota (ganti dengan nama anggota kelompok):

1. **Anggota 1 — UI/UX:** layout, desain responsif, aksesibilitas, dan aset tampilan.
2. **Anggota 2 — Gameplay:** aturan pasangan, validasi jalur, skor, level, dan pengujian permainan.
3. **Anggota 3 — Integrasi & laporan:** Firebase Auth/Firestore, security rules, leaderboard, dan dokumentasi.
