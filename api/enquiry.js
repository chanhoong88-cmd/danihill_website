// Dani Hill enquiry endpoint (Vercel serverless function, no dependencies).
// Receives wedding, viewing and stay enquiries and appends them to a Google Sheet,
// one tab per form type. Personal details go to the Sheet only, never to analytics.
//
// Required environment variables (Vercel → Project → Settings → Environment Variables):
//   GOOGLE_CLIENT_EMAIL   service account email (…@….iam.gserviceaccount.com)
//   GOOGLE_PRIVATE_KEY    service account private key (the full "-----BEGIN PRIVATE KEY-----" block)
//   GOOGLE_SHEET_ID       the ID from the Sheet URL
// Optional, for emails (via Resend, resend.com):
//   RESEND_API_KEY        API key from Resend
//   MAIL_FROM             sender on your verified domain, e.g. "Dani Hill <enquiries@danihill.my>"
//   NOTIFY_EMAIL          your team inbox; receives a copy of every new enquiry (comma-separate several)
// If these are not set, enquiries are still saved; emails are simply skipped.
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

// fetch with a time limit so a slow Google or email service can't hang the form.
function tfetch(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 8000);
  return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).finally(() => clearTimeout(t));
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
  const r = await tfetch('https://oauth2.googleapis.com/token', {
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
  const check = await tfetch(`${base}${encodeURIComponent(tab + '!A1:A1')}`, { headers: auth });
  if (!check.ok) throw new Error('Sheet read failed: ' + check.status);
  const values = [];
  if (!((await check.json()).values)) values.push(header(type));
  values.push(row);
  const r = await tfetch(`${base}${encodeURIComponent(tab + '!A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST', headers: auth, body: JSON.stringify({ values }),
  });
  if (!r.ok) throw new Error('Sheet append failed: ' + r.status);
}

// ---- Emails (optional) -----------------------------------------------------------
function esc(v) {
  return String(v || '').replace(/^'/, '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const LABELS = {
  event_date: 'Wedding date', guests: 'Guests', stay: 'Overnight stay', visit_date: 'Preferred date',
  visit_slot: 'Preferred time', attending: 'Attending', residence: 'Residence', arrival: 'Arrival',
  departure: 'Departure', purpose: 'Purpose', message: 'Message', phone: 'Phone', email: 'Email',
};
const SUBJECT = {
  wedding: 'We have received your wedding enquiry',
  viewing: 'We have received your viewing request',
  stay: 'We have received your stay enquiry',
};
const INTRO = {
  wedding: 'Thank you for your interest in celebrating your wedding at Dani Hill. Our events team will check availability for your date and reply, usually within one working day.',
  viewing: 'Thank you for asking to visit Dani Hill. We will contact you shortly to confirm a time for your viewing. Your visit is not confirmed until we reply.',
  stay: 'Thank you for your interest in staying at Dani Hill. Your host will reply with availability and a proposal shortly.',
};
function detailRows(type, vals) {
  return FIELDS[type].filter((f) => f !== 'name' && vals[f]).map((f) =>
    `<tr><td style="padding:6px 16px 6px 0;color:#6B6862;font-size:13px;vertical-align:top;white-space:nowrap">${LABELS[f] || f}</td><td style="padding:6px 0;color:#262626;font-size:14px">${esc(vals[f]).replace(/\n/g, '<br>')}</td></tr>`).join('');
}
function shell(inner) {
  return `<div style="background:#F8F5EF;padding:32px 16px;font-family:Helvetica,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #E5DFD4;padding:36px 32px">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:6px;color:#262626">DANI HILL</div>
<div style="font-size:10px;letter-spacing:3px;color:#8D8880;margin:6px 0 28px">AN ACCEL COLLECTION ESTATE</div>${inner}
<p style="font-size:12px;color:#8D8880;margin-top:32px;border-top:1px solid #EFEAE1;padding-top:16px">Dani Hill · Gohtong Jaya, Genting Highlands, Pahang · WhatsApp 011-6226 5257</p></div></div>`;
}
async function sendMail(to, subject, html, replyTo) {
  const key = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM;
  if (!key || !from || !to) return false;
  const r = await tfetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ from, to: Array.isArray(to) ? to : [to], subject, html }, replyTo ? { reply_to: replyTo } : {})),
  }, 8000);
  if (!r.ok) { console.error('email_error', r.status); return false; }
  return true;
}
async function sendEmails(type, id, vals) {
  const out = { confirm: false };
  const tasks = [];
  if (vals.email) {
    const first = String(vals.name).split(/[\s&]/)[0] || vals.name;
    const html = shell(`<p style="font-size:15px;color:#262626;line-height:1.6">Dear ${esc(first)},</p>
<p style="font-size:15px;color:#4A4844;line-height:1.6">${INTRO[type]}</p>
<p style="font-size:12px;letter-spacing:2px;color:#8A7243;margin:24px 0 8px">YOUR DETAILS</p>
<table style="border-collapse:collapse">${detailRows(type, vals)}</table>
<p style="font-size:13px;color:#6B6862;margin-top:20px">Reference: <b>${id}</b></p>
<p style="font-size:14px;color:#4A4844;line-height:1.6">If anything above needs changing, simply reply to this email or message us on WhatsApp at 011-6226 5257.</p>`);
    tasks.push(sendMail(vals.email, `${SUBJECT[type]} · ${id}`, html, process.env.NOTIFY_EMAIL ? process.env.NOTIFY_EMAIL.split(',')[0].trim() : undefined)
      .then((ok) => { out.confirm = ok; }).catch(() => {}));
  }
  if (process.env.NOTIFY_EMAIL) {
    const html = shell(`<p style="font-size:15px;color:#262626">New ${type} enquiry from <b>${esc(vals.name)}</b></p>
<table style="border-collapse:collapse">${detailRows(type, vals)}</table>
<p style="font-size:13px;color:#6B6862;margin-top:20px">Reference: <b>${id}</b> · Saved to the ${TABS[type]} tab.</p>`);
    tasks.push(sendMail(process.env.NOTIFY_EMAIL.split(',').map((x) => x.trim()).filter(Boolean), `New ${type} enquiry · ${String(vals.name).replace(/^'/, '').replace(/[\r\n<>]/g, '')} · ${id}`, html, vals.email || undefined).catch(() => {}));
  }
  await Promise.all(tasks);
  return out;
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
    // Emails never block a saved enquiry: failures are logged and skipped.
    const vals = {}; FIELDS[type].forEach((f, i) => { vals[f] = fieldVals[i]; });
    let mail = { confirm: false };
    try { mail = await sendEmails(type, id, vals); } catch (e) { console.error('email_error', e.message); }
    return res.status(200).json({ ok: true, lead_id: id, email_sent: mail.confirm });
  } catch (err) {
    console.error('enquiry_error', type, err.message);
    return res.status(502).json({ ok: false, error: 'save_failed' });
  }
};
