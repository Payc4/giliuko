// Giliuko meniu shop: landing page, Stripe Checkout (one-time), PDF delivery by personal link + email.
import { createServer } from 'node:http'
import { readFile, stat, writeFile, rename, mkdir } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { createHash, timingSafeEqual } from 'node:crypto'
import { createCheckout, getCheckout, verifyWebhook, stripeReady } from './lib/stripe.js'
import { createStore } from './lib/store.js'
import { sendLink, mailReady } from './lib/mail.js'

const ROOT = new URL('.', import.meta.url).pathname
const PUBLIC = join(ROOT, 'public')
const env = process.env
const PORT = Number(env.PORT || 3000)
const DATA_DIR = env.DATA_DIR || join(ROOT, 'data')
const BASE_URL = (env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '')
const PRICE_CENTS = Number(env.PRICE_CENTS || 999)
// The PDF is not in the (public) repo: it's uploaded once on /admin and kept on the persistent volume.
const PRODUCT = { key: 'giliuko-meniu-lt', name: 'Giliuko meniu – receptų knygelė (PDF)', file: join(DATA_DIR, 'products', 'giliuko-meniu-lt.pdf'), download: 'Giliuko-meniu.pdf' }
const productInfo = () => stat(PRODUCT.file).catch(() => null)
const MAX_DOWNLOADS = Number(env.MAX_DOWNLOADS || 30)
const store = createStore(DATA_DIR)

const priceText = (PRICE_CENTS / 100).toFixed(2).replace('.', ',') + ' €'
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const SECURITY = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'DENY', 'permissions-policy': 'camera=(), microphone=(), geolocation=()' }
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.json': 'application/json' }

// ── page templates: {{PRICE}} etc. filled from settings; own file links get ?v=<content hash> so redeploys never mix old and new files
const seller = [env.SELLER_NAME, env.SELLER_CODE && `Įm. k. ${env.SELLER_CODE}`, env.SELLER_ADDRESS].filter(Boolean).map(esc).join(' · ')
const vars = {
  PRICE: priceText, YEAR: String(new Date().getFullYear()), BASE_URL,
  CONTACT_EMAIL: esc(env.CONTACT_EMAIL || ''), SELLER: seller || 'Pardavėjo rekvizitai bus paskelbti netrukus',
  CONTACT_LINK: env.CONTACT_EMAIL ? `<a href="mailto:${esc(env.CONTACT_EMAIL)}">${esc(env.CONTACT_EMAIL)}</a>` : '',
}
const cache = new Map()
async function template(name) {
  if (cache.has(name)) return cache.get(name)
  let html = await readFile(join(PUBLIC, name), 'utf8')
  html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m)
  const refs = [...new Set([...html.matchAll(/(?:src|href)="(\/(?:css|js|img)\/[^"?#]+)"/g)].map(m => m[1]))]
  for (const r of refs) {
    try { const h = createHash('sha1').update(await readFile(join(PUBLIC, r))).digest('hex').slice(0, 10); html = html.replaceAll(`"${r}"`, `"${r}?v=${h}"`) } catch {}
  }
  cache.set(name, html)
  return html
}
const sendHtml = (res, html, status = 200) => { res.writeHead(status, { 'content-type': TYPES['.html'], 'cache-control': 'no-cache', ...SECURITY }); res.end(html) }
const json = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...SECURITY }); res.end(JSON.stringify(obj)) }

async function body(req, max = 64 * 1024) {
  const chunks = []; let size = 0
  for await (const c of req) { size += c.length; if (size > max) throw Object.assign(new Error('too large'), { code: 413 }); chunks.push(c) }
  return Buffer.concat(chunks).toString('utf8')
}
// behind Coolify's proxy the real visitor address is the last X-Forwarded-For entry (earlier ones can be faked)
const clientIp = req => (req.headers['x-forwarded-for']?.split(',').at(-1) || req.socket.remoteAddress || '').trim()
const buckets = new Map()
function limited(key, max, windowMs) {
  const now = Date.now(), list = (buckets.get(key) || []).filter(t => now - t < windowMs)
  list.push(now); buckets.set(key, list)
  if (buckets.size > 10000) for (const [k, v] of buckets) if (!v.some(t => now - t < 3600e3)) buckets.delete(k)
  return list.length > max
}
const linkFor = p => `${BASE_URL}/parsisiusti/${p.token}`

