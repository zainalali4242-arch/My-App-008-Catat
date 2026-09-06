/* =====================================================================
   db.js — SATU-SATUNYA file yang boleh menyentuh IndexedDB.

   Kenapa dipisah begini?
   Supaya kalau suatu hari penyimpanan dipindah (misal ke SQLite),
   yang perlu diubah cuma file ini. File lain cukup memanggil
   DB.tambahItem(), DB.ambilSemuaItem(), dst. tanpa peduli isinya apa.

   Cara dipakai dari file lain:  DB.tambahItem({ title: 'beli kopi' })
   ===================================================================== */

(function () {
  'use strict';

  // ---------------------------------------------------------------
  // KONSTANTA — semua nilai tetap dikumpulkan di sini, jangan tersebar
  // ---------------------------------------------------------------
  var NAMA_DB = 'catat-db';
  var VERSI_DB = 1;
  var NAMA_STORE = 'items';

  // Index = "jalan pintas" untuk mencari data tanpa memeriksa satu per satu.
  // Belum semuanya dipakai di Tahap 1, tapi dibuat sekarang supaya tidak
  // perlu menaikkan versi database (migrasi) di tahap berikutnya.
  var DAFTAR_INDEX = [
    { nama: 'by_status', field: 'status' },
    { nama: 'by_dueAt', field: 'dueAt' },
    { nama: 'by_type', field: 'type' },
    { nama: 'by_context', field: 'context' },
    { nama: 'by_updatedAt', field: 'updatedAt' }
  ];

  /**
   * Nilai bawaan sebuah item baru (lihat §3 PRD).
   * Ditulis sebagai fungsi, bukan objek biasa, supaya setiap item
   * mendapat array `tags` miliknya sendiri — kalau memakai objek biasa,
   * semua item akan berbagi array yang sama dan saling mengubah isi.
   */
  function itemBawaan() {
    return {
      type: 'task',
      title: '',
      body: '',
      context: 'kerja',
      priority: 2,
      status: 'aktif',
      dueAt: null,
      startAt: null,
      tags: [],
      triaged: true,
      snoozeCount: 0,
      completedAt: null
    };
  }

  // Koneksi disimpan supaya database tidak dibuka berulang kali.
  var koneksi = null;

  // ---------------------------------------------------------------
  // BAGIAN DALAM — tidak dipakai langsung dari luar file ini
  // ---------------------------------------------------------------

  /**
   * IndexedDB memakai gaya lama (onsuccess/onerror). Fungsi ini
   * membungkusnya jadi Promise supaya bisa dipakai dengan await.
   */
  function bungkus(permintaan, pesanGagal) {
    return new Promise(function (selesai, gagal) {
      permintaan.onsuccess = function () { selesai(permintaan.result); };
      permintaan.onerror = function () { gagal(new Error(pesanGagal)); };
    });
  }

  /** Membuka database. Aman dipanggil berkali-kali. */
  function buka() {
    if (koneksi) return Promise.resolve(koneksi);

    return new Promise(function (selesai, gagal) {
      var permintaan;

      try {
        permintaan = indexedDB.open(NAMA_DB, VERSI_DB);
      } catch (e) {
        gagal(new Error(
          'Browser ini memblokir penyimpanan lokal. Coba matikan mode ' +
          'penyamaran (incognito) atau izinkan penyimpanan untuk situs ini.'
        ));
        return;
      }

      // Hanya berjalan saat database pertama kali dibuat atau versinya naik.
      permintaan.onupgradeneeded = function (ev) {
        var db = ev.target.result;
        var store;

        if (db.objectStoreNames.contains(NAMA_STORE)) {
          store = ev.target.transaction.objectStore(NAMA_STORE);
        } else {
          store = db.createObjectStore(NAMA_STORE, { keyPath: 'id' });
        }

        DAFTAR_INDEX.forEach(function (idx) {
          if (!store.indexNames.contains(idx.nama)) {
            store.createIndex(idx.nama, idx.field);
          }
        });
      };

      permintaan.onsuccess = function () {
        koneksi = permintaan.result;

        // Kalau tab lain membuka versi database yang lebih baru,
        // koneksi di tab ini harus ditutup agar tidak saling mengunci.
        koneksi.onversionchange = function () {
          koneksi.close();
          koneksi = null;
        };

        selesai(koneksi);
      };

      permintaan.onerror = function () {
        gagal(new Error('Gagal membuka penyimpanan data. Coba muat ulang halaman.'));
      };

      permintaan.onblocked = function () {
        gagal(new Error(
          'Aplikasi ini sedang terbuka di tab lain. Tutup tab tersebut lalu muat ulang.'
        ));
      };
    });
  }

  /** Mengambil object store siap pakai dalam mode tertentu. */
  async function ambilStore(mode) {
    var db = await buka();
    return db.transaction(NAMA_STORE, mode).objectStore(NAMA_STORE);
  }

  // ---------------------------------------------------------------
  // BAGIAN LUAR — inilah yang dipakai file lain
  // ---------------------------------------------------------------

  /**
   * Menyimpan item baru. Cukup kirim field yang diketahui,
   * sisanya diisi nilai bawaan.
   * Contoh: DB.tambahItem({ title: 'beli kopi' })
   */
  async function tambahItem(data) {
    var judul = (data && data.title ? String(data.title) : '').trim();
    if (!judul) throw new Error('Judul tidak boleh kosong.');

    var sekarang = Date.now();
    var item = Object.assign(itemBawaan(), data, {
      id: crypto.randomUUID(),
      title: judul,
      createdAt: sekarang,
      updatedAt: sekarang
    });

    try {
      var store = await ambilStore('readwrite');
      await bungkus(store.add(item), 'Gagal menyimpan. Item ini belum tercatat.');
      return item;
    } catch (e) {
      throw pesanManusiawi(e, 'Gagal menyimpan item.');
    }
  }

  /** Mengambil seluruh item. Untuk Tahap 1 jumlahnya masih kecil. */
  async function ambilSemuaItem() {
    try {
      var store = await ambilStore('readonly');
      var hasil = await bungkus(store.getAll(), 'Gagal membaca data.');
      return hasil || [];
    } catch (e) {
      throw pesanManusiawi(e, 'Gagal membaca data yang tersimpan.');
    }
  }

  /** Mengambil satu item berdasarkan id. Mengembalikan null kalau tidak ada. */
  async function ambilItem(id) {
    try {
      var store = await ambilStore('readonly');
      var hasil = await bungkus(store.get(id), 'Gagal membaca item.');
      return hasil || null;
    } catch (e) {
      throw pesanManusiawi(e, 'Gagal membaca item.');
    }
  }

  /**
   * Mengubah sebagian field sebuah item. `updatedAt` diisi otomatis.
   * Contoh: DB.perbaruiItem(id, { status: 'selesai' })
   */
  async function perbaruiItem(id, perubahan) {
    try {
      var lama = await ambilItem(id);
      if (!lama) throw new Error('Item tidak ditemukan. Mungkin sudah dihapus.');

      var baru = Object.assign({}, lama, perubahan, {
        id: lama.id,                 // id tidak boleh ikut berubah
        createdAt: lama.createdAt,   // waktu dibuat juga tidak
        updatedAt: Date.now()
      });

      var store = await ambilStore('readwrite');
      await bungkus(store.put(baru), 'Gagal menyimpan perubahan.');
      return baru;
    } catch (e) {
      throw pesanManusiawi(e, 'Gagal menyimpan perubahan.');
    }
  }

  /** Menghapus item secara permanen. */
  async function hapusItem(id) {
    try {
      var store = await ambilStore('readwrite');
      await bungkus(store.delete(id), 'Gagal menghapus item.');
      return true;
    } catch (e) {
      throw pesanManusiawi(e, 'Gagal menghapus item.');
    }
  }

  /** Jumlah seluruh item yang tersimpan. */
  async function hitungItem() {
    try {
      var store = await ambilStore('readonly');
      return await bungkus(store.count(), 'Gagal menghitung item.');
    } catch (e) {
      throw pesanManusiawi(e, 'Gagal menghitung item.');
    }
  }

  /**
   * Menerjemahkan error mentah dari browser menjadi kalimat yang
   * bisa dimengerti manusia. Kalau error-nya sudah kita tulis sendiri,
   * biarkan apa adanya.
   */
  function pesanManusiawi(e, cadangan) {
    if (e && e.message && e.message.indexOf('Gagal') === 0) return e;
    if (e && e.name === 'QuotaExceededError') {
      return new Error('Penyimpanan browser penuh. Hapus item lama atau kosongkan ruang.');
    }
    if (e && e.message) return e;
    return new Error(cadangan);
  }

  // Dipasang ke window supaya bisa dipanggil dari app.js tanpa build step.
  window.DB = {
    tambahItem: tambahItem,
    ambilSemuaItem: ambilSemuaItem,
    ambilItem: ambilItem,
    perbaruiItem: perbaruiItem,
    hapusItem: hapusItem,
    hitungItem: hitungItem
  };
})();
