const API = process.env.RESEND_API_URL || 'https://api.resend.com/emails';
const FROM = process.env.MAIL_FROM || 'Plinko <plinko@akshaydongare.com>';

export const mailReady = () => Boolean(process.env.RESEND_API_KEY);

export async function sendCode(to, code) {
  const text = `Your Plinko sign-in code is ${code}.\n\nYou can use this code for 10 minutes. If you did not ask for this code, ignore this email.\n\nPlinko uses play money only.`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#1d1a33">
<p>Your Plinko sign-in code is</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:8px 0">${code}</p>
<p>You can use this code for 10 minutes. If you did not ask for this code, ignore this email.</p>
<p style="color:#5d5870;font-size:13px">Plinko uses play money only.</p></div>`;
  const r = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject: `Your Plinko code: ${code}`, text, html })
  });
  if (!r.ok) throw new Error('mail ' + r.status + ' ' + (await r.text()).slice(0, 200));
}
