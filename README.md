# Catat

Pencatat agenda & task sederhana. Web statis, tanpa server, tanpa akun.
Data disimpan di IndexedDB — **hanya di browser perangkat ini**, tidak pernah dikirim ke mana pun.

Status saat ini: **Tahap 1 selesai** (lihat §8 PRD).

---

## Yang sudah bisa dipakai

- Menulis item baru (judul saja) lewat kotak di bawah layar
- Melihat daftar item aktif
- Menandai selesai, dan mengembalikannya ke aktif kalau salah tekan
- Tampilan mengikuti mode terang/gelap perangkat

## Yang BELUM ada (menyusul di tahap berikutnya)

| Tahap | Isi |
|---|---|
| 2 | Layar Tangkap Cepat & Pilah Cepat |
| 3 | Sintaks `!1 @kerja /besok #tag` + pratinjau |
| 3b | Skor prioritas + Dashboard |
| 4 | **Ekspor / impor backup** |
| 5 | Catatan & ide, filter, pencarian |
| 6 | manifest, service worker, poles tampilan |

> ⚠️ Sampai Tahap 4 selesai, **belum ada fitur backup**. Jangan menaruh
> data penting dulu. Bersih-bersih riwayat browser akan menghapus semuanya.

---

## Struktur file

```
/
├── index.html      — kerangka semua layar
├── styles.css      — tampilan
├── js/
│   ├── db.js       — satu-satunya file yang menyentuh IndexedDB
│   └── app.js      — inisialisasi, render, event handler
└── README.md
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
