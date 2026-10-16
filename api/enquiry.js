// Dani Hill enquiry endpoint (Vercel serverless function, no dependencies).
// Receives wedding, viewing and stay enquiries and appends them to a Google Sheet,
// one tab per form type. Personal details go to the Sheet only, never to analytics.
//
// Required environment variables (Vercel → Project → Settings → Environment Variables):
//   GOOGLE_CLIENT_EMAIL   service account email (…@….iam.gserviceaccount.com)
//   GOOGLE_PRIVATE_KEY    service account private key (the full "-----BEGIN PRIVATE KEY-----" block)
//   GOOGLE_SHEET_ID       the ID from the Sheet URL
// The Sheet must be shared with the service account email as Editor, with tabs named
// exactly: Wedding, Viewing, Stay.

const crypto = require('crypto');

const TABS = { wedding: 'Wedding', viewing: 'Viewing', stay: 'Stay' };

const ATTR = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'gbraid', 'wbraid', 'fbclid', 'landing_page', 'referrer', 'first_touch_source', 'page'];

// Columns per tab. The pipeline columns at the end are left blank for the team to fill in.
const FIELDS = {
  wedding: ['name', 'phone', 'email', 'event_date', 'guests', 'stay', 'message'],
  viewing: ['name', 'phone', 'email', 'visit_date', 'visit_slot', 'attending', 'message'],
  stay: ['name', 'phone', 'email', 'residence', 'arrival', 'departure', 'guests', 'purpose', 'message'],
};
const PIPELINE = ['stage', 'qualified', 'viewing_scheduled', 'viewing_attended', 'proposal_sent', 'booking_confirmed', 'booking_value', 'notes'];

function header(type) {
  return ['lead_id', 'submitted_at', ...FIELDS[type], ...ATTR, ...PIPELINE];
}

function clean(v, max) {
  if (v === undefined || v === null) return '';
  let s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (s.length > max) s = s.slice(0, max);
  // Guard against spreadsheet formula injection.
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function leadId(type) {
  const prefix = { wedding: 'WED', viewing: 'VIEW', stay: 'STAY' }[type];
  const d = new Date(Date.now() + 8 * 3600 * 1000); // Malaysia time
  const ymd = d.toISOString().slice(2, 10).replace(/-/g, '');
  return `DH-${prefix}-${ymd}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

function nowMYT() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' MYT';
}

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function accessToken() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Missing Google credentials');
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(key);
  const jwt = `${head}.${claim}.${b64url(sig)}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!r.ok) throw new Error('Google auth failed: ' + r.status);
  return (await r.json()).access_token;
}

async function appendRow(token, tab, row, type) {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('Missing GOOGLE_SHEET_ID');
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/`;
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  // Write the header row the first time a tab is used.
  const check = await fetch(`${base}${encodeURIComponent(tab + '!A1:A1')}`, { headers: auth });
  if (!check.ok) throw new Error('Sheet read failed: ' + check.status);
  const values = [];
  if (!((await check.json()).values)) values.push(header(type));
  values.push(row);
  const r = await fetch(`${base}${encodeURIComponent(tab + '!A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST', headers: auth, body: JSON.stringify({ values }),
  });
  if (!r.ok) throw new Error('Sheet append failed: ' + r.status);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'bad_request' });

  const type = body.form_type;
  if (!TABS[type]) return res.status(400).json({ ok: false, error: 'unknown_form' });

  // Spam checks: a hidden field people never see, and a minimum time on the form.
  if (body.website) return res.status(200).json({ ok: true, lead_id: 'DH-IGNORED' });
  if (typeof body.elapsed_ms === 'number' && body.elapsed_ms < 2500) {
    return res.status(200).json({ ok: true, lead_id: 'DH-IGNORED' });
  }

  const name = clean(body.name, 120);
  const phone = clean(body.phone, 40);
  const email = clean(body.email, 160);
  if (!name) return res.status(422).json({ ok: false, error: 'name_required' });
  if (!phone && !email) return res.status(422).json({ ok: false, error: 'contact_required' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(422).json({ ok: false, error: 'email_invalid' });
  if (body.consent !== true) return res.status(422).json({ ok: false, error: 'consent_required' });

  const id = leadId(type);
  const fieldVals = FIELDS[type].map((f) => (f === 'name' ? name : f === 'phone' ? phone : f === 'email' ? email : clean(body[f], f === 'message' ? 2000 : 120)));
  const attr = body.attribution && typeof body.attribution === 'object' ? body.attribution : {};
  const attrVals = ATTR.map((k) => clean(k === 'page' ? body.page : attr[k], 500));
  const row = [id, nowMYT(), ...fieldVals, ...attrVals, 'New', '', '', '', '', '', '', ''];

  try {
    const token = await accessToken();
    await appendRow(token, TABS[type], row, type);
    return res.status(200).json({ ok: true, lead_id: id });
  } catch (err) {
    console.error('enquiry_error', type, err.message);
    return res.status(502).json({ ok: false, error: 'save_failed' });
  }
};
