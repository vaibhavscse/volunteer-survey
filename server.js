require('dotenv').config();

const express = require('express');
const path    = require('path');
const { DatabaseSync } = require('node:sqlite');
const twilio  = require('twilio');
const ExcelJS = require('exceljs');

// ── Env validation ─────────────────────────────────────────────────────────
const REQUIRED = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID'];
const missing  = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error('ERROR: Missing environment variables:', missing.join(', '));
  process.exit(1);
}
console.log('Env check OK — SID starts with:', process.env.TWILIO_VERIFY_SERVICE_SID.slice(0, 6));

// ── App setup ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Database ───────────────────────────────────────────────────────────────
// DATABASE_PATH env var lets Railway (or any host) point to a persistent volume.
// Falls back to local file for development.
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'volunteers.db');
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS volunteers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    phone       TEXT NOT NULL,
    address     TEXT DEFAULT '',
    verified_at TEXT NOT NULL
  )
`);

// ── Twilio client ──────────────────────────────────────────────────────────
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ── Helpers ────────────────────────────────────────────────────────────────
function isValidE164(phone) {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

// ── Routes ─────────────────────────────────────────────────────────────────

// POST /send-otp
// Body: { phone: "+14155552671" }
app.post('/send-otp', async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }
  if (!isValidE164(phone)) {
    return res.status(400).json({
      error: 'Invalid phone number. Use E.164 format, e.g. +14155552671.',
    });
  }

  try {
    await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications
      .create({ to: phone, channel: 'sms' });

    res.json({ success: true, message: 'OTP sent successfully.' });
  } catch (err) {
    console.error('[send-otp] Twilio error:', err.message);
    res.status(500).json({ error: `Failed to send OTP: ${err.message}` });
  }
});

// POST /verify-otp
// Body: { name, phone, address, otp }
app.post('/verify-otp', async (req, res) => {
  const { name, phone, address, otp } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }
  if (!isValidE164(phone)) {
    return res.status(400).json({ error: 'Invalid phone number format.' });
  }
  if (!otp || !otp.trim()) {
    return res.status(400).json({ error: 'OTP code is required.' });
  }

  try {
    const result = await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks
      .create({ to: phone, code: otp.trim() });

    if (result.status === 'approved') {
      db.prepare(
        'INSERT INTO volunteers (name, phone, address, verified_at) VALUES (?, ?, ?, ?)'
      ).run(
        name.trim(),
        phone,
        (address || '').trim(),
        new Date().toISOString()
      );

      return res.json({ success: true, message: 'Verified! Entry saved.' });
    }

    // status is 'pending' → wrong code but not expired
    res.status(400).json({ error: 'Invalid OTP. Please try again.' });
  } catch (err) {
    console.error('[verify-otp] Twilio error:', err.message, err.code);
    // 20404 = verification not found (expired or already used)
    if (err.code === 20404) {
      return res.status(400).json({
        error: 'OTP not found or expired. Please request a new one.',
      });
    }
    res.status(500).json({ error: `Verification failed: ${err.message}` });
  }
});

// GET /entries
app.get('/entries', (req, res) => {
  const entries = db
    .prepare('SELECT id, name, phone, address, verified_at FROM volunteers ORDER BY verified_at DESC')
    .all();
  res.json(entries);
});

// GET /download — stream an .xlsx file
app.get('/download', async (req, res) => {
  const entries = db
    .prepare('SELECT name, phone, address, verified_at FROM volunteers ORDER BY verified_at ASC')
    .all();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Volunteer Survey App';
  workbook.created  = new Date();

  const sheet = workbook.addWorksheet('Survey Results');

  sheet.columns = [
    { header: 'Name',         key: 'name',        width: 28 },
    { header: 'Phone Number', key: 'phone',       width: 20 },
    { header: 'Address',      key: 'address',     width: 42 },
    { header: 'Verified At',  key: 'verified_at', width: 26 },
  ];

  // Style the header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4F46E5' },
  };
  headerRow.alignment = { vertical: 'middle' };
  headerRow.height = 20;

  entries.forEach(entry => {
    sheet.addRow({
      name:        entry.name,
      phone:       entry.phone,
      address:     entry.address || '',
      verified_at: new Date(entry.verified_at).toLocaleString(),
    });
  });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="survey_results.xlsx"');

  await workbook.xlsx.write(res);
  res.end();
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nVolunteer Survey App is running.`);
  console.log(`Open: http://localhost:${PORT}\n`);
});
