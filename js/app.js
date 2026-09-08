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
  var BATAS_PANJANG_ISI = 5000;    // isi catatan panjang, tapi tetap ada batasnya
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
  var modeKartu = 'pilah';   // 'pilah' (antrean) atau 'ubah' (item lama)
  var idDiubah = null;       // id item yang sedang dibuka di mode ubah
  var layarAsal = 'layar-beranda';   // layar yang ditinggalkan saat membuka kartu/tangkap
  var layarSekarang = 'layar-beranda';
  var berkasImpor = null;    // hasil pemeriksaan berkas cadangan yang menunggu konfirmasi

  // ---------------------------------------------------------------
  // MULAI
  // ---------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    pasangEvent();
    Tampilan.gantiLayar(layarSekarang);
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

    // Pratinjau hasil pembacaan sintaks, disegarkan tiap ketukan tombol.
    // Memakai event 'input' (bukan 'keydown') supaya hasil dikte dan
    // tempel-salin ikut terbaca — dikte tidak menghasilkan event tombol.
    document.getElementById('input-capture')
      .addEventListener('input', segarkanPratinjau);

    // Satu penangan untuk seluruh baris (event delegation) — lebih hemat
    // daripada memasang penangan di tiap tombol setiap kali menggambar ulang.
    document.getElementById('daftar-aktif').addEventListener('click', klikBaris);

    // --- semua tombol beratribut data-aksi di seluruh halaman ---
    document.body.addEventListener('click', klikAksi);

    // --- navigasi antar layar ---
    document.getElementById('navigasi-wadah').addEventListener('click', function (ev) {
      var tab = ev.target.closest('button[data-tujuan]');
      if (tab) pindahLayar(tab.dataset.tujuan);
    });

    // --- filter dan pencarian di layar Daftar ---
    ['cari', 'filter-tipe', 'filter-konteks', 'filter-status',
     'filter-prioritas', 'filter-waktu', 'urut'].forEach(function (id) {
      var el = document.getElementById(id);
      el.addEventListener('input', gambarSemua);
      el.addEventListener('change', gambarSemua);
    });

    // --- daftar-daftar yang punya baris bisa diketuk ---
    ['daftar-terlambat', 'daftar-sisa-hari-ini', 'daftar-tinjau',
     'agenda-hari-ini', 'fokus-sekarang', 'kartu-catatan'].forEach(function (id) {
      document.getElementById(id).addEventListener('click', klikBaris);
    });

    // --- pemilih berkas cadangan ---
    document.getElementById('berkas-impor').addEventListener('change', pilihBerkasImpor);

    // --- kotak konfirmasi "HAPUS" ---
    document.getElementById('konfirmasi-hapus').addEventListener('input', function (ev) {
      document.querySelector('button[data-aksi="hapus-semua"]').disabled =
        (ev.target.value.trim() !== 'HAPUS');
    });

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
      else if (aksi === 'buka-ubah') bukaUbah(tombol.closest('li').dataset.id);
      else if (aksi === 'buka-pilah') bukaPilahCepat();
      else if (aksi === 'ke-daftar') kembaliKeDaftar();
      else if (aksi === 'simpan-tangkap') await simpanTangkapan(false);
      else if (aksi === 'simpan-lagi') await simpanTangkapan(true);
      else if (aksi === 'simpan-pilah') await simpanKartu();
      else if (aksi === 'hapus-pilah') await hapusKartu();
      else if (aksi === 'kosongkan-tanggal') isiKolomTanggal(null, pilihanPilah && pilihanPilah.tipe);
      else if (aksi === 'reset-filter') bersihkanFilter();
      else if (aksi === 'salin-ringkasan') await salinRingkasan();
      else if (aksi === 'ekspor') await unduhCadangan();
      else if (aksi === 'tutup-banner-backup') tutupPengingatBackup();
      else if (aksi === 'impor-gabung') await jalankanImpor('gabung');
      else if (aksi === 'impor-ganti') await jalankanImpor('ganti');
      else if (aksi === 'simpan-bobot') simpanBobot();
      else if (aksi === 'bobot-bawaan') kembalikanBobot();
      else if (aksi === 'hapus-semua') await hapusSemuaData();
    } catch (e) {
      Tampilan.gambarKesalahan(e.message);
    }
  }

  /** Ketukan pada lingkaran centang di baris daftar. */
  async function klikBaris(ev) {
    var tombol = ev.target.closest('button[data-aksi]');
    if (!tombol) return;

    var aksi = tombol.dataset.aksi;
    var AKSI_BARIS = ['selesai', 'batalkan', 'tunda', 'prioritas', 'hapus-baris', 'jadikan-task'];
    if (AKSI_BARIS.indexOf(aksi) === -1) return;

    var wadah = tombol.closest('[data-id]');
    if (!wadah) return;
    var id = wadah.dataset.id;

    try {
      Tampilan.sembunyikanKesalahan();

      if (aksi === 'selesai') {
        await DB.perbaruiItem(id, { status: 'selesai', completedAt: Date.now() });
      } else if (aksi === 'batalkan') {
        await DB.perbaruiItem(id, { status: 'aktif', completedAt: null });
      } else if (aksi === 'tunda') {
        await tundaSehari(id);
      } else if (aksi === 'prioritas') {
        await putarPrioritas(id);
      } else if (aksi === 'hapus-baris') {
        var item = cariItem(id);
        if (!item) return;
        if (!window.confirm('Hapus "' + item.title + '"? Tidak bisa dibatalkan.')) return;
        await DB.hapusItem(id);
      } else if (aksi === 'jadikan-task') {
        await jadikanTask(id);
        return;   // jadikanTask sudah memindahkan layar sendiri
      }

      await muatUlang();
    } catch (e) {
      Tampilan.gambarKesalahan(e.message);
    }
  }

  function cariItem(id) {
    return semuaItem.filter(function (i) { return i.id === id; })[0] || null;
  }

  /**
   * Tunda 1 hari (§5.3). snoozeCount ikut naik — itulah yang nanti
   * memunculkan item di kotak "Perlu ditinjau" setelah ditunda 3 kali.
   * Item tanpa tenggat ditunda dari hari ini.
   */
  async function tundaSehari(id) {
    var item = cariItem(id);
    if (!item) return;

    var adalahAgenda = (item.type === 'event');
    var acuan = Skor.tenggatItem(item);
    if (acuan === null) acuan = Date.now();

    var baru = new Date(acuan);
    baru.setDate(baru.getDate() + 1);
    var waktu = adalahAgenda ? awalHari(baru) : akhirHari(baru);

    await DB.perbaruiItem(id, {
      dueAt: adalahAgenda ? null : waktu,
      startAt: adalahAgenda ? waktu : null,
      snoozeCount: (item.snoozeCount || 0) + 1
    });
  }

  /** Prioritas berputar 1 → 2 → 3 → 1, supaya cukup satu tombol. */
  async function putarPrioritas(id) {
    var item = cariItem(id);
    if (!item) return;
    var baru = (item.priority % 3) + 1;
    await DB.perbaruiItem(id, { priority: baru });
  }

  /** §5.4 — ide mentah menjadi tindakan. Prioritas dan tanggal diminta di kartu. */
  async function jadikanTask(id) {
    await DB.perbaruiItem(id, { type: 'task' });
    await muatUlang();
    bukaUbah(id);
    Tampilan.toast('Sekarang jadi tugas. Tentukan prioritas dan tanggalnya.');
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

    // Di mode ubah, tombol Kapan hanyalah pintasan pengisi kolom tanggal.
    // Yang tersimpan nanti selalu isi kolom, bukan tombol yang tersorot.
    if (modeKartu === 'ubah' && grup === 'kapan') {
      isiKolomTanggal(hitungWaktu(pilihanPilah.kapan, pilihanPilah.tipe === 'event'),
                      pilihanPilah.tipe);
    }

    gambarKartuSekarang();
  }

  // ---------------------------------------------------------------
  // PRATINJAU SINTAKS
  // ---------------------------------------------------------------

  function segarkanPratinjau() {
    var teks = document.getElementById('input-capture').value;
    if (!teks.trim()) {
      Tampilan.gambarPratinjau(null);
      return;
    }
    Tampilan.gambarPratinjau(Parser.uraikan(teks, Date.now()));
  }

  // ---------------------------------------------------------------
  // AKSI: MENYIMPAN
  // ---------------------------------------------------------------

  /** Kotak capture di bawah layar daftar. Diketik di meja → langsung rapi. */
  async function simpanDariKotakBawah() {
    var input = document.getElementById('input-capture');
    var mentah = input.value;
    if (!bersihkanJudul(mentah)) return;

    var item = siapkanDariTeks(mentah, true);
    if (!item.title) {
      Tampilan.gambarKesalahan('Judul kosong — token saja tidak cukup.');
      return;
    }

    input.value = '';                 // dikosongkan lebih dulu supaya terasa cepat
    Tampilan.gambarPratinjau(null);

    try {
      await DB.tambahItem(item);
      Tampilan.sembunyikanKesalahan();
      await muatUlang();
    } catch (e) {
      input.value = mentah;           // kembalikan teks agar tidak hilang
      segarkanPratinjau();
      Tampilan.gambarKesalahan(e.message);
    }
  }

  /**
   * Menjalankan parser lalu menyusun item siap simpan.
   *
   * @param diMeja true kalau diketik di kotak bawah (selalu langsung rapi).
   *               Untuk tangkapan lapangan, item hanya dianggap rapi
   *               kalau memang mengandung token (§4.3).
   */
  function siapkanDariTeks(mentah, diMeja) {
    var baca = Parser.uraikan(mentah, Date.now());

    if (baca.context === 'kerja' && !mentah.match(/@(kerja|pribadi)/i)) {
      // Konteks tidak disebut → pakai pilihan terakhir, bukan bawaan parser
      baca.context = konteksTerakhir();
    }

    return {
      title: baca.title,
      type: baca.type,
      priority: baca.priority,
      context: baca.context,
      tags: baca.tags,
      dueAt: baca.dueAt,
      startAt: baca.startAt,
      triaged: diMeja ? true : baca.adaToken
    };
  }

  /**
   * Layar Tangkap Cepat. Ditulis atau didikte di lapangan.
   * @param tetapDiLayar true = "Simpan & tambah lagi"
   */
  async function simpanTangkapan(tetapDiLayar) {
    var area = document.getElementById('teks-tangkap');
    var mentah = area.value;
    var item = siapkanDariTeks(mentah, false);
    if (!item.title) {
      area.focus();
      return;
    }

    area.value = '';

    try {
      // Bertoken → sudah rapi. Tanpa token → masuk antrean pilah (§4.3).
      await DB.tambahItem(item);
      await muatUlang();

      // Dua kabar berbeda: item ini sendiri sudah rapi atau belum,
      // dan berapa total yang masih menunggu dipilah.
      var kabar = item.triaged ? 'Tersimpan rapi.' : 'Tersimpan.';
      if (antreanPilah.length > 0) {
        kabar += ' ' + antreanPilah.length + ' item menunggu dipilah.';
      }
      Tampilan.toast(kabar);

      if (tetapDiLayar) {
        area.focus();
      } else {
        kembaliKeDaftar();
      }
    } catch (e) {
      area.value = mentah;
      Tampilan.gambarKesalahan(e.message);
    }
  }

  /** Menyimpan hasil pilah, lalu otomatis lanjut ke item berikutnya. */
  /** Menyimpan kartu, baik dari antrean pilah maupun dari mode ubah. */
  async function simpanKartu() {
    var item = itemKartu();
    if (!item) return;

    var judul = bersihkanJudul(document.getElementById('judul-pilah').value);
    if (!judul) {
      Tampilan.gambarKesalahan('Judul tidak boleh kosong.');
      return;
    }

    var adalahAgenda = (pilihanPilah.tipe === 'event');

    // kapan === null hanya terjadi di mode ubah, artinya "jangan diubah".
    // Waktu lama diambil dari mana pun ia tersimpan, lalu ditaruh ulang
    // sesuai tipe yang berlaku sekarang — supaya tugas yang diubah jadi
    // agenda tetap membawa tanggalnya.
    // Mode ubah: sumber kebenaran adalah kolom tanggal yang terlihat,
    // bukan tombol yang tersorot. Mode pilah tetap memakai tombol.
    var waktu = (modeKartu === 'ubah')
      ? bacaKolomTanggal(pilihanPilah.tipe)
      : hitungWaktu(pilihanPilah.kapan, adalahAgenda);

    var perubahan = {
      title: judul,
      type: pilihanPilah.tipe,
      priority: pilihanPilah.prioritas,
      context: pilihanPilah.konteks,
      dueAt: adalahAgenda ? null : waktu,
      startAt: adalahAgenda ? waktu : null,
      triaged: true
    };

    // Isi panjang hanya bisa diubah di mode ubah
    if (modeKartu === 'ubah') {
      perubahan.body = bersihkanIsi(document.getElementById('isi-item').value);
    }

    await DB.perbaruiItem(item.id, perubahan);
    ingatKonteks(pilihanPilah.konteks);
    await muatUlang();

    if (modeKartu === 'ubah') {
      kembaliKeDaftar();
      Tampilan.toast('Perubahan tersimpan.');
    } else {
      lanjutKartuBerikutnya();
    }
  }

  async function hapusKartu() {
    var item = itemKartu();
    if (!item) return;

    // Saat memilah, yang dihapus adalah tangkapan mentah yang baru saja
    // dibuat — cepat lebih penting. Saat mengubah, yang dihapus adalah
    // sesuatu yang sudah dirapikan, jadi wajar dikonfirmasi dulu.
    if (modeKartu === 'ubah') {
      var yakin = window.confirm('Hapus "' + item.title + '"? Tindakan ini tidak bisa dibatalkan.');
      if (!yakin) return;
    }

    await DB.hapusItem(item.id);
    await muatUlang();

    if (modeKartu === 'ubah') {
      kembaliKeDaftar();
      Tampilan.toast('Item dihapus.');
    } else {
      lanjutKartuBerikutnya();
    }
  }

  // ---------------------------------------------------------------
  // PERPINDAHAN LAYAR
  // ---------------------------------------------------------------

  /** Item yang sedang tampil di kartu, tergantung modenya. */
  function itemKartu() {
    if (modeKartu === 'ubah') {
      return semuaItem.filter(function (i) { return i.id === idDiubah; })[0] || null;
    }
    return antreanPilah[0] || null;
  }

  function bukaTangkapCepat() {
    ingatLayarAsal();
    layarSekarang = 'layar-tangkap';
    Tampilan.gantiLayar(layarSekarang);

    var area = document.getElementById('teks-tangkap');
    area.value = '';
    // Fokus otomatis supaya papan ketik langsung muncul dan tombol
    // mikrofon bawaan terjangkau dalam satu ketukan (§4.3).
    area.focus();
  }

  function bukaPilahCepat() {
    ingatLayarAsal();
    modeKartu = 'pilah';
    idDiubah = null;
    layarSekarang = 'layar-pilah';
    Tampilan.gantiLayar(layarSekarang);
    lanjutKartuBerikutnya();
  }

  /**
   * Membuka kartu untuk memperbaiki item yang sudah ada.
   *
   * Perhatikan `kapan: null`. Tombol "Kapan?" sengaja tidak ada yang
   * tersorot: tanggal seperti 27 Sep tidak bisa diwakili oleh empat tombol
   * itu, jadi kalau salah satunya disorot, tanggal aslinya akan tertimpa
   * begitu Simpan ditekan. null berarti "biarkan tanggalnya apa adanya".
   */
  function bukaUbah(id) {
    var item = semuaItem.filter(function (i) { return i.id === id; })[0];
    if (!item) return;

    ingatLayarAsal();
    modeKartu = 'ubah';
    idDiubah = id;

    pilihanPilah = {
      tipe: item.type,
      prioritas: item.priority,
      kapan: null,
      konteks: item.context
    };

    layarSekarang = 'layar-pilah';
    Tampilan.gantiLayar(layarSekarang);
    isiKolomTanggal(Skor.tenggatItem(item), item.type);
    gambarKartuSekarang();
  }

  function pindahLayar(idLayar) {
    layarSekarang = idLayar;
    modeKartu = 'pilah';
    idDiubah = null;
    Tampilan.gantiLayar(idLayar);
    gambarSemua();
  }

  /**
   * Layar sementara (Tangkap, Pilah, Ubah) selalu dibuka dari salah satu
   * layar bertab. Asalnya dicatat supaya tombol Kembali mengembalikan
   * pengguna ke tempat semula — termasuk filter yang sedang dipakai —
   * bukan melemparkannya ke Beranda.
   */
  function ingatLayarAsal() {
    var LAYAR_SEMENTARA = ['layar-tangkap', 'layar-pilah'];
    if (LAYAR_SEMENTARA.indexOf(layarSekarang) === -1) layarAsal = layarSekarang;
  }

  /** Kembali dari layar kartu/tangkap ke layar tempat ia dibuka. */
  function kembaliKeDaftar() {
    pindahLayar(layarAsal || 'layar-beranda');
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
    Tampilan.gambarKartu(itemKartu(), pilihanPilah, antreanPilah.length, modeKartu);
  }

  // ---------------------------------------------------------------
  // KOLOM TANGGAL & JAM (mode Ubah)
  // ---------------------------------------------------------------

  function dua(n) { return (n < 10 ? '0' : '') + n; }

  /**
   * Mengisi kolom tanggal dan jam dari sebuah waktu.
   * @param waktu epoch milidetik, atau null untuk mengosongkan
   * @param tipe  menentukan jam bawaan yang disembunyikan dari tampilan
   */
  function isiKolomTanggal(waktu, tipe) {
    var kolomTanggal = document.getElementById('tanggal-item');
    var kolomJam = document.getElementById('jam-item');

    if (waktu === null || waktu === undefined) {
      kolomTanggal.value = '';
      kolomJam.value = '';
      return;
    }

    var d = new Date(waktu);
    kolomTanggal.value = d.getFullYear() + '-' + dua(d.getMonth() + 1) + '-' + dua(d.getDate());

    // Jam bawaan (23:59 untuk tugas, 00:00 untuk agenda) berarti
    // "jamnya belum ditentukan", jadi kolom jam dibiarkan kosong.
    var jamBawaan = (tipe === 'event')
      ? (d.getHours() === 0 && d.getMinutes() === 0)
      : (d.getHours() === 23 && d.getMinutes() === 59);

    kolomJam.value = jamBawaan ? '' : dua(d.getHours()) + ':' + dua(d.getMinutes());
  }

  /**
   * Membaca kolom tanggal dan jam menjadi satu angka epoch.
   * @returns epoch, atau null kalau tanggalnya dikosongkan
   */
  function bacaKolomTanggal(tipe) {
    var nilaiTanggal = document.getElementById('tanggal-item').value;
    if (!nilaiTanggal) return null;

    var bagian = nilaiTanggal.split('-');
    var tahun = Number(bagian[0]), bulan = Number(bagian[1]) - 1, hari = Number(bagian[2]);

    var nilaiJam = document.getElementById('jam-item').value;
    if (nilaiJam) {
      var jm = nilaiJam.split(':');
      return new Date(tahun, bulan, hari, Number(jm[0]), Number(jm[1]), 0, 0).getTime();
    }

    // Tanpa jam: tugas jatuh tempo di akhir hari, agenda mulai di awal hari
    return (tipe === 'event')
      ? new Date(tahun, bulan, hari, 0, 0, 0, 0).getTime()
      : new Date(tahun, bulan, hari, 23, 59, 59, 999).getTime();
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
    var sekarang = Date.now();

    if (layarSekarang === 'layar-beranda') gambarBeranda(sekarang);
    else if (layarSekarang === 'layar-daftar') gambarLayarDaftar(sekarang);
    else if (layarSekarang === 'layar-catatan') gambarLayarCatatan();
    else if (layarSekarang === 'layar-pengaturan') gambarPengaturan();

    // Kartu antrean ikut disegarkan. Di mode ubah TIDAK, karena
    // menggambar ulang akan menimpa teks yang sedang diketik.
    if (layarSekarang === 'layar-pilah' && modeKartu === 'pilah') {
      gambarKartuSekarang();
    }
  }

  // ---------------------------------------------------------------
  // BERANDA (§5.1)
  // ---------------------------------------------------------------

  function gambarBeranda(sekarang) {
    var aktif = itemAktifTerpilah();
    var tugas = aktif.filter(function (i) { return i.type === 'task'; });

    var terlambat = tugas.filter(function (i) {
      return Skor.kelompokWaktu(i, sekarang) === 'terlambat';
    }).sort(function (a, b) { return Skor.tenggatItem(a) - Skor.tenggatItem(b); });

    var hariIni = tugas.filter(function (i) {
      return Skor.kelompokWaktu(i, sekarang) === 'hari-ini';
    });

    // b — tiga teratas menurut skor
    var fokus = tugas.slice().sort(function (a, b) {
      return Skor.hitungSkor(b, sekarang) - Skor.hitungSkor(a, sekarang);
    }).slice(0, Konfigurasi.TAMPILAN.kartuFokus);

    var idFokus = fokus.map(function (i) { return i.id; });

    // c — agenda hari ini, urut waktu
    var agenda = aktif.filter(function (i) {
      return i.type === 'event' && Skor.kelompokWaktu(i, sekarang) === 'hari-ini';
    }).sort(function (a, b) { return (a.startAt || 0) - (b.startAt || 0); });

    Tampilan.gambarBeranda({
      ringkasan: teksRingkasan(sekarang, terlambat.length, hariIni.length, aktif.length),
      antrean: antreanPilah.length,
      fokus: fokus,
      agenda: agenda,
      // §5.1 d tidak menyebut pengecualian fokus: yang terlambat tetap
      // ditampilkan lengkap, sekalipun sudah muncul di kartu fokus.
      // §5.1 e menyebutnya secara eksplisit, jadi hanya sisa hari ini
      // yang dikurangi.
      terlambat: terlambat,
      sisaHariIni: hariIni.filter(bukan(idFokus)),
      tinjau: perluDitinjau(sekarang),
      mingguIni: ringkasanMinggu(sekarang),
      pengingatBackup: Cadangan.statusPengingat(sekarang)
    }, sekarang);
  }

  function bukan(daftarId) {
    return function (i) { return daftarId.indexOf(i.id) === -1; };
  }

  function teksRingkasan(sekarang, jumlahTerlambat, jumlahHariIni, jumlahAktif) {
    var tanggal = new Date(sekarang).toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'short'
    });
    return tanggal + ' · ' + jumlahTerlambat + ' terlambat · ' +
           jumlahHariIni + ' hari ini · ' + jumlahAktif + ' aktif';
  }

  /** Item aktif yang sudah dipilah — yang belum dipilah tidak diberi skor (§5.1 a2). */
  function itemAktifTerpilah() {
    return semuaItem.filter(function (i) {
      return i.status === 'aktif' && i.triaged !== false;
    });
  }

  /**
   * §5.1 f — bagian yang mencegah aplikasi jadi kuburan tugas.
   * Tiga sebab, masing-masing dengan penjelasannya sendiri.
   */
  function perluDitinjau(sekarang) {
    var hasil = [];
    var ambang = Konfigurasi.TINJAUAN;

    itemAktifTerpilah().forEach(function (item) {
      var usia = Skor.selisihHari(sekarang, item.createdAt);

      if ((item.snoozeCount || 0) >= ambang.minimalDitunda) {
        hasil.push({ item: item, alasan: 'Ditunda ' + item.snoozeCount + 'x. Masih perlu?' });
        return;
      }
      if (item.type === 'task' && Skor.tenggatItem(item) === null &&
          usia > ambang.hariTanpaTanggal) {
        hasil.push({ item: item, alasan: 'Tanpa tenggat, sudah ' + usia + ' hari.' });
        return;
      }
      if (item.type === 'note' && usia > ambang.hariIdeMenganggur) {
        hasil.push({ item: item, alasan: 'Ide berumur ' + usia + ' hari, belum ditindaklanjuti.' });
      }
    });

    return hasil;
  }

  /** §5.1 g — kalau "dibuat" konsisten lebih besar dari "selesai", beban menumpuk. */
  function ringkasanMinggu(sekarang) {
    var batas = sekarang - Konfigurasi.TAMPILAN.hariRingkasan * 24 * 60 * 60 * 1000;
    var selesai = 0, dibuat = 0;

    semuaItem.forEach(function (i) {
      if (i.completedAt && i.completedAt >= batas) selesai++;
      if (i.createdAt >= batas) dibuat++;
    });

    return { selesai: selesai, dibuat: dibuat };
  }

  // ---------------------------------------------------------------
  // LAYAR DAFTAR — filter, pencarian, pengurutan (§5.3)
  // ---------------------------------------------------------------

  function nilaiFilter() {
    function v(id) { return document.getElementById(id).value; }
    return {
      cari: v('cari').trim().toLowerCase(),
      tipe: v('filter-tipe'),
      konteks: v('filter-konteks'),
      status: v('filter-status'),
      prioritas: v('filter-prioritas'),
      waktu: v('filter-waktu'),
      urut: v('urut')
    };
  }

  function gambarLayarDaftar(sekarang) {
    var f = nilaiFilter();

    var hasil = semuaItem.filter(function (i) {
      if (f.tipe && i.type !== f.tipe) return false;
      if (f.konteks && i.context !== f.konteks) return false;
      if (f.status && i.status !== f.status) return false;
      if (f.prioritas && String(i.priority) !== f.prioritas) return false;
      if (f.waktu && !cocokWaktu(i, f.waktu, sekarang)) return false;
      if (f.cari && !cocokTeks(i, f.cari)) return false;
      return true;
    });

    urutkan(hasil, f.urut, sekarang);
    Tampilan.gambarDaftar(hasil, semuaItem.length);
  }

  function cocokTeks(item, kata) {
    return (item.title + ' ' + (item.body || '')).toLowerCase().indexOf(kata) !== -1;
  }

  function cocokWaktu(item, pilihan, sekarang) {
    var kelompok = Skor.kelompokWaktu(item, sekarang);
    if (pilihan === 'tanpa-tanggal') return kelompok === 'tanpa-tanggal';
    if (pilihan === 'terlambat') return kelompok === 'terlambat';
    if (pilihan === 'hari-ini') return kelompok === 'hari-ini';
    if (pilihan === 'minggu') {
      var tenggat = Skor.tenggatItem(item);
      if (tenggat === null) return false;
      var hari = Skor.selisihHari(tenggat, sekarang);
      return hari >= 0 && hari <= 7;
    }
    return true;
  }

  function urutkan(daftar, cara, sekarang) {
    if (cara === 'tenggat') {
      // Item tanpa tenggat ditaruh paling belakang, bukan paling depan
      daftar.sort(function (a, b) {
        var ta = Skor.tenggatItem(a), tb = Skor.tenggatItem(b);
        if (ta === null && tb === null) return b.createdAt - a.createdAt;
        if (ta === null) return 1;
        if (tb === null) return -1;
        return ta - tb;
      });
    } else if (cara === 'diubah') {
      daftar.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    } else {
      daftar.sort(function (a, b) {
        return Skor.hitungSkor(b, sekarang) - Skor.hitungSkor(a, sekarang);
      });
    }
  }

  function bersihkanFilter() {
    ['cari', 'filter-tipe', 'filter-konteks', 'filter-prioritas', 'filter-waktu']
      .forEach(function (id) { document.getElementById(id).value = ''; });
    document.getElementById('filter-status').value = 'aktif';
    document.getElementById('urut').value = 'skor';
    gambarSemua();
  }

  // ---------------------------------------------------------------
  // CATATAN (§5.4)
  // ---------------------------------------------------------------

  function gambarLayarCatatan() {
    var catatan = semuaItem.filter(function (i) {
      return i.type === 'note' && i.status === 'aktif';
    }).sort(function (a, b) { return b.updatedAt - a.updatedAt; });

    Tampilan.gambarCatatan(catatan);
  }

  // ---------------------------------------------------------------
  // PENGATURAN (§5.5) & CADANGAN (§6)
  // ---------------------------------------------------------------

  function gambarPengaturan() {
    var terakhir = Cadangan.waktuBackupTerakhir();
    document.getElementById('status-backup').textContent = (terakhir === null)
      ? 'Belum pernah membuat cadangan.'
      : 'Cadangan terakhir: ' + new Date(terakhir).toLocaleDateString('id-ID',
          { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Perkiraan ukuran, bukan angka pasti — cukup untuk tahu kapan mulai besar
    var perkiraanByte = JSON.stringify(semuaItem).length;
    document.getElementById('status-penyimpanan').textContent =
      semuaItem.length + ' item · sekitar ' + Math.max(1, Math.round(perkiraanByte / 1024)) + ' KB';

    var bobot = Konfigurasi.bobotPrioritas();
    document.getElementById('bobot-1').value = bobot[1];
    document.getElementById('bobot-2').value = bobot[2];
    document.getElementById('bobot-3').value = bobot[3];
  }

  async function unduhCadangan() {
    var jumlah = await Cadangan.ekspor();
    await muatUlang();
    Tampilan.toast(jumlah + ' item diunduh sebagai cadangan.');
  }

  function tutupPengingatBackup() {
    Cadangan.tutupBannerHariIni(Date.now());
    gambarSemua();
  }

  /** Membaca berkas yang dipilih, lalu menampilkan pratinjau sebelum apa pun diubah. */
  function pilihBerkasImpor(ev) {
    var berkas = ev.target.files && ev.target.files[0];
    if (!berkas) return;

    var pembaca = new FileReader();

    pembaca.onload = function () {
      try {
        berkasImpor = Cadangan.periksaCadangan(String(pembaca.result));
        document.getElementById('teks-pratinjau-impor').textContent =
          'Ditemukan ' + berkasImpor.jumlah + ' item' +
          (berkasImpor.dilewati ? ' (' + berkasImpor.dilewati + ' baris rusak dilewati)' : '') +
          '. Pilih cara memasukkannya.';
        document.getElementById('pratinjau-impor').hidden = false;
        Tampilan.sembunyikanKesalahan();
      } catch (e) {
        berkasImpor = null;
        document.getElementById('pratinjau-impor').hidden = true;
        Tampilan.gambarKesalahan(e.message);
      }
    };

    pembaca.onerror = function () {
      Tampilan.gambarKesalahan('Berkas tidak bisa dibaca.');
    };

    pembaca.readAsText(berkas);
    ev.target.value = '';   // supaya berkas yang sama bisa dipilih lagi
  }

  async function jalankanImpor(mode) {
    if (!berkasImpor) return;

    // "Ganti semua" menghapus segalanya, jadi dikonfirmasi dua kali (§6)
    if (mode === 'ganti') {
      if (!window.confirm('Ganti semua? Seluruh ' + semuaItem.length +
                          ' item yang ada sekarang akan dihapus.')) return;
      if (!window.confirm('Sekali lagi: data lama tidak bisa dikembalikan. Lanjutkan?')) return;
    }

    var hasil = await Cadangan.impor(berkasImpor.items, mode);
    berkasImpor = null;
    document.getElementById('pratinjau-impor').hidden = true;

    await muatUlang();
    Tampilan.toast(hasil.ditambah + ' item dimasukkan' +
      (hasil.dilewati ? ', ' + hasil.dilewati + ' dilewati karena sudah ada' : '') + '.');
  }

  function simpanBobot() {
    function angka(id) { return Number(document.getElementById(id).value); }
    var bobot = { 1: angka('bobot-1'), 2: angka('bobot-2'), 3: angka('bobot-3') };

    if (!bobot[1] || !bobot[2] || !bobot[3]) {
      Tampilan.gambarKesalahan('Ketiga bobot harus diisi angka lebih besar dari nol.');
      return;
    }

    Konfigurasi.simpanBobotPrioritas(bobot);
    Tampilan.sembunyikanKesalahan();
    gambarSemua();
    Tampilan.toast('Bobot tersimpan. Urutan Fokus Sekarang ikut berubah.');
  }

  function kembalikanBobot() {
    Konfigurasi.kembalikanBobotBawaan();
    gambarSemua();
    Tampilan.toast('Bobot kembali ke nilai bawaan.');
  }

  async function hapusSemuaData() {
    if (!window.confirm('Hapus SEMUA data di perangkat ini? Tidak bisa dibatalkan.')) return;

    await DB.hapusSemuaItem();
    document.getElementById('konfirmasi-hapus').value = '';
    document.querySelector('button[data-aksi="hapus-semua"]').disabled = true;

    await muatUlang();
    Tampilan.toast('Semua data dihapus.');
  }

  /**
   * §5.1 h — menyalin Beranda sebagai teks polos, siap ditempel ke chat.
   * navigator.clipboard butuh konteks aman; kalau gagal, teksnya
   * ditampilkan lewat prompt supaya masih bisa disalin manual.
   */
  async function salinRingkasan() {
    var teks = susunRingkasanTeks(Date.now());
    try {
      await navigator.clipboard.writeText(teks);
      Tampilan.toast('Ringkasan disalin.');
    } catch (e) {
      window.prompt('Salin teks di bawah ini:', teks);
    }
  }

  function susunRingkasanTeks(sekarang) {
    var aktif = itemAktifTerpilah();
    var tugas = aktif.filter(function (i) { return i.type === 'task'; });

    var baris = [teksRingkasan(sekarang,
      tugas.filter(function (i) { return Skor.kelompokWaktu(i, sekarang) === 'terlambat'; }).length,
      tugas.filter(function (i) { return Skor.kelompokWaktu(i, sekarang) === 'hari-ini'; }).length,
      aktif.length), ''];

    var fokus = tugas.slice().sort(function (a, b) {
      return Skor.hitungSkor(b, sekarang) - Skor.hitungSkor(a, sekarang);
    }).slice(0, Konfigurasi.TAMPILAN.kartuFokus);

    baris.push('Fokus sekarang:');
    if (fokus.length === 0) baris.push('- (kosong)');
    fokus.forEach(function (i) { baris.push('- !' + i.priority + ' ' + i.title); });

    var agenda = aktif.filter(function (i) {
      return i.type === 'event' && Skor.kelompokWaktu(i, sekarang) === 'hari-ini';
    }).sort(function (a, b) { return (a.startAt || 0) - (b.startAt || 0); });

    baris.push('', 'Agenda hari ini:');
    if (agenda.length === 0) baris.push('- (tidak ada)');
    agenda.forEach(function (i) { baris.push('- ' + i.title); });

    return baris.join('\n');
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

  /**
   * Isi catatan boleh berisi baris baru, jadi TIDAK diratakan seperti judul.
   * Yang dilakukan hanya memangkas spasi di ujung dan membatasi panjangnya.
   */
  function bersihkanIsi(teks) {
    return String(teks || '').trim().slice(0, BATAS_PANJANG_ISI);
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