// ── a paid Checkout Session becomes a purchase (once), and the link is emailed (once)
async function fulfill(session) {
  const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required'
  if (!paid || session.metadata?.product !== PRODUCT.key) return null
  const email = (session.customer_details?.email || session.customer_email || '').toLowerCase()
  const { purchase, created } = await store.addOnce(session.id, {
    product: PRODUCT.key, email, name: session.customer_details?.name || '',
    amount: session.amount_total ?? null, currency: session.currency || 'eur', consent: session.metadata?.consent || '',
  })
  if (created && email) store.update(purchase, { email_status: await sendLink(email, [linkFor(purchase)]) })
  return purchase
}

const thanks = async (state, p) => (await template('aciu.html'))
  .replace('<!--STATE-->', state === 'paid'
    ? `<p class="lead">Mokėjimas gautas – ačiū!</p><a class="btn btn--big" href="/parsisiusti/${esc(p.token)}">Atsisiųsti PDF</a>
       <p class="small">${p.email ? `Nuorodą taip pat išsiuntėme el. paštu <b>${esc(p.email)}</b>. ` : ''}Nuoroda asmeninė – išsaugokite ją, kad galėtumėte atsisiųsti dar kartą.</p>`
    : state === 'pending'
      ? `<p class="lead">Laukiame mokėjimo patvirtinimo.</p><p class="small">Kai tik banko mokėjimas bus patvirtintas, atsisiuntimo nuorodą atsiųsime el. paštu. Šį puslapį galite atnaujinti po kelių minučių.</p>`
      : `<p class="lead">Šio užsakymo neradome.</p><p class="small">Jei sumokėjote, nuorodą rasite el. laiške. Jo neradote? <a href="/#nuoroda">Atsiųskite nuorodą dar kartą</a>.</p>`)

async function sendStatic(req, res, path, versioned) {
  const file = normalize(join(PUBLIC, decodeURIComponent(path)))
  if (!file.startsWith(PUBLIC + '/')) { res.writeHead(403); return res.end() }
  let info
  try { info = await stat(file) } catch { info = null }
  if (!info?.isFile() || extname(file) === '.html') return sendHtml(res, (await template('404.html')), 404)
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'content-length': info.size, 'cache-control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=3600', ...SECURITY })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}

