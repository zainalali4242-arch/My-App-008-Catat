# Catat

Pencatat agenda & task sederhana. Web statis, tanpa server, tanpa akun.
Data disimpan di IndexedDB — **hanya di browser perangkat ini**, tidak pernah dikirim ke mana pun.

Status saat ini: **Tahap 3 selesai** (lihat §8 PRD).

---

## Yang sudah bisa dipakai

- Menulis item baru lewat kotak di bawah layar
- Melihat daftar item aktif, menandai selesai, membatalkannya
- **Tangkap Cepat** — layar kosong berisi textarea besar untuk mendikte di lapangan
- **Pilah Cepat** — memilah tangkapan lapangan satu per satu dengan tombol besar
- **Sintaks singkat** — `!1 @kerja #tag /besok /13:00`, dengan pratinjau langsung
- **Ubah item** — ketuk judul di daftar untuk memperbaiki judul, isi, tipe,
  prioritas, tanggal, konteks, atau menghapusnya
- **Isi catatan panjang** (`body`), tampil sebagai cuplikan dua baris di daftar
- Tangkapan lapangan yang sudah mengandung token tidak masuk antrean pilah
- Pintasan `?capture=1` untuk membuka langsung layar Tangkap Cepat
- Tampilan mengikuti mode terang/gelap perangkat

### Pintasan Tangkap Cepat di layar utama

Buka `https://<username>.github.io/<repo>/?capture=1` di HP, lalu
**Tambahkan ke Layar Utama**. Ikon ini langsung membuka layar tangkap
dengan papan ketik aktif — tombol mikrofon terjangkau dalam satu ketukan.

## Yang BELUM ada (menyusul di tahap berikutnya)

| Tahap | Isi |
|---|---|
| 3b | Skor prioritas + Dashboard |
| 4 | **Ekspor / impor backup** |
| 5 | Catatan & ide, filter, pencarian |
| 6 | manifest, service worker, poles tampilan |

> Catatan: fitur Ubah item dan isi catatan panjang berada di luar PRD asli.
> Ditambahkan atas permintaan setelah pemakaian nyata menunjukkan bahwa
> kesalahan dikte tidak bisa diperbaiki sama sekali.

> ⚠️ Sampai Tahap 4 selesai, **belum ada fitur backup**. Jangan menaruh
> data penting dulu. Bersih-bersih riwayat browser akan menghapus semuanya.

---

## Struktur file

```
/
├── index.html      — kerangka semua layar
├── styles.css      — tampilan
├── tests.html      — pengujian parser & tanggal (buka di browser)
├── js/
│   ├── db.js       — satu-satunya file yang menyentuh IndexedDB
│   ├── parser.js   — pembaca sintaks singkat
│   ├── views.js    — penggambar tampilan
│   └── app.js      — pengatur alur layar & event handler
└── README.md

## Dua mode pada satu kartu

Layar kartu dipakai untuk dua hal berbeda:

| | Mode Pilah | Mode Ubah |
|---|---|---|
| Dibuka dari | Banner antrean | Ketuk judul di daftar |
| Kolom isi | Disembunyikan | Ditampilkan |
| Tombol Kapan | "Nanti" tersorot | Tidak ada yang tersorot |
| Setelah Simpan | Lanjut item berikutnya | Kembali ke daftar |
| Hapus | Langsung | Minta konfirmasi |

Di mode Ubah, tanggal **tidak berubah** selama tombol "Kapan?" tidak
disentuh. Ini penting: tanggal seperti 27 Sep tidak bisa diwakili oleh
empat tombol itu, jadi menyorot salah satunya akan menimpanya.

## Sintaks singkat

| Token | Arti |
|---|---|
| `!1` `!2` `!3` | Prioritas, 1 tertinggi |
| `@kerja` `@pribadi` | Konteks |
| `#tag` | Tag, boleh lebih dari satu |
| `/hari ini` `/besok` `/lusa` | Tanggal relatif |
| `/senin` … `/minggu` | Hari terdekat berikutnya |
| `/27` `/27-09` | Tanggal spesifik |
| `/14:00` | Jam |
| `?` di awal | Jadikan catatan |
| `*` di awal | Jadikan agenda |

Token yang tidak dikenali dibiarkan jadi bagian judul, bukan error.

## Menjalankan pengujian

Buka `tests.html` lewat server lokal atau GitHub Pages. Hasilnya tampil
langsung sebagai daftar hijau/merah. Bisa juga dipanggil dari konsol
dengan `runTests()`.
```

---

## Menjalankan di komputer sendiri

Aplikasi ini **tidak bisa dibuka lewat klik ganda pada `index.html`**
(alamat `file://`). Browser memblokir IndexedDB untuk berkas lokal.
Jalankan server kecil dulu:

```bash
cd catat
python3 -m http.server 8000
```

Lalu buka `http://localhost:8000`.

## Deploy ke GitHub Pages

1. Buat repository baru, misal `catat`. Boleh publik — data tidak ikut ter-upload.
2. Unggah semua file ke branch `main`.
3. **Settings → Pages** → Source: *Deploy from a branch*, Branch: `main`, folder: `/ (root)`.
4. Tunggu 1–2 menit → `https://<username>.github.io/catat/`
5. Buka di HP → menu Bagikan → **Tambahkan ke Layar Utama**.

⚠️ Setelah ditambahkan ke layar utama, jangan hapus ikonnya — di sebagian
perangkat, menghapus ikon ikut menghapus datanya.

---

## Aturan proyek

- Tanpa build step, tanpa dependency, tanpa CDN
- Vanilla JavaScript
- Semua akses database lewat `js/db.js`
- Tanpa Web Speech API / akses mikrofon
- Tidak menambah fitur di luar PRD

---

## Ide untuk nanti (jangan dikerjakan sekarang)

- Sinkronisasi lewat file di Google Drive
- Enkripsi file backup
- Sintaks pengulangan (`/tiap senin`)
- Tampilan kalender mingguan
- Statistik bulanan
- Pemindahan penyimpanan ke SQLite
- Segala hal berbau AI
