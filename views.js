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

    // Judul dibuat sebagai tombol, bukan teks biasa, supaya bisa diketuk
    // untuk membuka mode Ubah — dan supaya tetap terjangkau lewat papan
    // ketik dan pembaca layar.
    var isi = document.createElement('button');
    isi.type = 'button';
    isi.className = 'isi-baris';
    isi.dataset.aksi = 'buka-ubah';
    isi.setAttribute('aria-label', 'Ubah: ' + item.title);

    var judul = document.createElement('span');
    judul.className = 'judul-baris';
    judul.textContent = item.title;
    isi.appendChild(judul);

    // Baris kedua berisi awal catatan, kalau ada isinya
    if (item.body) {
      var cuplikan = document.createElement('span');
      cuplikan.className = 'cuplikan-isi';
      cuplikan.textContent = item.body;
      isi.appendChild(cuplikan);
    }

    li.appendChild(tombol);
    li.appendChild(isi);

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
   * Menggambar kartu item. Dipakai untuk dua keperluan:
   *
   *   mode 'pilah' — memilah tangkapan lapangan, satu demi satu
   *   mode 'ubah'  — memperbaiki item yang sudah ada
   *
   * @param item     item yang ditampilkan, atau null kalau antrean habis
   * @param pilihan  { tipe, prioritas, kapan, konteks } — pilihan sementara.
   *                 `kapan` boleh null yang berarti "jangan ubah tanggalnya".
   * @param sisa     sisa antrean (hanya dipakai di mode pilah)
   * @param mode     'pilah' atau 'ubah'
   */
  function gambarKartu(item, pilihan, sisa, mode) {
    var adaItem = !!item;
    var modeUbah = (mode === 'ubah');

    ambil('isi-pilah').hidden = !adaItem;
    ambil('pilah-kosong').hidden = adaItem;
    ambil('judul-kartu').textContent = modeUbah ? 'Ubah item' : 'Pilah Cepat';
    ambil('sisa-pilah').textContent = (adaItem && !modeUbah) ? ('sisa ' + sisa) : '';

    if (!adaItem) return;

    ambil('judul-pilah').value = item.title;

    // Kolom isi hanya muncul saat mengubah, tidak saat memilah
    ambil('bagian-isi').hidden = !modeUbah;
    if (modeUbah) ambil('isi-item').value = item.body || '';

    tandaiTerpilih('grup-tipe', pilihan.tipe);
    tandaiTerpilih('grup-prioritas', String(pilihan.prioritas));
    tandaiTerpilih('grup-kapan', pilihan.kapan);
    tandaiTerpilih('grup-konteks', pilihan.konteks);

    // Catatan/ide tidak punya tenggat, jadi kelompok "Kapan?" dimatikan.
    ambil('bagian-kapan').classList.toggle('tidak-aktif', pilihan.tipe === 'note');

    gambarTanggalBerlaku(item, pilihan, modeUbah);
  }

  /**
   * Di mode Ubah, tidak ada tombol Kapan yang tersorot sampai pengguna
   * menyentuhnya — supaya tanggal seperti "27 Sep" dari sintaks /27 tidak
   * diam-diam tertimpa. Tanggal yang berlaku ditulis di sini sebagai teks.
   */
  function gambarTanggalBerlaku(item, pilihan, modeUbah) {
    var baris = ambil('tanggal-berlaku');

    if (!modeUbah || pilihan.kapan !== null) {
      baris.hidden = true;
      return;
    }

    var waktu = (item.startAt !== null && item.startAt !== undefined)
      ? item.startAt : item.dueAt;

    baris.textContent = (waktu === null || waktu === undefined)
      ? 'Sekarang tanpa tanggal. Tidak berubah kalau tombol di atas tidak disentuh.'
      : 'Sekarang: ' + tulisTanggal(waktu) + '. Tidak berubah kalau tombol di atas tidak disentuh.';
    baris.hidden = false;
  }

  function tulisTanggal(epoch) {
    var d = new Date(epoch);
    var teks = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
    // Jam ditampilkan hanya kalau memang bermakna, bukan 00:00 atau 23:59
    var jam = d.getHours(), menit = d.getMinutes();
    var jamBermakna = !((jam === 0 && menit === 0) || (jam === 23 && menit === 59));
    if (jamBermakna) {
      teks += ' ' + (jam < 10 ? '0' : '') + jam + ':' + (menit < 10 ? '0' : '') + menit;
    }
    return teks;
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
  // PRATINJAU SINTAKS (§4)
  // ---------------------------------------------------------------

  /**
   * Menampilkan hasil pembacaan sintaks tepat di atas kotak capture,
   * langsung saat mengetik. Tujuannya supaya sintaksnya dipelajari
   * sambil dipakai, tanpa perlu membuka dokumentasi.
   *
   * @param hasil objek dari Parser.uraikan(), atau null untuk menyembunyikan
   */
  function gambarPratinjau(hasil) {
    var kotak = ambil('pratinjau');

    if (!hasil) {
      kotak.hidden = true;
      return;
    }

    ambil('pratinjau-judul').textContent = hasil.title || '(judul masih kosong)';
    ambil('pratinjau-label').textContent = Parser.ringkas(hasil);
    kotak.hidden = false;
  }

  // ---------------------------------------------------------------
  // PERPINDAHAN LAYAR
  // ---------------------------------------------------------------

  var SEMUA_LAYAR = ['layar-daftar', 'layar-tangkap', 'layar-pilah'];

  function gantiLayar(idLayar) {
    tampilkanSatu(SEMUA_LAYAR, idLayar);
    // Kotak capture bawah hanya relevan di layar daftar
    ambil('form-capture').hidden = (idLayar !== 'layar-daftar');
    ambil('pratinjau').hidden = true;
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
    gambarKartu: gambarKartu,
    gambarPratinjau: gambarPratinjau,
    gantiLayar: gantiLayar,
    toast: toast,
    gambarKesalahan: gambarKesalahan,
    sembunyikanKesalahan: sembunyikanKesalahan
  };
})();
