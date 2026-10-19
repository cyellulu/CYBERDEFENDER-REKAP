const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 8080;
const BASE_DIR = __dirname;
const DB_PATH = path.join(BASE_DIR, 'database_siswa.json');

// Ensure database file exists
function loadDatabase() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading database:', e.message);
  }
  return {};
}

function saveDatabase(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error saving database:', e.message);
    return false;
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.mpeg': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon'
};

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 5 * 1024 * 1024) { // 5MB limit
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function generateCSV(students) {
  const header = "No,Nama Siswa,No Absen,Kelas,Gender,Cyber Tokens,Skor Maze 1,Skor Cyber Dash,Skor Maze 2,Skor Whack Frog,Skor Maze 3,Total Skor,Rating Kepuasan,Kategori Masukan,Kritik & Saran,Terakhir Main\n";
  const rows = students.map((s, idx) => {
    const totalScore = (s.scores?.maze1 || 0) + (s.scores?.runner || 0) + (s.scores?.maze2 || 0) + (s.scores?.fungame2 || 0) + (s.scores?.maze3 || 0);
    const dateStr = s.lastUpdated ? new Date(s.lastUpdated).toLocaleString('id-ID') : '-';
    const rating = s.feedback ? `${s.feedback.rating} Bintang` : '-';
    const category = s.feedback ? s.feedback.category : '-';
    const message = s.feedback ? `"${(s.feedback.message || '').replace(/"/g, '""')}"` : '""';
    return `${idx + 1},"${(s.name || '').replace(/"/g, '""')}",${s.absen || ''},"${s.className || ''}",${s.gender || ''},${s.tokens || 0},${s.scores?.maze1 || 0},${s.scores?.runner || 0},${s.scores?.maze2 || 0},${s.scores?.fungame2 || 0},${s.scores?.maze3 || 0},${totalScore},"${rating}","${category}",${message},"${dateStr}"`;
  }).join("\n");
  return "\uFEFF" + header + rows;
}

function renderRekapHTML(db) {
  const students = Object.values(db).filter(s => s && s.name && s.scores).sort((a, b) => {
    const totalA = (a.scores?.maze1 || 0) + (a.scores?.runner || 0) + (a.scores?.maze2 || 0) + (a.scores?.fungame2 || 0) + (a.scores?.maze3 || 0);
    const totalB = (b.scores?.maze1 || 0) + (b.scores?.runner || 0) + (b.scores?.maze2 || 0) + (b.scores?.fungame2 || 0) + (b.scores?.maze3 || 0);
    return totalB - totalA;
  });

  const feedbacks = Array.isArray(db._feedbacks) ? db._feedbacks : [];
  const avgRating = feedbacks.length > 0
    ? (feedbacks.reduce((acc, f) => acc + (f.rating || 5), 0) / feedbacks.length).toFixed(1)
    : '5.0';

  const avgScore = students.length > 0
    ? Math.round(students.reduce((acc, s) => acc + ((s.scores?.maze1 || 0) + (s.scores?.runner || 0) + (s.scores?.maze2 || 0) + (s.scores?.fungame2 || 0) + (s.scores?.maze3 || 0)), 0) / students.length)
    : 0;

  const rows = students.map((s, idx) => {
    const totalScore = (s.scores?.maze1 || 0) + (s.scores?.runner || 0) + (s.scores?.maze2 || 0) + (s.scores?.fungame2 || 0) + (s.scores?.maze3 || 0);
    const dateStr = s.lastUpdated ? new Date(s.lastUpdated).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
    
    let feedbackCell = '<span style="color:#64748b; font-size:11px;">Belum ada ulasan</span>';
    if (s.feedback) {
      const stars = '★'.repeat(s.feedback.rating || 5) + '☆'.repeat(5 - (s.feedback.rating || 5));
      feedbackCell = `
        <div style="font-size:11px; max-width:280px; text-align:left; background:rgba(15,23,42,0.6); padding:6px 10px; border-radius:8px; border:1px solid rgba(168,85,247,0.3);">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:3px;">
            <span style="color:#facc15; font-size:12px; font-weight:800;">${stars}</span>
            <span style="background:rgba(168,85,247,0.2); color:#d8b4fe; padding:1px 6px; border-radius:4px; font-size:9px; font-weight:700;">${s.feedback.category || 'Masukan'}</span>
          </div>
          <div style="color:#e2e8f0; font-style:italic; line-height:1.3; word-break:break-word;">"${s.feedback.message}"</div>
        </div>
      `;
    }

    return `
      <tr class="student-row" style="border-bottom: 1px solid rgba(56,189,248,0.15); transition: background 0.15s;" onmouseover="this.style.background='rgba(56,189,248,0.06)'" onmouseout="this.style.background='transparent'">
        <td style="padding: 12px 14px; text-align: center; color: #94a3b8; font-weight: 700;">${idx + 1}</td>
        <td class="student-name" style="padding: 12px 14px; font-weight: 800; color: #f8fafc; display: flex; align-items: center; gap: 8px;">
          <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981;"></span>
          ${s.name || '-'}
        </td>
        <td class="student-absen" style="padding: 12px 14px; text-align: center; font-weight: 800; color: #38bdf8;">${s.absen || '-'}</td>
        <td style="padding: 12px 14px; text-align: center; color: #cbd5e1;">${s.className || '-'}</td>
        <td style="padding: 12px 14px; text-align: center;">
          <span style="padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; ${s.gender === 'perempuan' ? 'background:rgba(244,114,182,0.2); color:#f472b6; border:1px solid #f472b6;' : 'background:rgba(56,189,248,0.2); color:#38bdf8; border:1px solid #38bdf8;'}">
            ${s.gender === 'perempuan' ? '👩 CEWE' : '👨 COWO'}
          </span>
        </td>
        <td style="padding: 12px 14px; text-align: center; font-weight: 900; color: #facc15;">${s.tokens || 0}</td>
        <td style="padding: 12px 14px; text-align: center; font-weight: 900; color: #4ade80;">${totalScore}</td>
        <td style="padding: 12px 14px; text-align: center;">${feedbackCell}</td>
        <td style="padding: 12px 14px; text-align: center; color: #64748b; font-size: 11px;">${dateStr}</td>
      </tr>
    `;
  }).join('');

  // Render individual feedback cards
  const feedbackCards = feedbacks.map(f => {
    const stars = '★'.repeat(f.rating || 5) + '☆'.repeat(5 - (f.rating || 5));
    const dateStr = f.submittedAt ? new Date(f.submittedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
    return `
      <div style="background:#0f172a; border:1.5px solid rgba(168,85,247,0.35); border-radius:14px; padding:16px; box-shadow:0 4px 15px rgba(0,0,0,0.3); display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:16px;">${f.gender === 'perempuan' ? '👩' : '👨'}</span>
              <strong style="color:#f8fafc; font-size:13px;">${f.name}</strong>
              <span style="font-size:10px; color:#94a3b8; background:rgba(255,255,255,0.08); padding:2px 6px; border-radius:4px;">${f.className !== '-' ? f.className : ''} ${f.absen !== '-' ? 'No. ' + f.absen : '(Tamu)'}</span>
            </div>
            <span style="color:#facc15; font-size:13px; font-weight:bold;">${stars}</span>
          </div>
          <div style="margin-bottom:8px;">
            <span style="background:rgba(168,85,247,0.25); color:#d8b4fe; border:1px solid #a855f7; padding:2px 8px; border-radius:6px; font-size:10px; font-weight:700;">${f.category || 'Umum'}</span>
          </div>
          <p style="color:#e2e8f0; font-size:13px; line-height:1.45; margin:0; font-style:italic; background:rgba(3,7,18,0.5); padding:10px; border-radius:8px; border-left:3px solid #a855f7;">
            "${f.message}"
          </p>
        </div>
        <div style="text-align:right; font-size:10px; color:#64748b;">
          🕒 ${dateStr}
        </div>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>REKAP NILAI & KOTAK SARAN // CYBER DEFENDER</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet">
      <style>
        body { margin: 0; padding: 24px; background: #030712; color: #f8fafc; font-family: 'Plus Jakarta Sans', sans-serif; }
        .cyber-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; border-bottom: 2px solid rgba(56,189,248,0.4); padding-bottom: 18px; margin-bottom: 24px; gap: 14px; }
        .cyber-title { font-family: 'Press Start 2P', monospace; font-size: 14px; color: #38bdf8; text-shadow: 0 0 12px rgba(56,189,248,0.5); margin: 0; }
        .cyber-sub { color: #94a3b8; font-size: 13px; margin-top: 6px; }
        .card-stat { background: #0f172a; border: 1px solid rgba(56,189,248,0.25); border-radius: 14px; padding: 16px 20px; }
        table { width: 100%; border-collapse: collapse; background: #0b1329; border: 1px solid rgba(56,189,248,0.3); border-radius: 12px; overflow: hidden; }
        th { background: #0f2347; color: #38bdf8; font-size: 11px; text-transform: uppercase; font-weight: 800; letter-spacing: 1px; padding: 14px; text-align: center; }
        .btn-action { background: #0284c7; color: #fff; padding: 9px 16px; border-radius: 8px; border: none; font-weight: 700; cursor: pointer; text-decoration: none; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; transition: transform 0.1s, background 0.15s; }
        .btn-action:hover { background: #0369a1; transform: scale(1.02); }
        .search-box { background: #070e20; border: 1.5px solid rgba(56,189,248,0.4); border-radius: 8px; padding: 9px 14px; color: #fff; font-size: 12px; outline: none; width: 220px; }
        .search-box:focus { border-color: #38bdf8; box-shadow: 0 0 10px rgba(56,189,248,0.3); }
        .section-title { font-family: 'Press Start 2P', monospace; font-size: 12px; color: #c084fc; text-shadow: 0 0 10px rgba(168,85,247,0.5); margin: 32px 0 16px 0; display: flex; align-items: center; gap: 10px; }
      </style>
    </head>
    <body>
      <div class="cyber-header">
        <div>
          <h1 class="cyber-title">🛡️ CYBER DEFENDER // REKAP NILAI & KOTAK SARAN</h1>
          <p class="cyber-sub">Data tersinkronisasi otomatis secara live. Total siswa terdata: <strong id="total-badge" style="color:#38bdf8;">${students.length} siswa</strong></p>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
          <input type="text" id="input-search" class="search-box" placeholder="🔍 Cari Nama / Absen..." oninput="filterTable()">
          <a href="/api/export-csv" class="btn-action" style="background:#16a34a;">📥 Download Excel (CSV)</a>
          <button onclick="window.print()" class="btn-action">🖨️ Cetak / PDF</button>
          <button onclick="location.reload()" class="btn-action" style="background:#475569;">🔄 Refresh</button>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
        <div class="card-stat">
          <div style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase;">Total Siswa Main</div>
          <div style="font-size: 28px; font-weight: 900; color: #38bdf8; margin-top: 4px;">${students.length}</div>
        </div>
        <div class="card-stat">
          <div style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase;">Nilai Rata-rata</div>
          <div style="font-size: 28px; font-weight: 900; color: #4ade80; margin-top: 4px;">${avgScore}</div>
        </div>
        <div class="card-stat" style="border-color: rgba(168,85,247,0.35);">
          <div style="color: #c084fc; font-size: 11px; font-weight: 700; text-transform: uppercase;">Ulasan / Saran Masuk</div>
          <div style="font-size: 28px; font-weight: 900; color: #d8b4fe; margin-top: 4px;">${feedbacks.length} <span style="font-size:14px; color:#facc15;">(${avgRating} ⭐)</span></div>
        </div>
        <div class="card-stat">
          <div style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase;">Server Status</div>
          <div style="font-size: 16px; font-weight: 900; color: #10b981; margin-top: 10px; display: flex; align-items: center; gap: 8px;">
            <span style="width:10px; height:10px; border-radius:50%; background:#10b981; box-shadow:0 0 10px #10b981;"></span> AKTIF (Port ${PORT})
          </div>
        </div>
      </div>

      <!-- TABEL REKAP NILAI SISWA -->
      <table id="rekap-table">
        <thead>
          <tr>
            <th>No</th>
            <th style="text-align: left; padding-left: 20px;">Nama Lengkap Siswa</th>
            <th>No. Absen</th>
            <th>Kelas</th>
            <th>Gender</th>
            <th>Cyber Tokens</th>
            <th>Total Skor</th>
            <th>Kritik & Saran</th>
            <th>Terakhir Main</th>
          </tr>
        </thead>
        <tbody id="rekap-tbody">
          ${rows.length > 0 ? rows : '<tr><td colspan="9" style="padding: 30px; text-align: center; color: #64748b;">Belum ada siswa yang mendaftar atau menyelesaikan stage.</td></tr>'}
        </tbody>
      </table>

      <!-- FEEDBACK / KOTAK SARAN & KRITIK CARDS -->
      <h2 class="section-title">💬 KOTAK SARAN & KRITIK DARI SISWA (${feedbacks.length})</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; margin-bottom: 40px;">
        ${feedbacks.length > 0 ? feedbackCards : '<div style="grid-column: 1/-1; padding: 24px; text-align: center; color: #64748b; background: #0f172a; border-radius: 12px;">Belum ada kritik dan saran yang dikirim oleh siswa.</div>'}
      </div>

      <script>
        function filterTable() {
          const q = (document.getElementById('input-search').value || '').toLowerCase().trim();
          const rows = document.querySelectorAll('.student-row');
          rows.forEach(r => {
            const name = (r.querySelector('.student-name')?.textContent || '').toLowerCase();
            const absen = (r.querySelector('.student-absen')?.textContent || '').toLowerCase();
            if (name.includes(q) || absen.includes(q)) {
              r.style.display = '';
            } else {
              r.style.display = 'none';
            }
          });
        }
      </script>
    </body>
    </html>
  `;
}

const server = http.createServer(async (req, res) => {
  // Enable full CORS for any frontend origin (Netlify, localhost, mobile, etc.)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Bypass-Tunnel-Reminder, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // 1. POST /api/save-student
    if (req.method === 'POST' && pathname === '/api/save-student') {
      const data = await parseRequestBody(req);
      if (!data.name || data.absen === undefined || data.absen === null) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Nama dan Nomor Absen wajib disertakan.' }));
        return;
      }

      const key = `${data.name.trim().toLowerCase()}_${data.absen.toString().trim()}`;
      const db = loadDatabase();
      
      const existing = db[key] || {};
      const updated = {
        name: data.name.trim(),
        absen: data.absen.toString().trim(),
        className: data.className || existing.className || '-',
        gender: data.gender || existing.gender || 'laki-laki',
        tokens: (data.tokens !== undefined) ? data.tokens : (existing.tokens || 0),
        equippedWeapon: data.equippedWeapon || existing.equippedWeapon || 'blaster_default',
        equippedCostume: data.equippedCostume || existing.equippedCostume || 'default',
        inventoryWeapons: data.inventoryWeapons || existing.inventoryWeapons || ['blaster_default'],
        inventoryCostumes: data.inventoryCostumes || existing.inventoryCostumes || ['default'],
        scores: {
          ...(existing.scores || {}),
          ...(data.scores || {})
        },
        stage: data.stage || existing.stage || 'maze1',
        lastUpdated: new Date().toISOString(),
        feedback: existing.feedback || null
      };

      db[key] = updated;
      saveDatabase(db);

      console.log(`[SAVE] Data siswa tersimpan: ${updated.name} (Absen: ${updated.absen})`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Data siswa berhasil disimpan ke server', student: updated }));
      return;
    }

    // 2. POST /api/load-student
    if (req.method === 'POST' && pathname === '/api/load-student') {
      const data = await parseRequestBody(req);
      if (!data.name || data.absen === undefined || data.absen === null) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Nama dan Nomor Absen wajib disertakan.' }));
        return;
      }

      const key = `${data.name.trim().toLowerCase()}_${data.absen.toString().trim()}`;
      const db = loadDatabase();
      const student = db[key];

      if (student) {
        console.log(`[LOAD] Data siswa ditemukan: ${student.name} (Absen: ${student.absen})`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Data siswa berhasil dimuat', student }));
      } else {
        console.log(`[LOAD FAIL] Siswa belum ada: ${data.name} (Absen: ${data.absen})`);
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Data siswa belum terdaftar. Silakan daftar baru.' }));
      }
      return;
    }

    // 3. POST /api/save-feedback (KOTAK SARAN & KRITIK)
    if (req.method === 'POST' && pathname === '/api/save-feedback') {
      const data = await parseRequestBody(req);
      if (!data.message || !data.message.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Pesan kritik & saran tidak boleh kosong.' }));
        return;
      }

      const feedbackEntry = {
        id: 'fb_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        name: (data.name || 'Tamu').trim(),
        absen: (data.absen !== undefined && data.absen !== null && data.absen !== '') ? data.absen.toString().trim() : '-',
        className: (data.className || '-').trim(),
        gender: data.gender || 'laki-laki',
        rating: Math.min(5, Math.max(1, parseInt(data.rating || 5, 10))),
        category: (data.category || 'Umum').trim(),
        message: data.message.trim(),
        submittedAt: new Date().toISOString()
      };

      const db = loadDatabase();
      if (!Array.isArray(db._feedbacks)) {
        db._feedbacks = [];
      }
      db._feedbacks.unshift(feedbackEntry);

      // If matching student exists, also attach to student's record
      const key = `${feedbackEntry.name.toLowerCase()}_${feedbackEntry.absen.toLowerCase()}`;
      if (db[key]) {
        db[key].feedback = feedbackEntry;
      }

      saveDatabase(db);

      console.log(`[FEEDBACK] Ulasan diterima dari: ${feedbackEntry.name} (${feedbackEntry.rating}⭐): "${feedbackEntry.message.substring(0, 50)}..."`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Kritik & saran berhasil disimpan ke sistem rekap!', feedback: feedbackEntry }));
      return;
    }

    // 4. GET /api/rekap-siswa (JSON)
    if (req.method === 'GET' && pathname === '/api/rekap-siswa') {
      const db = loadDatabase();
      const students = Object.values(db).filter(s => s && s.name && s.scores);
      const feedbacks = Array.isArray(db._feedbacks) ? db._feedbacks : [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, students, feedbacks }));
      return;
    }

    // 5. GET /api/export-csv
    if (req.method === 'GET' && pathname === '/api/export-csv') {
      const db = loadDatabase();
      const students = Object.values(db).filter(s => s && s.name && s.scores).sort((a, b) => {
        const totalA = (a.scores?.maze1 || 0) + (a.scores?.runner || 0) + (a.scores?.maze2 || 0) + (a.scores?.fungame2 || 0) + (a.scores?.maze3 || 0);
        const totalB = (b.scores?.maze1 || 0) + (b.scores?.runner || 0) + (b.scores?.maze2 || 0) + (b.scores?.fungame2 || 0) + (b.scores?.maze3 || 0);
        return totalB - totalA;
      });
      const csv = generateCSV(students);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="rekap_nilai_dan_saran_cyberdefender.csv"'
      });
      res.end(csv);
      return;
    }

    // 6. GET /rekap (Dashboard Tampilan Guru)
    if (req.method === 'GET' && (pathname === '/rekap' || pathname === '/rekap/')) {
      const db = loadDatabase();
      const html = renderRekapHTML(db);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // Static files fallback
    if (pathname === '/' || pathname === '') {
      pathname = '/CYBERDEFENDER.html';
    }

    const safePath = path.normalize(path.join(BASE_DIR, pathname));
    if (!safePath.startsWith(BASE_DIR) || !fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const stat = fs.statSync(safePath);
    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(safePath).pipe(res);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('500 Internal Server Error: ' + err.message);
  }
});

server.listen(PORT, () => {
  console.log('======================================================');
  console.log(`🚀 SERVER REKAP SISWA AKTIF DI PORT: ${PORT}`);
  console.log(`📊 Dashboard Guru: http://localhost:${PORT}/rekap`);
  console.log('======================================================');
});
