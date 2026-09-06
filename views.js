/* =====================================================================
   views.js — JURU GAMBAR.

   Aturan file ini:
   - Hanya menggambar. Diberi data, menghasilkan tampilan.
   - TIDAK PERNAH memanggil DB.* dan tidak pernah menyimpan apa pun.
   - Tidak memutuskan apa-apa. Semua keputusan ada di app.js.

   Kenapa dipisah begini? Supaya kalau tampilan dirombak total,
   hanya berkas ini yang perlu disentuh.
   ===================================================================== */

(function () {
  'use strict';

  // ---------------------------------------------------------------
  // KONSTANTA
  // ---------------------------------------------------------------
  var BATAS_TAMPIL_SELESAI = 20;   // hanya 20 item selesai terbaru yang digambar
  var DURASI_TOAST = 2000;         // milidetik (§4.3)

  var penghitungWaktuToast = null;

  // ---------------------------------------------------------------
  // BANTUAN KECIL
  // ---------------------------------------------------------------

  function ambil(id) {
    return document.getElementById(id);
  }

  /** Menampilkan satu elemen dan menyembunyikan yang lain. */
  function tampilkanSatu(daftarId, idTerpilih) {
    daftarId.forEach(function (id) {
      var el = ambil(id);
      if (el) el.hidden = (id !== idTerpilih);
    });
  }

  // ---------------------------------------------------------------
  // LAYAR DAFTAR
  // ---------------------------------------------------------------

  /**
   * Menggambar baris ringkasan di bawah judul.
   * Contoh hasil: "Minggu, 6 Sep · 4 aktif · 2 selesai"
   */
  function gambarRingkasan(jumlahAktif, jumlahSelesai) {
    var tanggal = new Date().toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'short'
    });
    ambil('ringkasan').textContent =
      tanggal + ' · ' + jumlahAktif + ' aktif · ' + jumlahSelesai + ' selesai';
  }

  /**
   * Banner biru "belum dipilah" (§5.1 poin a2).
   * Ditaruh paling atas karena selama antrean ini belum kosong,
   * daftar di bawahnya belum menggambarkan keadaan yang utuh.
   */
  function gambarBannerPilah(jumlah) {
    var banner = ambil('banner-pilah');
    if (jumlah === 0) {
      banner.hidden = true;
      return;
    }
    ambil('teks-banner-pilah').textContent =
      '📥 ' + jumlah + ' item ditangkap di lapangan';
    banner.hidden = false;
  }

  /** Menggambar isi layar daftar dari data yang sudah disiapkan app.js. */
  function gambarDaftar(aktif, selesai) {
    var potonganSelesai = selesai.slice(0, BATAS_TAMPIL_SELESAI);

    isiDaftar(ambil('daftar-aktif'), aktif, false);
    isiDaftar(ambil('daftar-selesai'), potonganSelesai, true);

    ambil('kosong-aktif').hidden = aktif.length > 0;
    ambil('kosong-selesai').hidden = potonganSelesai.length > 0;
    ambil('bagian-selesai').hidden = potonganSelesai.length === 0;
  }

  function isiDaftar(wadah, daftar, sudahSelesai) {
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
    tombol.setAttribute('aria-label',
      (sudahSelesai ? 'Kembalikan ke aktif: ' : 'Tandai selesai: ') + item.title);

    var judul = document.createElement('span');
    judul.className = 'judul-baris';
    judul.textContent = item.title;

    li.appendChild(tombol);
    li.appendChild(judul);

    // Penanda kecil untuk item yang masih menunggu dipilah
    if (item.triaged === false) {
      var tanda = document.createElement('span');
      tanda.className = 'tanda-belum-dipilah';
      tanda.textContent = 'belum dipilah';
      li.appendChild(tanda);
    }

    return li;
  }

  // ---------------------------------------------------------------
  // LAYAR PILAH CEPAT
  // ---------------------------------------------------------------

  /**
   * Menggambar satu kartu pilah.
   * @param item     item yang sedang dipilah, atau null kalau antrean habis
   * @param pilihan  { tipe, prioritas, kapan, konteks } — pilihan sementara
   * @param sisa     berapa item lagi yang menunggu, termasuk yang ini
   */
  function gambarKartuPilah(item, pilihan, sisa) {
    var adaItem = !!item;

    ambil('isi-pilah').hidden = !adaItem;
    ambil('pilah-kosong').hidden = adaItem;
    ambil('sisa-pilah').textContent = adaItem ? ('sisa ' + sisa) : '';

    if (!adaItem) return;

    ambil('judul-pilah').value = item.title;

    tandaiTerpilih('grup-tipe', pilihan.tipe);
    tandaiTerpilih('grup-prioritas', String(pilihan.prioritas));
    tandaiTerpilih('grup-kapan', pilihan.kapan);
    tandaiTerpilih('grup-konteks', pilihan.konteks);

    // Catatan/ide tidak punya tenggat, jadi kelompok "Kapan?" dimatikan.
    var bagianKapan = ambil('bagian-kapan');
    bagianKapan.classList.toggle('tidak-aktif', pilihan.tipe === 'note');
  }

  /** Memberi tanda pada tombol yang sedang terpilih di satu kelompok. */
  function tandaiTerpilih(idGrup, nilai) {
    var tombolTombol = ambil(idGrup).querySelectorAll('button[data-nilai]');
    Array.prototype.forEach.call(tombolTombol, function (t) {
      var terpilih = (t.dataset.nilai === nilai);
      t.classList.toggle('pilihan--aktif', terpilih);
      // aria-pressed memberi tahu pembaca layar tombol mana yang aktif
      t.setAttribute('aria-pressed', terpilih ? 'true' : 'false');
    });
  }

  // ---------------------------------------------------------------
  // PERPINDAHAN LAYAR
  // ---------------------------------------------------------------

  var SEMUA_LAYAR = ['layar-daftar', 'layar-tangkap', 'layar-pilah'];

  function gantiLayar(idLayar) {
    tampilkanSatu(SEMUA_LAYAR, idLayar);
    // Kotak capture bawah hanya relevan di layar daftar
    ambil('form-capture').hidden = (idLayar !== 'layar-daftar');
    document.body.classList.toggle('tanpa-capture', idLayar !== 'layar-daftar');
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------
  // TOAST & PESAN KESALAHAN
  // ---------------------------------------------------------------

  /** Pemberitahuan singkat yang hilang sendiri. Tanpa tombol, tanpa dialog. */
  function toast(pesan) {
    var el = ambil('toast');
    el.textContent = pesan;
    el.hidden = false;
    clearTimeout(penghitungWaktuToast);
    penghitungWaktuToast = setTimeout(function () { el.hidden = true; }, DURASI_TOAST);
  }

  function gambarKesalahan(pesan) {
    var el = ambil('pesan-kesalahan');
    el.textContent = pesan || 'Terjadi kesalahan yang tidak diketahui.';
    el.hidden = false;
  }

  function sembunyikanKesalahan() {
    ambil('pesan-kesalahan').hidden = true;
  }

  // Dipasang ke window supaya bisa dipanggil app.js tanpa build step.
  window.Tampilan = {
    gambarRingkasan: gambarRingkasan,
    gambarBannerPilah: gambarBannerPilah,
    gambarDaftar: gambarDaftar,
    gambarKartuPilah: gambarKartuPilah,
    gantiLayar: gantiLayar,
    toast: toast,
    gambarKesalahan: gambarKesalahan,
    sembunyikanKesalahan: sembunyikanKesalahan
  };
})();
