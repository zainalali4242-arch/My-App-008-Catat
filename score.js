/* =====================================================================
   score.js — RUMUS PRIORITAS (§5.2).

   Inilah "otak" aplikasi, pengganti AI. Tiga hal yang membuatnya bekerja:

   1. Deterministik — masukan sama selalu menghasilkan skor sama.
   2. Bisa dijelaskan — kenapa sebuah tugas ada di atas selalu bisa diurai.
   3. Bisa disetel — semua angkanya ada di config.js, bukan di sini.

   Sama seperti parser.js: murni hitungan, tidak menyentuh database,
   tidak menggambar, dan waktu selalu dikirim dari luar agar bisa diuji.
   ===================================================================== */

(function () {
  'use strict';

  var HARI_MS = 24 * 60 * 60 * 1000;

  /** Awal hari (00:00) dari sebuah waktu. */
  function awalHari(waktu) {
    var d = new Date(waktu);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /**
   * Selisih hari kalender antara dua waktu, bukan selisih 24 jam.
   * Jam 23:00 hari ini dan jam 01:00 besok berjarak 1 hari, bukan 0.
   *
   * Math.round dipakai, bukan floor, supaya pergeseran waktu musim panas
   * (yang membuat sehari jadi 23 atau 25 jam) tidak menggeser hasilnya.
   */
  function selisihHari(a, b) {
    return Math.round((awalHari(a) - awalHari(b)) / HARI_MS);
  }

  /**
   * Menghitung skor sebuah item. Makin besar makin mendesak.
   * @param item     satu item dari database
   * @param sekarang epoch milidetik
   */
  function hitungSkor(item, sekarang) {
    var bobot = Konfigurasi.bobotPrioritas();
    var urgensi = Konfigurasi.BAWAAN.urgensi;

    var skor = bobot[item.priority] || bobot[2];

    skor += bobotUrgensi(item, sekarang, urgensi);

    // Bobot usia — mencegah tugas lama tenggelam selamanya
    var usiaHari = selisihHari(sekarang, item.createdAt);
    skor += Math.min(Math.max(usiaHari, 0), Konfigurasi.BAWAAN.usiaMaksimal);

    return skor;
  }

  function bobotUrgensi(item, sekarang, urgensi) {
    var tenggat = tenggatItem(item);
    if (tenggat === null) return urgensi.tanpaTanggal;

    var hari = selisihHari(tenggat, sekarang);   // negatif = terlambat

    if (hari < 0) {
      var tambahan = Math.min(Math.abs(hari) * urgensi.terlambatPerHari,
                              urgensi.terlambatMaksimal);
      return urgensi.terlambatDasar + tambahan;
    }
    if (hari === 0) return urgensi.hariIni;
    if (hari === 1) return urgensi.besok;
    if (hari <= 7) return urgensi.dalamSeminggu;
    return urgensi.lebihJauh;
  }

  /** Tenggat sebuah item, dari mana pun ia tersimpan (§3). */
  function tenggatItem(item) {
    if (item.startAt !== null && item.startAt !== undefined) return item.startAt;
    if (item.dueAt !== null && item.dueAt !== undefined) return item.dueAt;
    return null;
  }

  /**
   * Menjelaskan skor dalam bahasa manusia, misalnya:
   * "prioritas 1 (+100) · terlambat 3 hari (+95) · usia 5 hari (+5)"
   *
   * Dipakai di kartu Fokus Sekarang supaya urutan tidak terasa seperti
   * sihir. Kalau pengguna tidak setuju dengan urutannya, ia bisa melihat
   * alasannya dan menyetel bobotnya di Pengaturan.
   */
  function jelaskanSkor(item, sekarang) {
    var bobot = Konfigurasi.bobotPrioritas();
    var urgensi = Konfigurasi.BAWAAN.urgensi;
    var bagian = ['prioritas ' + item.priority + ' (+' + (bobot[item.priority] || bobot[2]) + ')'];

    var tenggat = tenggatItem(item);
    var nilaiUrgensi = bobotUrgensi(item, sekarang, urgensi);

    if (tenggat === null) {
      bagian.push('tanpa tenggat (+' + nilaiUrgensi + ')');
    } else {
      var hari = selisihHari(tenggat, sekarang);
      if (hari < 0) bagian.push('terlambat ' + Math.abs(hari) + ' hari (+' + nilaiUrgensi + ')');
      else if (hari === 0) bagian.push('jatuh tempo hari ini (+' + nilaiUrgensi + ')');
      else if (hari === 1) bagian.push('besok (+' + nilaiUrgensi + ')');
      else bagian.push(hari + ' hari lagi (+' + nilaiUrgensi + ')');
    }

    var usia = Math.min(Math.max(selisihHari(sekarang, item.createdAt), 0),
                        Konfigurasi.BAWAAN.usiaMaksimal);
    if (usia > 0) bagian.push('usia (+' + usia + ')');

    return bagian.join(' · ');
  }

  /**
   * Mengelompokkan item menurut hubungannya dengan hari ini.
   * @returns 'terlambat' | 'hari-ini' | 'mendatang' | 'tanpa-tanggal'
   */
  function kelompokWaktu(item, sekarang) {
    var tenggat = tenggatItem(item);
    if (tenggat === null) return 'tanpa-tanggal';

    var hari = selisihHari(tenggat, sekarang);
    if (hari < 0) return 'terlambat';
    if (hari === 0) return 'hari-ini';
    return 'mendatang';
  }

  window.Skor = {
    hitungSkor: hitungSkor,
    jelaskanSkor: jelaskanSkor,
    kelompokWaktu: kelompokWaktu,
    tenggatItem: tenggatItem,
    selisihHari: selisihHari,
    awalHari: awalHari
  };
})();
