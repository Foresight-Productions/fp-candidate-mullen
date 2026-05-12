/**
 * Mullen for Yakima County — Form Handler Worker
 * Receives POST from the campaign site, sends email via Resend API.
 *
 * Env vars (set in Cloudflare dashboard → Workers → Settings → Variables):
 *   RESEND_API_KEY  — your Resend API key (re_xxxxxxxxx)
 */

const RESEND_URL  = 'https://api.resend.com/emails';
const TO_EMAIL    = 'daveforyakimaco@gmail.com';
const FROM_EMAIL  = 'Mullen for Yakima County <onboarding@resend.dev>';
const SITE_ORIGIN = 'https://foresight-productions.github.io';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  SITE_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ── Email builders ──────────────────────────────────────────────────────────

function buildSignupEmail(data) {
  const email = (data.email || '').trim();
  if (!email) throw new Error('Email is required');

  return {
    subject: '📋 New Email Signup — Mullen for Yakima County',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;">
        <h2 style="color:#1A2942;margin-bottom:8px;">New Email Signup</h2>
        <p style="color:#555;font-size:14px;margin-bottom:24px;">Someone signed up for campaign updates.</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:10px 12px;background:#f5f5f5;font-weight:600;width:120px;">Email</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;">${email}</td>
          </tr>
        </table>
        <p style="color:#888;font-size:12px;margin-top:24px;">Submitted via davemullen.com signup form</p>
      </div>`,
    reply_to: email,
  };
}

function buildContactEmail(data) {
  const first    = (data.first_name || '').trim();
  const last     = (data.last_name  || '').trim();
  const email    = (data.email      || '').trim();
  const phone    = (data.phone      || '').trim();
  const message  = (data.message    || '').trim();
  const rawIntr  = data.interests;
  const interests = Array.isArray(rawIntr)
    ? rawIntr.join(', ')
    : (rawIntr || '');

  if (!first || !last || !email) throw new Error('Name and email are required');

  const row = (label, value) => value
    ? `<tr>
         <td style="padding:10px 12px;background:#f5f5f5;font-weight:600;width:140px;vertical-align:top;">${label}</td>
         <td style="padding:10px 12px;border-bottom:1px solid #eee;">${value}</td>
       </tr>`
    : '';

  return {
    subject: `📬 New Contact: ${first} ${last} — Mullen for Yakima County`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;">
        <h2 style="color:#1A2942;margin-bottom:8px;">New Volunteer / Contact Form</h2>
        <p style="color:#555;font-size:14px;margin-bottom:24px;">Submitted via the campaign website.</p>
        <table style="width:100%;border-collapse:collapse;">
          ${row('Name',      `${first} ${last}`)}
          ${row('Email',     `<a href="mailto:${email}">${email}</a>`)}
          ${row('Phone',     phone)}
          ${row('Interests', interests || 'None selected')}
          ${row('Message',   message   || '—')}
        </table>
        <p style="color:#888;font-size:12px;margin-top:24px;">Reply directly to this email to reach ${first}.</p>
      </div>`,
    reply_to: email,
  };
}

// ── Main handler ────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405);
    }

    const url      = new URL(request.url);
    const formType = url.pathname.endsWith('/signup') ? 'signup' : 'contact';

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ ok: false, error: 'Invalid request body' }, 400);
    }

    let emailPayload;
    try {
      emailPayload = formType === 'signup'
        ? buildSignupEmail(data)
        : buildContactEmail(data);
    } catch (e) {
      return json({ ok: false, error: e.message }, 422);
    }

    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:     FROM_EMAIL,
        to:       [TO_EMAIL],
        subject:  emailPayload.subject,
        html:     emailPayload.html,
        reply_to: emailPayload.reply_to,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return json({ ok: false, error: 'Email delivery failed' }, 502);
    }

    return json({ ok: true });
  },
};
