/* =====================================================================
   app.js — inisialisasi, render daftar, dan penanganan tombol.

   File ini TIDAK BOLEH menyentuh IndexedDB langsung.
   Semua akses data lewat DB.* dari db.js (lihat §7.1 PRD).
   ===================================================================== */

(function () {
  'use strict';

  // ---------------------------------------------------------------
  // KONSTANTA
  // ---------------------------------------------------------------
  var BATAS_TAMPIL_SELESAI = 20;  // hanya tampilkan 20 item selesai terbaru
  var BATAS_PANJANG_JUDUL = 300;  // supaya hasil dikte panjang tidak merusak tampilan

  // ---------------------------------------------------------------
  // ELEMEN HALAMAN — dikumpulkan sekali di awal
  // ---------------------------------------------------------------
  var el = {};

  // Salinan data di memori. Sumber kebenaran tetap IndexedDB;
  // ini hanya agar render tidak perlu membaca database berulang kali.
  var semuaItem = [];

  // ---------------------------------------------------------------
  // MULAI
  // ---------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    el.ringkasan = document.getElementById('ringkasan');
    el.kesalahan = document.getElementById('pesan-kesalahan');
    el.form = document.getElementById('form-capture');
    el.input = document.getElementById('input-capture');
    el.daftarAktif = document.getElementById('daftar-aktif');
    el.daftarSelesai = document.getElementById('daftar-selesai');
    el.kosongAktif = document.getElementById('kosong-aktif');
    el.kosongSelesai = document.getElementById('kosong-selesai');
    el.bagianSelesai = document.getElementById('bagian-selesai');

    pasangEvent();
    muatUlang();
  });

  function pasangEvent() {
    // Simpan item baru. Enter di dalam input otomatis memicu submit.
    el.form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      simpanDariInput();
    });

    // Satu penangan untuk seluruh baris (event delegation) — lebih hemat
    // daripada memasang penangan di tiap tombol setiap kali render.
    el.daftarAktif.addEventListener('click', tanganiKlikBaris);
    el.daftarSelesai.addEventListener('click', tanganiKlikBaris);

    // Pintasan papan ketik (§7.4)
    document.addEventListener('keydown', function (ev) {
      if (ev.key === '/' && document.activeElement !== el.input) {
        ev.preventDefault();
        el.input.focus();
      } else if (ev.key === 'Escape' && document.activeElement === el.input) {
        el.input.blur();
      }
    });
  }

  // ---------------------------------------------------------------
  // AKSI
  // ---------------------------------------------------------------

  async function simpanDariInput() {
    var teks = el.input.value.trim().slice(0, BATAS_PANJANG_JUDUL);
    if (!teks) return;

    // Kosongkan input lebih dulu supaya terasa cepat dan bisa langsung
    // mengetik item berikutnya tanpa menunggu database.
    el.input.value = '';

    try {
      await DB.tambahItem({ title: teks });
      sembunyikanKesalahan();
      await muatUlang();
    } catch (e) {
      el.input.value = teks;   // kembalikan teks agar tidak hilang
      tampilkanKesalahan(e.message);
    }
  }

  async function tanganiKlikBaris(ev) {
    var tombol = ev.target.closest('button[data-aksi]');
    if (!tombol) return;

    var id = tombol.closest('li').dataset.id;
    var aksi = tombol.dataset.aksi;

    try {
      if (aksi === 'selesai') {
        await DB.perbaruiItem(id, { status: 'selesai', completedAt: Date.now() });
      } else if (aksi === 'batalkan') {
        await DB.perbaruiItem(id, { status: 'aktif', completedAt: null });
      }
      sembunyikanKesalahan();
      await muatUlang();
    } catch (e) {
      tampilkanKesalahan(e.message);
    }
  }

  async function muatUlang() {
    try {
      semuaItem = await DB.ambilSemuaItem();
      render();
    } catch (e) {
      tampilkanKesalahan(e.message);
    }
  }

  // ---------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------

  function render() {
    var aktif = semuaItem
      .filter(function (i) { return i.status === 'aktif'; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });  // terbaru di atas

    var selesai = semuaItem
      .filter(function (i) { return i.status === 'selesai'; })
      .sort(function (a, b) { return (b.completedAt || 0) - (a.completedAt || 0); })
      .slice(0, BATAS_TAMPIL_SELESAI);

    renderRingkasan(aktif.length, selesai.length);
    renderDaftar(el.daftarAktif, aktif, false);
    renderDaftar(el.daftarSelesai, selesai, true);

    el.kosongAktif.hidden = aktif.length > 0;
    el.kosongSelesai.hidden = selesai.length > 0;
    el.bagianSelesai.hidden = selesai.length === 0;
  }

  function renderRingkasan(jumlahAktif, jumlahSelesai) {
    var tanggal = new Date().toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'short'
    });
    el.ringkasan.textContent =
      tanggal + ' · ' + jumlahAktif + ' aktif · ' + jumlahSelesai + ' selesai';
  }

  function renderDaftar(wadah, daftar, sudahSelesai) {
    wadah.textContent = '';   // kosongkan isi lama

    daftar.forEach(function (item) {
      wadah.appendChild(buatBaris(item, sudahSelesai));
    });
  }

  /**
   * Membuat satu baris daftar.
   * Judul dipasang lewat textContent, BUKAN innerHTML — supaya teks yang
   * kebetulan mengandung tanda < > tidak ikut dibaca sebagai kode HTML.
   */
  function buatBaris(item, sudahSelesai) {
    var li = document.createElement('li');
    li.className = 'baris' + (sudahSelesai ? ' baris--selesai' : '');
    li.dataset.id = item.id;

    var tombol = document.createElement('button');
    tombol.type = 'button';
    tombol.className = 'kotak-centang';
    tombol.dataset.aksi = sudahSelesai ? 'batalkan' : 'selesai';
    tombol.setAttribute(
      'aria-label',
      sudahSelesai ? 'Kembalikan ke aktif: ' + item.title : 'Tandai selesai: ' + item.title
    );
    tombol.textContent = sudahSelesai ? '✓' : '';

    var judul = document.createElement('span');
    judul.className = 'judul-baris';
    judul.textContent = item.title;

    li.appendChild(tombol);
    li.appendChild(judul);
    return li;
  }

  // ---------------------------------------------------------------
  // PESAN KESALAHAN
  // ---------------------------------------------------------------

  function tampilkanKesalahan(pesan) {
    el.kesalahan.textContent = pesan || 'Terjadi kesalahan yang tidak diketahui.';
    el.kesalahan.hidden = false;
  }

  function sembunyikanKesalahan() {
    el.kesalahan.hidden = true;
  }
})();
