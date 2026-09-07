/* =====================================================================
   parser.js — PEMBACA SINTAKS SINGKAT (§4).

   Mengubah satu baris teks menjadi item yang sudah berlabel.
   Contoh:
     "siapkan slide !1 @kerja #meeting /besok /13:00"
        → task, prioritas 1, konteks kerja, tag [meeting],
          dueAt = besok 13:00, judul "siapkan slide"

   Aturan file ini:
   - Murni hitungan. Tidak menyentuh database, tidak menggambar apa pun.
   - Token yang tidak dikenali DIBIARKAN sebagai bagian judul, bukan error.
   ===================================================================== */

(function () {
  'use strict';

  // ---------------------------------------------------------------
  // KONSTANTA
  // ---------------------------------------------------------------

  // Nama hari → angka yang dipakai JavaScript (getDay: 0 = Minggu)
  var HARI = {
    minggu: 0, senin: 1, selasa: 2, rabu: 3,
    kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6
  };

  var JAM_AGENDA_BAWAAN = 0;    // agenda tanpa jam → 00:00
  var BATAS_CARI_BULAN = 12;    // berapa bulan ke depan dicari untuk tanggal seperti /31

  // Token prioritas:  !1  !2  !3
  var POLA_PRIORITAS = /(^|\s)!([123])(?=\s|$)/g;

  // Token konteks:    @kerja  @pribadi
  var POLA_KONTEKS = /(^|\s)@(kerja|pribadi)(?=\s|$)/gi;

  // Token tag:        #laporan
  var POLA_TAG = /(^|\s)#([\w-]+)(?=\s|$)/g;

  // Token jam:        /14:00  atau  /14.00
  var POLA_JAM = /(^|\s)\/(\d{1,2})[:.](\d{2})(?=\s|$)/g;

  // Token tanggal. Urutan alternatif penting: yang lebih panjang duluan,
  // supaya "/27-09" tidak keburu terbaca sebagai "/27".
  var POLA_TANGGAL = new RegExp(
    '(^|\\s)\\/(' +
      'hari ini|besok|lusa|' +
      "senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|" +
      '\\d{1,2}-\\d{1,2}|' +
      '\\d{1,2}' +
    ')(?=\\s|$)', 'gi');

  // ---------------------------------------------------------------
  // FUNGSI UTAMA
  // ---------------------------------------------------------------

  /**
   * @param teks     satu baris masukan
   * @param sekarang epoch ms; boleh diisi untuk pengujian
   * @returns objek berisi type, title, priority, context, tags,
   *          dueAt, startAt, punyaJam, adaToken
   */
  function uraikan(teks, sekarang) {
    sekarang = (typeof sekarang === 'number') ? sekarang : Date.now();

    var hasil = {
      type: 'task',
      title: '',
      priority: 2,
      context: 'kerja',
      tags: [],
      dueAt: null,
      startAt: null,
      punyaJam: false,
      adaToken: false      // dipakai §4.3 untuk memutuskan perlu dipilah atau tidak
    };

    var s = String(teks || '').replace(/\s+/g, ' ').trim();
    if (!s) return hasil;

    // --- 1. Penanda jenis di awal baris: "?" catatan, "*" agenda ---
    if (s.charAt(0) === '?') {
      hasil.type = 'note';
      hasil.adaToken = true;
      s = s.slice(1).trim();
    } else if (s.charAt(0) === '*') {
      hasil.type = 'event';
      hasil.adaToken = true;
      s = s.slice(1).trim();
    }

    // --- 2. Prioritas, konteks, tag ---
    // Pola menangkap spasi di depan token; spasi itu dikembalikan supaya
    // kata-kata di sekitarnya tidak menempel setelah token dibuang.
    s = s.replace(POLA_PRIORITAS, function (_, depan, angka) {
      hasil.priority = Number(angka);
      hasil.adaToken = true;
      return depan;
    });

    s = s.replace(POLA_KONTEKS, function (_, depan, nilai) {
      hasil.context = nilai.toLowerCase();
      hasil.adaToken = true;
      return depan;
    });

    s = s.replace(POLA_TAG, function (_, depan, nama) {
      var tag = nama.toLowerCase();
      if (hasil.tags.indexOf(tag) === -1) hasil.tags.push(tag);
      hasil.adaToken = true;
      return depan;
    });

    // --- 3. Jam. Dibaca lebih dulu supaya "/13:00" tidak dikira tanggal "/13" ---
    var jam = null;
    s = s.replace(POLA_JAM, function (cocok, depan, j, m) {
      var jamAngka = Number(j), menitAngka = Number(m);
      // Jam tidak masuk akal → biarkan apa adanya di judul, jangan error
      if (jamAngka > 23 || menitAngka > 59) return cocok;
      jam = { jam: jamAngka, menit: menitAngka };
      hasil.adaToken = true;
      hasil.punyaJam = true;
      return depan;
    });

    // --- 4. Tanggal ---
    var tanggal = null;
    s = s.replace(POLA_TANGGAL, function (cocok, depan, nilai) {
      var dihitung = hitungTanggal(nilai.toLowerCase(), sekarang);
      if (dihitung === null) return cocok;   // tidak masuk akal → biarkan di judul
      tanggal = dihitung;
      hasil.adaToken = true;
      return depan;
    });

    // --- 5. Sisa teks adalah judulnya ---
    hasil.title = s.replace(/\s+/g, ' ').trim();

    // --- 6. Gabungkan tanggal + jam menjadi satu angka epoch ---
    var waktu = gabungkanWaktu(tanggal, jam, sekarang, hasil.type);
    if (waktu !== null) {
      // Tugas memakai dueAt, agenda memakai startAt (§3)
      if (hasil.type === 'event') hasil.startAt = waktu;
      else hasil.dueAt = waktu;
    }

    return hasil;
  }

  // ---------------------------------------------------------------
  // PERHITUNGAN TANGGAL
  // ---------------------------------------------------------------

  /**
   * Menerjemahkan satu token tanggal menjadi objek Date (jam belum diisi).
   * Mengembalikan null kalau tokennya tidak masuk akal.
   */
  function hitungTanggal(nilai, sekarang) {
    var hariIni = new Date(sekarang);
    hariIni.setHours(0, 0, 0, 0);

    if (nilai === 'hari ini') return hariIni;
    if (nilai === 'besok') return geser(hariIni, 1);
    if (nilai === 'lusa') return geser(hariIni, 2);

    // Nama hari → hari terdekat BERIKUTNYA.
    // Kalau hari ini Senin dan diketik /senin, yang dimaksud Senin depan.
    if (Object.prototype.hasOwnProperty.call(HARI, nilai)) {
      var selisih = (HARI[nilai] - hariIni.getDay() + 7) % 7;
      if (selisih === 0) selisih = 7;
      return geser(hariIni, selisih);
    }

    // Format /27-09  → tanggal 27 bulan 9
    if (nilai.indexOf('-') !== -1) {
      var bagian = nilai.split('-');
      var hari = Number(bagian[0]), bulan = Number(bagian[1]);
      if (bulan < 1 || bulan > 12) return null;

      var tahunIni = buatTanggal(hariIni.getFullYear(), bulan - 1, hari);
      if (tahunIni && tahunIni.getTime() >= hariIni.getTime()) return tahunIni;
      // Sudah lewat tahun ini → berarti tahun depan
      return buatTanggal(hariIni.getFullYear() + 1, bulan - 1, hari);
    }

    // Format /27 → tanggal 27 pada bulan terdekat yang memilikinya.
    // Ini yang membuat /31 di bulan berisi 30 hari melompat ke bulan berikutnya.
    var hariSaja = Number(nilai);
    if (hariSaja < 1 || hariSaja > 31) return null;

    for (var i = 0; i < BATAS_CARI_BULAN; i++) {
      var calon = buatTanggal(hariIni.getFullYear(), hariIni.getMonth() + i, hariSaja);
      if (calon && calon.getTime() >= hariIni.getTime()) return calon;
    }
    return null;
  }

  /** Menambah sejumlah hari. setDate() sudah menangani pergantian bulan/tahun. */
  function geser(tanggal, jumlahHari) {
    var d = new Date(tanggal);
    d.setDate(d.getDate() + jumlahHari);
    return d;
  }

  /**
   * Membuat tanggal, atau null kalau tanggalnya tidak ada di bulan itu.
   * new Date(2026, 1, 31) diam-diam menjadi 3 Maret — pemeriksaan
   * getDate() di bawah menangkap pergeseran diam itu.
   */
  function buatTanggal(tahun, bulan, hari) {
    var d = new Date(tahun, bulan, hari, 0, 0, 0, 0);
    if (d.getDate() !== hari) return null;
    return d;
  }

  /**
   * Menggabungkan tanggal dan jam menjadi epoch milidetik.
   * - Ada jam                → dipakai apa adanya
   * - Tugas tanpa jam        → akhir hari (23:59), batasnya sepanjang hari itu
   * - Agenda tanpa jam       → awal hari (00:00), jamnya memang belum diketahui
   * - Hanya jam tanpa tanggal→ dianggap hari ini
   */
  function gabungkanWaktu(tanggal, jam, sekarang, tipe) {
    if (!tanggal && !jam) return null;

    var d;
    if (tanggal) {
      d = new Date(tanggal);
    } else {
      d = new Date(sekarang);
      d.setHours(0, 0, 0, 0);
    }

    if (jam) {
      d.setHours(jam.jam, jam.menit, 0, 0);
    } else if (tipe === 'event') {
      d.setHours(JAM_AGENDA_BAWAAN, 0, 0, 0);
    } else {
      d.setHours(23, 59, 59, 999);
    }

    return d.getTime();
  }

  // ---------------------------------------------------------------
  // RINGKASAN UNTUK PRATINJAU
  // ---------------------------------------------------------------

  var NAMA_TIPE = { task: 'Tugas', note: 'Catatan', event: 'Agenda' };

  /**
   * Mengubah hasil uraian menjadi satu baris keterangan pendek,
   * misalnya: "Tugas · !1 · kerja · #meeting · Sen, 7 Sep 13:00".
   * Inilah yang membuat sintaksnya bisa dipelajari tanpa membaca dokumen.
   */
  function ringkas(hasil) {
    var bagian = [NAMA_TIPE[hasil.type], '!' + hasil.priority, hasil.context];

    hasil.tags.forEach(function (t) { bagian.push('#' + t); });

    var waktu = (hasil.startAt !== null) ? hasil.startAt : hasil.dueAt;
    if (waktu !== null) bagian.push(tulisWaktu(waktu, hasil.punyaJam));

    return bagian.join(' · ');
  }

  function tulisWaktu(epoch, tampilkanJam) {
    var d = new Date(epoch);
    var teks = d.toLocaleDateString('id-ID', {
      weekday: 'short', day: 'numeric', month: 'short'
    });
    if (tampilkanJam) {
      teks += ' ' + dua(d.getHours()) + ':' + dua(d.getMinutes());
    }
    return teks;
  }

  function dua(angka) {
    return (angka < 10 ? '0' : '') + angka;
  }

  window.Parser = {
    uraikan: uraikan,
    ringkas: ringkas
  };
})();
