/* =====================================================================
   config.js — SEMUA ANGKA PENGATUR ADA DI SINI.

   PRD §5.2 meminta bobot skor disimpan di satu tempat supaya mudah
   disetel ulang setelah dipakai beberapa minggu. Jangan menaruh angka
   ajaib di score.js atau app.js — taruh di sini.

   Bobot prioritas bisa diubah pengguna lewat layar Pengaturan (§5.5);
   nilai ubahannya disimpan di localStorage dan menimpa nilai bawaan.
   ===================================================================== */

(function () {
  'use strict';

  var KUNCI_BOBOT = 'catat:bobot-prioritas';

  // Nilai bawaan, persis seperti tertulis di PRD §5.2
  var BAWAAN = {
    prioritas: { 1: 100, 2: 60, 3: 30 },

    urgensi: {
      terlambatDasar: 80,       // tambahan dasar untuk item yang lewat tenggat
      terlambatPerHari: 5,      // tambahan per hari keterlambatan
      terlambatMaksimal: 40,    // batas atas tambahan keterlambatan
      hariIni: 60,
      besok: 40,
      dalamSeminggu: 20,        // 2 sampai 7 hari lagi
      lebihJauh: 5,
      tanpaTanggal: 0
    },

    // Mencegah tugas lama tenggelam selamanya
    usiaMaksimal: 20
  };

  // Ambang batas untuk kotak "Perlu ditinjau" (§5.1 f)
  var TINJAUAN = {
    minimalDitunda: 3,          // ditunda 3x atau lebih
    hariTanpaTanggal: 14,       // tugas aktif tanpa tenggat, lebih tua dari ini
    hariIdeMenganggur: 30       // catatan yang tidak ditindaklanjuti
  };

  var TAMPILAN = {
    kartuFokus: 3,              // §5.1 b — sengaja hanya tiga
    batasDaftar: 200,           // berapa baris digambar sekaligus di layar Daftar
    hariRingkasan: 7            // rentang "minggu ini" pada ringkasan §5.1 g
  };

  var BACKUP = {
    ingatkanSetelahHari: 7      // §6 — banner kuning kalau lewat sekian hari
  };

  /** Membaca bobot prioritas, termasuk ubahan pengguna kalau ada. */
  function bobotPrioritas() {
    try {
      var tersimpan = JSON.parse(localStorage.getItem(KUNCI_BOBOT) || 'null');
      if (tersimpan && tersimpan[1] && tersimpan[2] && tersimpan[3]) {
        return { 1: Number(tersimpan[1]), 2: Number(tersimpan[2]), 3: Number(tersimpan[3]) };
      }
    } catch (e) {
      // localStorage bisa diblokir; pakai bawaan saja
    }
    return BAWAAN.prioritas;
  }

  function simpanBobotPrioritas(bobot) {
    localStorage.setItem(KUNCI_BOBOT, JSON.stringify(bobot));
  }

  function kembalikanBobotBawaan() {
    try { localStorage.removeItem(KUNCI_BOBOT); } catch (e) { /* abaikan */ }
  }

  window.Konfigurasi = {
    BAWAAN: BAWAAN,
    TINJAUAN: TINJAUAN,
    TAMPILAN: TAMPILAN,
    BACKUP: BACKUP,
    bobotPrioritas: bobotPrioritas,
    simpanBobotPrioritas: simpanBobotPrioritas,
    kembalikanBobotBawaan: kembalikanBobotBawaan
  };
})();
