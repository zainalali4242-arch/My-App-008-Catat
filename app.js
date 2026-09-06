/* =====================================================================
   app.js — PENGATUR.

   Tugasnya: memutuskan layar mana yang tampil, menanggapi ketukan,
   memanggil db.js untuk menyimpan, lalu menyuruh views.js menggambar.

   File ini TIDAK menyentuh IndexedDB langsung (semua lewat DB.*)
   dan TIDAK menggambar apa pun sendiri (semua lewat Tampilan.*).
   ===================================================================== */

(function () {
  'use strict';

  // ---------------------------------------------------------------
  // KONSTANTA
  // ---------------------------------------------------------------
  var BATAS_PANJANG_JUDUL = 300;   // hasil dikte bisa panjang sekali
  var KUNCI_KONTEKS = 'catat:konteks-terakhir';

  // Pilihan bawaan setiap kali kartu Pilah Cepat dibuka
  var PILIHAN_BAWAAN = {
    tipe: 'task',
    prioritas: 2,
    kapan: 'nanti',
    konteks: 'kerja'
  };

  // ---------------------------------------------------------------
  // KEADAAN APLIKASI
  // ---------------------------------------------------------------
  var semuaItem = [];        // salinan di memori; sumber kebenaran tetap IndexedDB
  var antreanPilah = [];     // item yang menunggu dipilah
  var pilihanPilah = null;   // pilihan sementara untuk kartu yang sedang tampil
  var layarSekarang = 'layar-daftar';

  // ---------------------------------------------------------------
  // MULAI
  // ---------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    pasangEvent();
    muatUlang().then(function () {
      // ?capture=1 dipakai sebagai pintasan terpisah di layar utama HP (§4.3)
      if (window.location.search.indexOf('capture=1') !== -1) {
        bukaTangkapCepat();
      }
    });
  });

  function pasangEvent() {
    // --- layar daftar ---
    document.getElementById('form-capture')
      .addEventListener('submit', function (ev) {
        ev.preventDefault();
        simpanDariKotakBawah();
      });

    // Satu penangan untuk seluruh baris (event delegation) — lebih hemat
    // daripada memasang penangan di tiap tombol setiap kali menggambar ulang.
    document.getElementById('daftar-aktif').addEventListener('click', klikBaris);
    document.getElementById('daftar-selesai').addEventListener('click', klikBaris);

    // --- semua tombol beratribut data-aksi di seluruh halaman ---
    document.body.addEventListener('click', klikAksi);

    // --- pilihan di kartu Pilah Cepat ---
    document.getElementById('layar-pilah').addEventListener('click', klikPilihan);

    // --- pintasan papan ketik (§7.4) ---
    document.addEventListener('keydown', function (ev) {
      var sedangMengetik = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);

      // Penting: saat sedang mengetik atau mendikte, JANGAN campur tangan.
      if (sedangMengetik) {
        if (ev.key === 'Escape') document.activeElement.blur();
        return;
      }
      if (ev.key === '/' && layarSekarang === 'layar-daftar') {
        ev.preventDefault();
        document.getElementById('input-capture').focus();
      }
    });
  }

  // ---------------------------------------------------------------
  // PENANGAN KETUKAN
  // ---------------------------------------------------------------

  /** Tombol-tombol umum, dikenali dari atribut data-aksi. */
  async function klikAksi(ev) {
    var tombol = ev.target.closest('button[data-aksi]');
    if (!tombol) return;

    var aksi = tombol.dataset.aksi;

    // Aksi baris daftar ditangani terpisah oleh klikBaris()
    if (aksi === 'selesai' || aksi === 'batalkan') return;

    try {
      Tampilan.sembunyikanKesalahan();

      if (aksi === 'buka-tangkap') bukaTangkapCepat();
      else if (aksi === 'buka-pilah') bukaPilahCepat();
      else if (aksi === 'ke-daftar') kembaliKeDaftar();
      else if (aksi === 'simpan-tangkap') await simpanTangkapan(false);
      else if (aksi === 'simpan-lagi') await simpanTangkapan(true);
      else if (aksi === 'simpan-pilah') await simpanPilahan();
      else if (aksi === 'hapus-pilah') await hapusPilahan();
    } catch (e) {
      Tampilan.gambarKesalahan(e.message);
    }
  }

  /** Ketukan pada lingkaran centang di baris daftar. */
  async function klikBaris(ev) {
    var tombol = ev.target.closest('button[data-aksi]');
    if (!tombol) return;

    var id = tombol.closest('li').dataset.id;
    var aksi = tombol.dataset.aksi;

    try {
      if (aksi === 'selesai') {
        await DB.perbaruiItem(id, { status: 'selesai', completedAt: Date.now() });
      } else if (aksi === 'batalkan') {
        await DB.perbaruiItem(id, { status: 'aktif', completedAt: null });
      } else {
        return;
      }
      Tampilan.sembunyikanKesalahan();
      await muatUlang();
    } catch (e) {
      Tampilan.gambarKesalahan(e.message);
    }
  }

  /** Ketukan pada tombol pilihan (Tugas/Catatan/!1/Besok/...) di layar Pilah. */
  function klikPilihan(ev) {
    var tombol = ev.target.closest('button[data-nilai]');
    if (!tombol || !pilihanPilah) return;

    var grup = tombol.closest('[data-grup]').dataset.grup;

    if (grup === 'tipe') pilihanPilah.tipe = tombol.dataset.nilai;
    else if (grup === 'prioritas') pilihanPilah.prioritas = Number(tombol.dataset.nilai);
    else if (grup === 'kapan') pilihanPilah.kapan = tombol.dataset.nilai;
    else if (grup === 'konteks') pilihanPilah.konteks = tombol.dataset.nilai;

    // Catatan tidak punya tenggat
    if (pilihanPilah.tipe === 'note') pilihanPilah.kapan = 'nanti';

    gambarKartuSekarang();
  }

  // ---------------------------------------------------------------
  // AKSI: MENYIMPAN
  // ---------------------------------------------------------------

  /** Kotak capture di bawah layar daftar. Diketik di meja → langsung rapi. */
  async function simpanDariKotakBawah() {
    var input = document.getElementById('input-capture');
    var teks = bersihkanJudul(input.value);
    if (!teks) return;

    input.value = '';   // dikosongkan lebih dulu supaya terasa cepat

    try {
      // triaged: true — diketik dengan sadar, tidak perlu masuk antrean pilah
      await DB.tambahItem({ title: teks, triaged: true, context: konteksTerakhir() });
      Tampilan.sembunyikanKesalahan();
      await muatUlang();
    } catch (e) {
      input.value = teks;   // kembalikan teks agar tidak hilang
      Tampilan.gambarKesalahan(e.message);
    }
  }

  /**
   * Layar Tangkap Cepat. Ditulis atau didikte di lapangan.
   * @param tetapDiLayar true = "Simpan & tambah lagi"
   */
  async function simpanTangkapan(tetapDiLayar) {
    var area = document.getElementById('teks-tangkap');
    var teks = bersihkanJudul(area.value);
    if (!teks) {
      area.focus();
      return;
    }

    area.value = '';

    try {
      // triaged: false — masuk antrean pilah (§4.3)
      await DB.tambahItem({ title: teks, triaged: false, context: konteksTerakhir() });
      await muatUlang();

      Tampilan.toast('Tersimpan. ' + antreanPilah.length + ' item menunggu dipilah.');

      if (tetapDiLayar) {
        area.focus();
      } else {
        kembaliKeDaftar();
      }
    } catch (e) {
      area.value = teks;
      Tampilan.gambarKesalahan(e.message);
    }
  }

  /** Menyimpan hasil pilah, lalu otomatis lanjut ke item berikutnya. */
  async function simpanPilahan() {
    var item = antreanPilah[0];
    if (!item) return;

    var judul = bersihkanJudul(document.getElementById('judul-pilah').value);
    if (!judul) {
      Tampilan.gambarKesalahan('Judul tidak boleh kosong.');
      return;
    }

    var adalahAgenda = (pilihanPilah.tipe === 'event');
    var waktu = hitungWaktu(pilihanPilah.kapan, adalahAgenda);

    await DB.perbaruiItem(item.id, {
      title: judul,
      type: pilihanPilah.tipe,
      priority: pilihanPilah.prioritas,
      context: pilihanPilah.konteks,
      // Tenggat disimpan di dueAt untuk tugas, di startAt untuk agenda (§3)
      dueAt: adalahAgenda ? null : waktu,
      startAt: adalahAgenda ? waktu : null,
      triaged: true
    });

    ingatKonteks(pilihanPilah.konteks);
    await muatUlang();
    lanjutKartuBerikutnya();
  }

  async function hapusPilahan() {
    var item = antreanPilah[0];
    if (!item) return;

    await DB.hapusItem(item.id);
    await muatUlang();
    lanjutKartuBerikutnya();
  }

  // ---------------------------------------------------------------
  // PERPINDAHAN LAYAR
  // ---------------------------------------------------------------

  function bukaTangkapCepat() {
    layarSekarang = 'layar-tangkap';
    Tampilan.gantiLayar(layarSekarang);

    var area = document.getElementById('teks-tangkap');
    area.value = '';
    // Fokus otomatis supaya papan ketik langsung muncul dan tombol
    // mikrofon bawaan terjangkau dalam satu ketukan (§4.3).
    area.focus();
  }

  function bukaPilahCepat() {
    layarSekarang = 'layar-pilah';
    Tampilan.gantiLayar(layarSekarang);
    lanjutKartuBerikutnya();
  }

  function kembaliKeDaftar() {
    layarSekarang = 'layar-daftar';
    Tampilan.gantiLayar(layarSekarang);
  }

  /** Menyiapkan pilihan bawaan untuk item terdepan di antrean, lalu menggambar. */
  function lanjutKartuBerikutnya() {
    var item = antreanPilah[0] || null;

    if (item) {
      pilihanPilah = {
        tipe: PILIHAN_BAWAAN.tipe,
        prioritas: PILIHAN_BAWAAN.prioritas,
        kapan: PILIHAN_BAWAAN.kapan,
        konteks: konteksTerakhir()
      };
    } else {
      pilihanPilah = null;
    }

    gambarKartuSekarang();
  }

  function gambarKartuSekarang() {
    Tampilan.gambarKartuPilah(antreanPilah[0] || null, pilihanPilah, antreanPilah.length);
  }

  // ---------------------------------------------------------------
  // MEMBACA DATA & MENGGAMBAR ULANG
  // ---------------------------------------------------------------

  async function muatUlang() {
    try {
      semuaItem = await DB.ambilSemuaItem();
      hitungUlang();
      gambarSemua();
    } catch (e) {
      Tampilan.gambarKesalahan(e.message);
    }
  }

  function hitungUlang() {
    antreanPilah = semuaItem
      .filter(function (i) { return i.status === 'aktif' && i.triaged === false; })
      .sort(function (a, b) { return a.createdAt - b.createdAt; });  // terlama dulu
  }

  function gambarSemua() {
    var aktif = semuaItem
      .filter(function (i) { return i.status === 'aktif'; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });  // terbaru di atas

    var selesai = semuaItem
      .filter(function (i) { return i.status === 'selesai'; })
      .sort(function (a, b) { return (b.completedAt || 0) - (a.completedAt || 0); });

    Tampilan.gambarRingkasan(aktif.length, selesai.length);
    Tampilan.gambarBannerPilah(antreanPilah.length);
    Tampilan.gambarDaftar(aktif, selesai);

    // Kalau layar Pilah sedang terbuka, kartunya ikut disegarkan
    if (layarSekarang === 'layar-pilah') gambarKartuSekarang();
  }

  // ---------------------------------------------------------------
  // BANTUAN
  // ---------------------------------------------------------------

  function bersihkanJudul(teks) {
    // Hasil dikte sering mengandung baris baru; dijadikan spasi biasa.
    return String(teks || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, BATAS_PANJANG_JUDUL);
  }

  function awalHari(tanggal) {
    var d = new Date(tanggal);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function akhirHari(tanggal) {
    var d = new Date(tanggal);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }

  /**
   * Menerjemahkan tombol "Kapan?" menjadi epoch milidetik.
   *
   * - Tugas  → AKHIR hari (23:59), karena batas waktunya sepanjang hari itu.
   * - Agenda → AWAL hari (00:00), karena jamnya belum diketahui.
   *   Jam untuk agenda baru bisa diisi lewat sintaks /14:00 di Tahap 3.
   *
   * "minggu" = hari Minggu terdekat berikutnya. Kalau hari ini Minggu,
   * yang dimaksud Minggu depan, bukan hari ini.
   * setDate() sudah menangani pergantian bulan dan tahun secara otomatis.
   */
  function hitungWaktu(kapan, adalahAgenda) {
    var tanggal = new Date();

    if (kapan === 'nanti') return null;

    if (kapan === 'besok') {
      tanggal.setDate(tanggal.getDate() + 1);
    } else if (kapan === 'minggu') {
      var selisih = (7 - tanggal.getDay()) % 7;   // getDay(): 0 = Minggu
      if (selisih === 0) selisih = 7;
      tanggal.setDate(tanggal.getDate() + selisih);
    } else if (kapan !== 'hari-ini') {
      return null;
    }

    return adalahAgenda ? awalHari(tanggal) : akhirHari(tanggal);
  }

  /** Konteks yang terakhir dipilih, disimpan agar tidak perlu dipilih ulang. */
  function konteksTerakhir() {
    try {
      return localStorage.getItem(KUNCI_KONTEKS) || PILIHAN_BAWAAN.konteks;
    } catch (e) {
      return PILIHAN_BAWAAN.konteks;   // localStorage bisa diblokir di mode penyamaran
    }
  }

  function ingatKonteks(konteks) {
    try {
      localStorage.setItem(KUNCI_KONTEKS, konteks);
    } catch (e) {
      // Bukan masalah besar kalau gagal — cukup abaikan.
    }
  }
})();