function adminAllowed(req) {
  if (!env.ADMIN_PASSWORD) return false
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '')
  if (!m) return false
  const pass = Buffer.from(m[1], 'base64').toString().split(':').slice(1).join(':')
  const a = createHash('sha256').update(pass).digest(), b = createHash('sha256').update(env.ADMIN_PASSWORD).digest()
  return timingSafeEqual(a, b)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const path = url.pathname
  try {
    if (path === '/health') return json(res, 200, { ok: true })
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) return sendHtml(res, await template('index.html'))
    if (req.method === 'GET' && path === '/taisykles') return sendHtml(res, await template('taisykles.html'))

    // start a purchase
    if (path === '/api/checkout' && req.method === 'POST') {
      if (limited('co:' + clientIp(req), 10, 600e3)) return json(res, 429, { error: 'Per daug bandymų. Pabandykite po kelių minučių.' })
      const b = JSON.parse(await body(req) || '{}')
      if (b.consent !== true) return json(res, 400, { error: 'Pažymėkite sutikimą, kad PDF būtų pateiktas iš karto.' })
      if (!stripeReady() || !(await productInfo())) return json(res, 503, { error: 'Pirkimas laikinai neveikia. Pabandykite vėliau.' })
      const consentAt = new Date().toISOString()
      const session = await createCheckout({
        mode: 'payment',
        line_items: { 0: env.STRIPE_PRICE_ID ? { price: env.STRIPE_PRICE_ID, quantity: 1 } : { quantity: 1, price_data: { currency: 'eur', unit_amount: PRICE_CENTS, product_data: { name: PRODUCT.name } } } },
        success_url: `${BASE_URL}/aciu?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${BASE_URL}/#pirkti`,
        locale: 'lt',
        allow_promotion_codes: 'true',
        metadata: { product: PRODUCT.key, consent: `digital-content-immediate ${consentAt}` },
        payment_intent_data: { description: PRODUCT.name },
        ...(env.STRIPE_INVOICES === 'true' ? { invoice_creation: { enabled: 'true' } } : {}),
        custom_text: { submit: { message: 'Apmokėjus PDF bus pateiktas iš karto. Sutikote, kad dėl to prarandate teisę atsisakyti sutarties per 14 dienų.' } },
      })
      return json(res, 200, { url: session.url })
    }

    // Stripe tells us about payments (also covers buyers who close the tab before the thank-you page)
    if (path === '/api/stripe/webhook' && req.method === 'POST') {
      const raw = await body(req, 512 * 1024)
      if (!verifyWebhook(raw, req.headers['stripe-signature'], env.STRIPE_WEBHOOK_SECRET)) return json(res, 400, { error: 'bad signature' })
      const event = JSON.parse(raw)
      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) await fulfill(event.data.object)
      return json(res, 200, { received: true })
    }

    // thank-you page: asks Stripe directly whether the session is paid
    if (path === '/aciu' && req.method === 'GET') {
      const id = url.searchParams.get('session_id') || ''
      if (!/^cs_[A-Za-z0-9_]{6,200}$/.test(id)) return sendHtml(res, await thanks('unknown'))
      let p = await store.bySession(id)
      if (!p) {
        const session = await getCheckout(id).catch(() => null)
        if (!session) return sendHtml(res, await thanks('unknown'))
        p = await fulfill(session)
        if (!p) return sendHtml(res, await thanks(session.status === 'complete' ? 'pending' : 'unknown'))
      }
      return sendHtml(res, await thanks('paid', p))
    }

    // the PDF itself, only with a buyer's personal link
    const dl = /^\/parsisiusti\/([A-Za-z0-9_-]{20,64})$/.exec(path)
    if (dl && (req.method === 'GET' || req.method === 'HEAD')) {
      const p = await store.byToken(dl[1])
      if (!p) return sendHtml(res, (await template('404.html')), 404)
      if (p.downloads >= MAX_DOWNLOADS) return sendHtml(res, (await template('limit.html')), 429)
      const info = await stat(PRODUCT.file)
      res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': info.size, 'content-disposition': `attachment; filename="${PRODUCT.download}"`, 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex', ...SECURITY })
      if (req.method === 'HEAD') return res.end()
      store.update(p, { downloads: p.downloads + 1, last_download: new Date().toISOString() })
      return createReadStream(PRODUCT.file).pipe(res)
    }

    // "I lost my link": always the same answer, so nobody can test which emails bought
    if (path === '/api/resend' && req.method === 'POST') {
      const b = JSON.parse(await body(req) || '{}')
      const email = String(b.email || '').trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(res, 400, { error: 'Įrašykite teisingą el. pašto adresą.' })
      if (limited('rs:' + clientIp(req), 5, 600e3) || limited('rse:' + email, 3, 3600e3)) return json(res, 429, { error: 'Per daug bandymų. Pabandykite vėliau.' })
      const mine = await store.byEmail(email)
      if (mine.length) sendLink(email, mine.map(linkFor))
      return json(res, 200, { ok: true })
    }

    // upload / replace the PDF (admin only): raw PDF body
    if (path === '/admin/pdf' && req.method === 'PUT') {
      if (!adminAllowed(req)) { res.writeHead(401, { 'www-authenticate': 'Basic realm="Giliuko meniu"' }); return res.end() }
      const chunks = []; let size = 0
      for await (const c of req) { size += c.length; if (size > 60 * 1024 * 1024) return json(res, 413, { error: 'Failas per didelis (daugiausia 60 MB).' }); chunks.push(c) }
      const buf = Buffer.concat(chunks)
      if (buf.subarray(0, 5).toString() !== '%PDF-') return json(res, 400, { error: 'Tai ne PDF failas.' })
      await mkdir(join(DATA_DIR, 'products'), { recursive: true })
      await writeFile(PRODUCT.file + '.tmp', buf); await rename(PRODUCT.file + '.tmp', PRODUCT.file)
      return json(res, 200, { ok: true, size: buf.length })
    }

    if (path === '/admin') {
      if (!env.ADMIN_PASSWORD) return sendHtml(res, await template('404.html'), 404)
      if (!adminAllowed(req)) { res.writeHead(401, { 'www-authenticate': 'Basic realm="Giliuko meniu"', ...SECURITY }); return res.end('Password required') }
      const list = (await store.all()).slice().reverse()
      const total = list.reduce((s, p) => s + (p.amount || 0), 0)
      const rows = list.map(p => `<tr><td>${esc(p.created.slice(0, 16).replace('T', ' '))}</td><td>${esc(p.email)}<br><small>${esc(p.name)}</small></td><td>${p.amount != null ? (p.amount / 100).toFixed(2) + ' €' : ''}</td><td>${p.downloads}</td><td>${esc(p.email_status)}</td></tr>`).join('')
      const pdf = await productInfo()
      return sendHtml(res, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Pirkimai</title>
        <style>body{font:15px/1.5 system-ui,sans-serif;margin:24px;color:#4a3b2f;background:#f7f1e3}table{border-collapse:collapse;width:100%;background:#fffdf7}td,th{padding:8px 10px;border-bottom:1px solid #e3d8bf;text-align:left;vertical-align:top}small{color:#8a7a68}</style>
        <h1>Pirkimai: ${list.length} · ${(total / 100).toFixed(2)} €</h1><p>Stripe ${stripeReady() ? 'prijungtas' : '<b>neprijungtas</b>'} · el. paštas ${mailReady ? 'veikia' : '<b>išjungtas</b>'}</p>
        <p class="pdf">Parduodamas PDF: ${pdf ? `<b>įkeltas</b> (${(pdf.size / 1048576).toFixed(1)} MB, ${esc(pdf.mtime.toISOString().slice(0, 16).replace('T', ' '))} UTC)` : '<b style="color:#a2463d">neįkeltas – kol jo nėra, pirkti negalima</b>'}
        <br><label>${pdf ? 'Pakeisti' : 'Įkelti'} PDF: <input type="file" id="pdf" accept="application/pdf"></label> <span id="up"></span></p>
        <script>document.getElementById('pdf').onchange = async e => { const f = e.target.files[0], up = document.getElementById('up'); if (!f) return; up.textContent = 'Įkeliama…'
          const r = await fetch('/admin/pdf', { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: f }); const o = await r.json().catch(() => ({}))
          up.textContent = r.ok ? 'Įkelta ✓' : (o.error || 'Nepavyko'); if (r.ok) setTimeout(() => location.reload(), 600) }</script>
        <table><tr><th>Data (UTC)</th><th>Pirkėjas</th><th>Suma</th><th>Atsisiuntimai</th><th>Laiškas</th></tr>${rows || '<tr><td colspan="5">Kol kas pirkimų nėra.</td></tr>'}</table>`)
    }

    if (req.method === 'GET' || req.method === 'HEAD') return sendStatic(req, res, path, url.searchParams.has('v'))
    res.writeHead(405); res.end()
  } catch (e) {
    if (e.code === 413) return json(res, 413, { error: 'Per didelė užklausa.' })
    console.error(e)
    if (path.startsWith('/api/')) return json(res, 502, { error: 'Nepavyko susisiekti su mokėjimų sistema. Pabandykite dar kartą.' })
    sendHtml(res, '<!doctype html><meta charset="utf-8"><p>Įvyko klaida. Pabandykite dar kartą.</p>', 500)
  }
})
server.listen(PORT, () => console.log(`Giliuko meniu on :${PORT} (${BASE_URL}) · Stripe ${stripeReady() ? 'ON' : 'OFF'} · email ${mailReady ? 'ON' : 'OFF'}`))
