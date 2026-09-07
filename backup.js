/* =====================================================================
   backup.js — EKSPOR & IMPOR (§6). Berstatus P0, bukan pelengkap.

   Data aplikasi ini hanya ada di browser satu perangkat. Bersih-bersih
   riwayat, mode penyamaran, atau OS yang kehabisan ruang bisa
   menghapusnya tanpa peringatan. Berkas cadangan adalah satu-satunya
   perlindungan yang ada.

   Semua akses database tetap lewat DB.* — file ini tidak menyentuh
   IndexedDB langsung.
   ===================================================================== */

(function () {
  'use strict';

  var VERSI_BERKAS = 1;
  var KUNCI_BACKUP_TERAKHIR = 'catat:backup-terakhir';
  var KUNCI_BANNER_DITUTUP = 'catat:banner-backup-ditutup';

  // ---------------------------------------------------------------
  // EKSPOR
  // ---------------------------------------------------------------

  /**
   * Menyusun isi berkas cadangan. Dipisah dari proses unduhnya supaya
   * bisa diuji tanpa menyentuh browser.
   */
  async function susunCadangan(sekarang) {
    var items = await DB.ambilSemuaItem();
    return {
      version: VERSI_BERKAS,
      exportedAt: (typeof sekarang === 'number') ? sekarang : Date.now(),
      items: items
    };
  }

  function namaBerkas(waktu) {
    var d = new Date(waktu);
    function dua(n) { return (n < 10 ? '0' : '') + n; }
    return 'catat-backup-' + d.getFullYear() + '-' +
           dua(d.getMonth() + 1) + '-' + dua(d.getDate()) + '.json';
  }

  /** Membuat berkas lalu memicu unduhan. */
  async function ekspor() {
    var sekarang = Date.now();
    var isi = await susunCadangan(sekarang);
    var teks = JSON.stringify(isi, null, 2);

    var blob = new Blob([teks], { type: 'application/json' });
    var url = URL.createObjectURL(blob);

    // Tautan sementara yang diklik sendiri — cara paling sederhana
    // memicu unduhan tanpa pustaka apa pun.
    var tautan = document.createElement('a');
    tautan.href = url;
    tautan.download = namaBerkas(sekarang);
    document.body.appendChild(tautan);
    tautan.click();
    document.body.removeChild(tautan);

    // Beri jeda sebelum melepas url, sebagian browser masih memakainya
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

    catatWaktuBackup(sekarang);
    return isi.items.length;
  }

  // ---------------------------------------------------------------
  // IMPOR
  // ---------------------------------------------------------------

  /**
   * Membaca dan memeriksa isi berkas cadangan.
   * Melempar error berbahasa manusia kalau berkasnya tidak masuk akal.
   */
  function periksaCadangan(teks) {
    var data;
    try {
      data = JSON.parse(teks);
    } catch (e) {
      throw new Error('Berkas ini bukan cadangan Catat yang sah (bukan JSON).');
    }

    if (!data || !Array.isArray(data.items)) {
      throw new Error('Berkas ini tidak berisi daftar item. Pastikan memilih berkas catat-backup-*.json.');
    }
    if (data.version !== VERSI_BERKAS) {
      throw new Error('Versi cadangan tidak dikenali (versi ' + data.version + ').');
    }

    var sah = data.items.filter(function (i) {
      return i && typeof i.id === 'string' && typeof i.title === 'string';
    });

    return {
      jumlah: sah.length,
      dilewati: data.items.length - sah.length,
      exportedAt: data.exportedAt || null,
      items: sah
    };
  }

  /**
   * Memasukkan item dari cadangan.
   * @param mode 'gabung' melewati id yang sudah ada,
   *             'ganti' mengosongkan seluruh data lebih dulu.
   */
  async function impor(daftar, mode) {
    var ditambah = 0, dilewati = 0;

    if (mode === 'ganti') {
      await DB.hapusSemuaItem();
    }

    for (var i = 0; i < daftar.length; i++) {
      var item = daftar[i];

      if (mode === 'gabung') {
        var sudahAda = await DB.ambilItem(item.id);
        if (sudahAda) { dilewati++; continue; }
      }

      await DB.simpanItemUtuh(lengkapi(item));
      ditambah++;
    }

    return { ditambah: ditambah, dilewati: dilewati };
  }

  /**
   * Mengisi field yang mungkin tidak ada di cadangan lama, supaya item
   * hasil impor tidak membuat bagian lain aplikasi tersandung.
   */
  function lengkapi(item) {
    var sekarang = Date.now();
    return {
      id: item.id,
      type: item.type || 'task',
      title: item.title || '',
      body: item.body || '',
      context: item.context || 'kerja',
      priority: item.priority || 2,
      status: item.status || 'aktif',
      dueAt: (item.dueAt === undefined) ? null : item.dueAt,
      startAt: (item.startAt === undefined) ? null : item.startAt,
      tags: Array.isArray(item.tags) ? item.tags : [],
      triaged: (item.triaged === undefined) ? true : item.triaged,
      snoozeCount: item.snoozeCount || 0,
      createdAt: item.createdAt || sekarang,
      updatedAt: item.updatedAt || sekarang,
      completedAt: (item.completedAt === undefined) ? null : item.completedAt
    };
  }

  // ---------------------------------------------------------------
  // PENGINGAT BACKUP (§6)
  // ---------------------------------------------------------------

  function catatWaktuBackup(waktu) {
    try {
      localStorage.setItem(KUNCI_BACKUP_TERAKHIR, String(waktu));
      localStorage.removeItem(KUNCI_BANNER_DITUTUP);
    } catch (e) { /* abaikan */ }
  }

  function waktuBackupTerakhir() {
    try {
      var nilai = localStorage.getItem(KUNCI_BACKUP_TERAKHIR);
      return nilai ? Number(nilai) : null;
    } catch (e) {
      return null;
    }
  }

  function tutupBannerHariIni(sekarang) {
    try {
      localStorage.setItem(KUNCI_BANNER_DITUTUP, String(Skor.awalHari(sekarang)));
    } catch (e) { /* abaikan */ }
  }

  /**
   * Menentukan apakah banner pengingat perlu muncul.
   * Banner bisa ditutup, tapi penutupannya hanya berlaku untuk hari itu —
   * besoknya ia muncul lagi (§6).
   *
   * @returns { tampil, hariLalu } — hariLalu null kalau belum pernah backup
   */
  function statusPengingat(sekarang) {
    var terakhir = waktuBackupTerakhir();
    var hariLalu = (terakhir === null) ? null : Skor.selisihHari(sekarang, terakhir);

    var ditutupPada = null;
    try {
      var n = localStorage.getItem(KUNCI_BANNER_DITUTUP);
      ditutupPada = n ? Number(n) : null;
    } catch (e) { /* abaikan */ }

    var ditutupHariIni = (ditutupPada !== null) &&
                         (ditutupPada === Skor.awalHari(sekarang));

    var perlu = (hariLalu === null) ||
                (hariLalu >= Konfigurasi.BACKUP.ingatkanSetelahHari);

    return { tampil: perlu && !ditutupHariIni, hariLalu: hariLalu };
  }

  window.Cadangan = {
    susunCadangan: susunCadangan,
    namaBerkas: namaBerkas,
    ekspor: ekspor,
    periksaCadangan: periksaCadangan,
    impor: impor,
    statusPengingat: statusPengingat,
    waktuBackupTerakhir: waktuBackupTerakhir,
    tutupBannerHariIni: tutupBannerHariIni
  };
})();
