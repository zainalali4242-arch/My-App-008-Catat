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
  function gambarRingkasan(teks) {
    ambil('ringkasan').textContent = teks;
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

  /**
   * Layar Daftar (§5.3) — satu daftar hasil saringan, bukan lagi
   * dua bagian aktif/selesai. Status kini salah satu filter.
   */
  function gambarDaftar(daftar, jumlahTotal) {
    var potongan = daftar.slice(0, Konfigurasi.TAMPILAN.batasDaftar);

    isiDaftar(ambil('daftar-aktif'), potongan, null, { aksiCepat: true });

    ambil('kosong-aktif').hidden = potongan.length > 0;
    ambil('hasil-filter').textContent = ringkasanHasil(daftar.length, potongan.length, jumlahTotal);
  }

  function ringkasanHasil(cocok, ditampilkan, total) {
    if (cocok === 0) return 'Tidak ada yang cocok dari ' + total + ' item.';
    var teks = cocok + ' dari ' + total + ' item';
    if (ditampilkan < cocok) teks += ' · ditampilkan ' + ditampilkan + ' teratas';
    return teks;
  }

  function isiDaftar(wadah, daftar, sudahSelesai, pilihan) {
    wadah.textContent = '';   // kosongkan isi lama
    daftar.forEach(function (item) {
      wadah.appendChild(buatBaris(item, sudahSelesai, pilihan));
    });
  }

  /**
   * Aksi cepat per baris (§5.3): tunda 1 hari, ubah prioritas, hapus.
   * Prioritas dibuat berputar 1→2→3→1 supaya cukup satu tombol,
   * bukan menu yang perlu dibuka.
   */
  function buatAksiCepat(item) {
    var wadah = document.createElement('span');
    wadah.className = 'aksi-cepat';

    wadah.appendChild(tombolKecil('prioritas', '!' + item.priority,
      'Ubah prioritas, sekarang ' + item.priority));
    wadah.appendChild(tombolKecil('tunda', '+1h',
      'Tunda satu hari' + (item.snoozeCount ? ', sudah ditunda ' + item.snoozeCount + 'x' : '')));
    wadah.appendChild(tombolKecil('hapus-baris', '✕', 'Hapus: ' + item.title));

    return wadah;
  }

  function tombolKecil(aksi, teks, label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tombol-kecil';
    b.dataset.aksi = aksi;
    b.textContent = teks;
    b.setAttribute('aria-label', label);
    return b;
  }

  /**
   * Membuat satu baris daftar.
   * Judul dipasang lewat textContent, BUKAN innerHTML — supaya teks yang
   * kebetulan mengandung tanda < > tidak ikut dibaca sebagai kode HTML.
   */
  function buatBaris(item, sudahSelesai, pilihan) {
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
      isi.appendChild(tanda);
    }

    if (pilihan && pilihan.aksiCepat) li.appendChild(buatAksiCepat(item));

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

    // Pemilih tanggal hanya di mode Ubah (lihat catatan di index.html).
    // Isinya diisi app.js, bukan di sini, supaya format tanggal
    // hanya ditulis di satu tempat.
    ambil('baris-tanggal').hidden = !modeUbah;
    ambil('tanggal-berlaku').hidden = true;
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
  // BERANDA / DASHBOARD (§5.1)
  // ---------------------------------------------------------------

  /**
   * Menggambar seluruh isi Beranda.
   * @param d objek berisi bagian-bagian yang sudah dihitung app.js:
   *          { ringkasan, antrean, fokus, agenda, terlambat,
   *            sisaHariIni, tinjau, mingguIni, pengingatBackup }
   */
  function gambarBeranda(d, sekarang) {
    gambarPengingatBackup(d.pengingatBackup);
    gambarBannerPilah(d.antrean);
    gambarRingkasan(d.ringkasan);
    gambarFokus(d.fokus, sekarang);

    isiDaftar(ambil('agenda-hari-ini'), d.agenda, null, null);
    ambil('agenda-kosong').hidden = d.agenda.length > 0;

    isiDaftar(ambil('daftar-terlambat'), d.terlambat, null, { aksiCepat: true });
    ambil('bagian-terlambat').hidden = d.terlambat.length === 0;

    isiDaftar(ambil('daftar-sisa-hari-ini'), d.sisaHariIni, null, { aksiCepat: true });
    ambil('bagian-sisa-hari-ini').hidden = d.sisaHariIni.length === 0;

    gambarTinjau(d.tinjau);

    ambil('ringkasan-minggu').textContent =
      'Minggu ini — selesai: ' + d.mingguIni.selesai + ' · dibuat: ' + d.mingguIni.dibuat +
      (d.mingguIni.dibuat > d.mingguIni.selesai ? ' · beban menumpuk' : '');
  }

  /**
   * Kartu Fokus Sekarang. Setiap kartu menyertakan alasan skornya —
   * supaya urutannya tidak terasa seperti sihir dan bisa dibantah.
   */
  function gambarFokus(daftar, sekarang) {
    var wadah = ambil('fokus-sekarang');
    wadah.textContent = '';

    daftar.forEach(function (item) {
      var kartu = document.createElement('div');
      kartu.className = 'kartu-fokus';
      kartu.dataset.id = item.id;

      var tombol = document.createElement('button');
      tombol.type = 'button';
      tombol.className = 'kotak-centang';
      tombol.dataset.aksi = 'selesai';
      tombol.setAttribute('aria-label', 'Tandai selesai: ' + item.title);

      var teks = document.createElement('button');
      teks.type = 'button';
      teks.className = 'isi-baris';
      teks.dataset.aksi = 'buka-ubah';
      teks.setAttribute('aria-label', 'Ubah: ' + item.title);

      var judul = document.createElement('span');
      judul.className = 'judul-kartu-fokus';
      judul.textContent = item.title;
      teks.appendChild(judul);

      var alasan = document.createElement('span');
      alasan.className = 'alasan-skor';
      alasan.textContent = Skor.jelaskanSkor(item, sekarang);
      teks.appendChild(alasan);

      kartu.appendChild(tombol);
      kartu.appendChild(teks);
      wadah.appendChild(kartu);
    });

    ambil('fokus-kosong').hidden = daftar.length > 0;
  }

  /** Kotak kuning "Perlu ditinjau" (§5.1 f) — pencegah kuburan tugas. */
  function gambarTinjau(daftar) {
    var wadah = ambil('daftar-tinjau');
    wadah.textContent = '';

    daftar.forEach(function (baris) {
      var li = document.createElement('li');
      li.className = 'baris';
      li.dataset.id = baris.item.id;

      var isi = document.createElement('button');
      isi.type = 'button';
      isi.className = 'isi-baris';
      isi.dataset.aksi = 'buka-ubah';
      isi.setAttribute('aria-label', 'Ubah: ' + baris.item.title);

      var judul = document.createElement('span');
      judul.className = 'judul-baris';
      judul.textContent = baris.item.title;
      isi.appendChild(judul);

      var sebab = document.createElement('span');
      sebab.className = 'cuplikan-isi';
      sebab.textContent = baris.alasan;
      isi.appendChild(sebab);

      li.appendChild(isi);
      li.appendChild(tombolKecil('hapus-baris', '✕', 'Hapus: ' + baris.item.title));
      wadah.appendChild(li);
    });

    ambil('bagian-tinjau').hidden = daftar.length === 0;
  }

  function gambarPengingatBackup(status) {
    var banner = ambil('banner-backup');
    if (!status || !status.tampil) {
      banner.hidden = true;
      return;
    }
    ambil('teks-banner-backup').textContent = (status.hariLalu === null)
      ? 'Belum pernah membuat cadangan. Data bisa hilang tanpa peringatan.'
      : 'Terakhir backup ' + status.hariLalu + ' hari lalu.';
    banner.hidden = false;
  }

  // ---------------------------------------------------------------
  // CATATAN & IDE (§5.4)
  // ---------------------------------------------------------------

  function gambarCatatan(daftar) {
    var wadah = ambil('kartu-catatan');
    wadah.textContent = '';

    daftar.forEach(function (item) {
      var kartu = document.createElement('article');
      kartu.className = 'kartu-catatan';
      kartu.dataset.id = item.id;

      var teks = document.createElement('button');
      teks.type = 'button';
      teks.className = 'isi-baris';
      teks.dataset.aksi = 'buka-ubah';
      teks.setAttribute('aria-label', 'Ubah: ' + item.title);

      var judul = document.createElement('span');
      judul.className = 'judul-kartu-fokus';
      judul.textContent = item.title;
      teks.appendChild(judul);

      if (item.body) {
        var isi = document.createElement('span');
        isi.className = 'isi-kartu-catatan';
        isi.textContent = item.body;
        teks.appendChild(isi);
      }

      kartu.appendChild(teks);

      var kaki = document.createElement('div');
      kaki.className = 'kaki-kartu';

      var jadikan = document.createElement('button');
      jadikan.type = 'button';
      jadikan.className = 'tombol-teks';
      jadikan.dataset.aksi = 'jadikan-task';
      jadikan.textContent = 'Jadikan task →';
      kaki.appendChild(jadikan);

      kaki.appendChild(tombolKecil('hapus-baris', '✕', 'Hapus: ' + item.title));
      kartu.appendChild(kaki);

      wadah.appendChild(kartu);
    });

    ambil('catatan-kosong').hidden = daftar.length > 0;
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

    var label = Parser.ringkas(hasil);
    // Agenda tanpa tanggal tidak punya tempat di Beranda — beri tahu
    // sebelum disimpan, bukan setelah pengguna bingung mencarinya.
    if (hasil.type === 'event' && hasil.startAt === null) {
      label += ' — tanpa tanggal, tidak akan muncul di Agenda hari ini';
    }
    ambil('pratinjau-label').textContent = label;
    kotak.hidden = false;
  }

  // ---------------------------------------------------------------
  // PERPINDAHAN LAYAR
  // ---------------------------------------------------------------

  var SEMUA_LAYAR = [
    'layar-beranda', 'layar-daftar', 'layar-catatan',
    'layar-pengaturan', 'layar-tangkap', 'layar-pilah'
  ];

  // Layar yang punya tombol di navigasi atas
  var LAYAR_BERTAB = ['layar-beranda', 'layar-daftar', 'layar-catatan', 'layar-pengaturan'];

  function gantiLayar(idLayar) {
    tampilkanSatu(SEMUA_LAYAR, idLayar);

    // Kotak capture bawah hanya relevan di Beranda dan Daftar —
    // di layar lain ia justru menutupi isi (lihat catatan [hidden] di CSS).
    var pakaiCapture = (idLayar === 'layar-daftar' || idLayar === 'layar-beranda');
    ambil('form-capture').hidden = !pakaiCapture;
    ambil('pratinjau').hidden = true;
    document.body.classList.toggle('tanpa-capture', !pakaiCapture);

    // Sorot tab yang sedang aktif
    var tabTab = document.querySelectorAll('.tab[data-tujuan]');
    Array.prototype.forEach.call(tabTab, function (t) {
      var aktif = (t.dataset.tujuan === idLayar);
      t.classList.toggle('tab--aktif', aktif);
      t.setAttribute('aria-current', aktif ? 'page' : 'false');
    });
    ambil('navigasi-wadah').hidden = (LAYAR_BERTAB.indexOf(idLayar) === -1);

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
    gambarBeranda: gambarBeranda,
    gambarCatatan: gambarCatatan,
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
