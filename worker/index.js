/**
 * Mullen for Yakima County — Form Handler Worker
 * Sends email natively via Cloudflare's send_email binding.
 * No third-party services or API keys required.
 */

import { EmailMessage } from "cloudflare:email";

const TO_EMAIL    = 'daveforyakimaco@gmail.com';
const FROM_EMAIL  = 'forms@mullenforyakima.com';
const FROM_NAME   = 'Mullen for Yakima County';
const SITE_ORIGIN = 'https://foresight-productions.github.io';

const CORS = {
  'Access-Control-Allow-Origin':  SITE_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Build a readable stream from a plain string (required by EmailMessage)
function toStream(str) {
  const bytes = new TextEncoder().encode(str);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

// Build a minimal RFC 2822 email
function buildRawEmail({ subject, html, replyTo }) {
  return [
    `MIME-Version: 1.0`,
    `From: ${FROM_NAME} <${FROM_EMAIL}>`,
    `To: ${TO_EMAIL}`,
    `Subject: ${subject}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Content-Type: text/html; charset=utf-8`,
    ``,
    html,
  ].join('\r\n');
}

async function sendEmail(env, { subject, html, replyTo }) {
  const raw = buildRawEmail({ subject, html, replyTo });
  const msg = new EmailMessage(FROM_EMAIL, TO_EMAIL, toStream(raw));
  await env.SEND_EMAIL.send(msg);
}

// ── Email templates ──────────────────────────────────────────────────────────

function signupEmail(email) {
  return {
    subject: 'New Email Signup — Mullen for Yakima County',
    replyTo: email,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#fff;">
  <div style="background:#1A2942;padding:20px 24px;border-radius:6px 6px 0 0;">
    <h1 style="color:#F5EDDC;font-size:20px;margin:0;font-family:sans-serif;">Mullen for Yakima County</h1>
    <p style="color:#6B7547;font-size:13px;margin:4px 0 0;">Campaign Updates — New Signup</p>
  </div>
  <div style="border:1px solid #e5e5e5;border-top:none;padding:24px;border-radius:0 0 6px 6px;">
    <p style="font-size:15px;color:#333;margin:0 0 16px;">Someone signed up for campaign updates.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr>
        <td style="padding:10px 12px;background:#f7f7f7;font-weight:600;color:#555;width:100px;">Email</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#1A2942;">
          <a href="mailto:${email}" style="color:#1A2942;">${email}</a>
        </td>
      </tr>
    </table>
    <p style="font-size:12px;color:#aaa;margin-top:20px;">Submitted via mullenforyakima.com</p>
  </div>
</div>`,
  };
}

function contactEmail({ first_name, last_name, email, phone, message, interests }) {
  const name        = `${first_name} ${last_name}`;
  const interestStr = Array.isArray(interests) && interests.length
    ? interests.join(', ')
    : (interests || 'None selected');

  const row = (label, value) => `
    <tr>
      <td style="padding:10px 12px;background:#f7f7f7;font-weight:600;color:#555;width:120px;vertical-align:top;">${label}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#222;">${value || '—'}</td>
    </tr>`;

  return {
    subject: `New Contact: ${name} — Mullen for Yakima County`,
    replyTo: email,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#fff;">
  <div style="background:#1A2942;padding:20px 24px;border-radius:6px 6px 0 0;">
    <h1 style="color:#F5EDDC;font-size:20px;margin:0;font-family:sans-serif;">Mullen for Yakima County</h1>
    <p style="color:#6B7547;font-size:13px;margin:4px 0 0;">Volunteer / Contact Form Submission</p>
  </div>
  <div style="border:1px solid #e5e5e5;border-top:none;padding:24px;border-radius:0 0 6px 6px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${row('Name',      name)}
      ${row('Email',     `<a href="mailto:${email}" style="color:#1A2942;">${email}</a>`)}
      ${row('Phone',     phone)}
      ${row('Interests', interestStr)}
      ${row('Message',   message)}
    </table>
    <p style="font-size:13px;color:#555;margin-top:20px;">
      💡 Hit <strong>Reply</strong> to respond directly to ${first_name}.
    </p>
    <p style="font-size:12px;color:#aaa;margin-top:8px;">Submitted via mullenforyakima.com</p>
  </div>
</div>`,
  };
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
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

    try {
      if (formType === 'signup') {
        const email = (data.email || '').trim();
        if (!email) return json({ ok: false, error: 'Email is required' }, 422);
        await sendEmail(env, signupEmail(email));
      } else {
        const { first_name, last_name, email } = data;
        if (!first_name || !last_name || !email) {
          return json({ ok: false, error: 'Name and email are required' }, 422);
        }
        await sendEmail(env, contactEmail(data));
      }

      return json({ ok: true });
    } catch (e) {
      console.error('Email send failed:', e.message);
      return json({ ok: false, error: 'Failed to send email' }, 502);
    }
  },
};
