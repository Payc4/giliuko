// Emails the download link. SMTP comes from Coolify env vars; without SMTP the shop still works
// (the buyer downloads on the thank-you page) and email_status is 'off'.
import nodemailer from 'nodemailer'

const { SMTP_HOST, SMTP_PORT = '587', SMTP_USER, SMTP_PASS, SMTP_SECURE, MAIL_FROM, CONTACT_EMAIL } = process.env
const transport = SMTP_HOST ? nodemailer.createTransport({
  host: SMTP_HOST, port: Number(SMTP_PORT), secure: SMTP_SECURE === 'true' || SMTP_PORT === '465',
  auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
}) : null
export const mailReady = Boolean(transport)
if (!transport) console.warn('Email is OFF (set SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM to send download links)')
else console.log('Email is ON via', SMTP_HOST)

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export async function sendLink(to, links) {
  if (!transport) return 'off'
  const list = links.map(l => `<p style="margin:22px 0"><a href="${esc(l)}" style="display:inline-block;background:#7d8a5a;color:#fff;text-decoration:none;padding:13px 26px;border-radius:999px;font-weight:600">Atsisiųsti „Giliuko meniu“ (PDF)</a></p>`).join('')
  const reply = CONTACT_EMAIL ? `<p style="color:#6e5b4a;font-size:14px">Klausimai? Tiesiog atsakykite į šį laišką arba rašykite ${esc(CONTACT_EMAIL)}.</p>` : ''
  try {
    await transport.sendMail({
      from: MAIL_FROM || SMTP_USER, to, replyTo: CONTACT_EMAIL || undefined,
      subject: 'Jūsų „Giliuko meniu“ – atsisiuntimo nuoroda',
      text: `Ačiū, kad įsigijote „Giliuko meniu“!\n\nAtsisiųskite PDF čia:\n${links.join('\n')}\n\nNuoroda asmeninė – išsaugokite šį laišką, kad galėtumėte atsisiųsti dar kartą.\n\nSkanaus ir ramių akimirkų prie bendro stalo!\n„Giliuko meniu“`,
      html: `<div style="font-family:Georgia,serif;background:#f7f1e3;padding:28px;color:#4a3b2f">
        <div style="max-width:520px;margin:0 auto;background:#fffdf7;border-radius:14px;padding:30px;border:1px solid #e3d8bf">
        <h1 style="font-weight:600;font-size:28px;margin:0 0 8px">Ačiū, kad įsigijote „Giliuko meniu“!</h1>
        <p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6">Jūsų PDF paruoštas – atsisiųskite jį paspaudę mygtuką:</p>${list}
        <p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#6e5b4a">Nuoroda asmeninė – išsaugokite šį laišką, kad galėtumėte atsisiųsti dar kartą.</p>
        <p style="font-style:italic;font-size:17px;margin-top:24px">Skanaus ir ramių akimirkų prie bendro stalo!</p>${reply}</div></div>`,
    })
    return 'sent'
  } catch (e) {
    console.error('email failed:', e.message)
    return 'failed'
  }
}
