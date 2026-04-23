# Volunteer Survey App

A mobile-friendly web app for researchers to collect volunteer information and verify phone numbers via SMS OTP before saving entries.

## How it works

1. Researcher fills in volunteer's Name, Phone Number, and optional Address
2. Clicks **Send OTP** — Twilio sends a 6-digit code to the volunteer's phone
3. Researcher asks the volunteer to read out the code and enters it
4. Clicks **Verify & Save** — if the code is correct, the entry is saved
5. All verified entries appear in a table and can be exported as Excel

---

## Prerequisites

- [Node.js](https://nodejs.org/) **v22.5 or later** (uses built-in `node:sqlite` — no native compilation needed)
- A free [Twilio](https://www.twilio.com/) account

---

## Setup

### Step 1 — Create a Twilio Verify Service

1. Sign in to the [Twilio Console](https://console.twilio.com/)
2. In the left sidebar go to **Verify** → **Services**
3. Click **Create new Service**
4. Enter a friendly name (e.g. `Volunteer Survey`) and click **Create**
5. You'll land on the service page — copy the **Service SID** (starts with `VA…`)

### Step 2 — Find your Twilio credentials

From the [Twilio Console Dashboard](https://console.twilio.com/):

- **Account SID** — shown at the top, starts with `AC…`
- **Auth Token** — click the eye icon next to it to reveal

### Step 3 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PORT=3000
```

> **Keep `.env` private.** It is listed in `.gitignore` and must never be committed.

### Step 4 — Install dependencies

```bash
cd volunteer-survey
npm install
```

### Step 5 — Run the app

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser (or on your phone if on the same network).

For development with auto-restart on file changes (uses Node.js built-in `--watch`):

```bash
npm run dev
```

---

## Usage

| Step | Action |
|------|--------|
| 1 | Enter the volunteer's **Name** and **Phone Number** (with country code, e.g. `+14155552671`) |
| 2 | Optionally enter their **Address / Location** |
| 3 | Click **Send OTP** — the volunteer receives an SMS |
| 4 | Ask the volunteer for the 6-digit code and enter it |
| 5 | Click **Verify & Save** — entry is added to the table |
| 6 | Click **Download Excel** at any time to export all entries |

### Phone number format (E.164)

Phone numbers must include the country code and start with `+`:

| Country | Example |
|---------|---------|
| United States | `+14155552671` |
| United Kingdom | `+447911123456` |
| India | `+919876543210` |
| Australia | `+61412345678` |

---

## Project structure

```
volunteer-survey/
├── server.js          # Express backend (all API routes)
├── public/
│   └── index.html     # Single-page frontend
├── volunteers.db      # SQLite database (auto-created on first run)
├── package.json
├── .env               # Your credentials (NOT committed)
├── .env.example       # Template
└── .gitignore
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/send-otp` | Send OTP to a phone number via Twilio Verify |
| `POST` | `/verify-otp` | Verify OTP; save entry to DB if approved |
| `GET` | `/entries` | Return all saved entries as JSON |
| `GET` | `/download` | Stream all entries as `survey_results.xlsx` |

---

## Notes

- OTPs expire after **10 minutes** (Twilio Verify default — no configuration needed)
- Twilio Verify handles OTP generation, delivery, and expiry automatically
- The SQLite database file (`volunteers.db`) is created automatically at startup
- Excel columns exported: **Name**, **Phone Number**, **Address**, **Verified At**

---

## Troubleshooting

**`Error: Cannot find module 'node:sqlite'`**
Upgrade Node.js to v22.5 or later. The built-in SQLite module was added in v22.5.

**Twilio error "Authentication Error"**
Double-check `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` in `.env`.

**Twilio error "Service not found"**
Double-check `TWILIO_VERIFY_SERVICE_SID` — it must start with `VA`.

**OTP never arrives**
- Confirm the phone number is in E.164 format (e.g. `+14155552671`)
- Check your Twilio trial account hasn't run out of credits
- Trial accounts can only send to verified caller IDs unless upgraded
