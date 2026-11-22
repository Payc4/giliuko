// End-to-end test with a fake Stripe API and a fake mail server: buy -> pay -> thank-you page -> download -> email,
// webhook (good + forged signature), no double purchases, resend link, download limit, admin, phone layout.
// Run: npm test   (needs Playwright installed globally)
import { spawn } from 'node:child_process'
import { createServer as tcp } from 'node:net'
import { createServer as http } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHmac, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
// the book is not in the repo: point PDF_FILE at a copy (default: book/out)
const PDF_FILE = process.env.PDF_FILE || new URL('../book/out/giliuko-meniu-lt.pdf', import.meta.url).pathname
const { chromium } = createRequire(import.meta.url)('playwright')

// ── fake SMTP: keeps every message
const mails = []
const smtp = tcp(sock => {
  let data = false, buf = '', cur = ''
  sock.write('220 test ESMTP\r\n')
  sock.on('data', chunk => {
    buf += chunk.toString('utf8'); let i
    while ((i = buf.indexOf('\r\n')) !== -1) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2)
      if (data) { if (line === '.') { data = false; mails.push(cur); cur = ''; sock.write('250 OK\r\n') } else cur += line + '\n'; continue }
      const cmd = line.slice(0, 4).toUpperCase()
      if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250-test\r\n250 8BITMIME\r\n')
      else if (cmd === 'DATA') { data = true; sock.write('354 go\r\n') }
      else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end() }
      else sock.write('250 OK\r\n')
    }
  })
})
await new Promise(r => smtp.listen(0, '127.0.0.1', r))

// ── fake Stripe: Checkout Sessions + a "pay" page that marks the session paid and redirects to success_url
const sessions = new Map(), stripeCalls = []
const FAKE_PORT = 4893, FAKE = `http://127.0.0.1:${FAKE_PORT}`
const fake = http(async (req, res) => {
  const url = new URL(req.url, FAKE); let raw = ''; for await (const c of req) raw += c
  const send = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)) }
  if (url.pathname.startsWith('/v1/') && req.headers.authorization !== 'Bearer sk_test_fake') return send(401, { error: { message: 'bad key' } })
  if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
    const f = Object.fromEntries(new URLSearchParams(raw)); stripeCalls.push(f)
    const id = 'cs_test_' + randomBytes(12).toString('hex')
    const s = { id, object: 'checkout.session', url: `${FAKE}/pay/${id}`, status: 'open', payment_status: 'unpaid', amount_total: Number(f['line_items[0][price_data][unit_amount]']), currency: 'eur',
      metadata: { product: f['metadata[product]'], consent: f['metadata[consent]'] }, success_url: f.success_url, customer_details: null }
    sessions.set(id, s); return send(200, s)
  }
  const g = /^\/v1\/checkout\/sessions\/(.+)$/.exec(url.pathname)
  if (req.method === 'GET' && g) { const s = sessions.get(g[1]); return s ? send(200, s) : send(404, { error: { message: 'No such checkout.session' } }) }
  const pay = /^\/pay\/(.+)$/.exec(url.pathname)
  if (pay) {
    const s = sessions.get(pay[1]); Object.assign(s, { status: 'complete', payment_status: 'paid', customer_details: { email: 'Ruta@Example.com', name: 'Rūta Bulienė' } })
    res.writeHead(303, { location: s.success_url.replace('{CHECKOUT_SESSION_ID}', s.id) }); return res.end()
  }
  send(404, {})
})
await new Promise(r => fake.listen(FAKE_PORT, '127.0.0.1', r))

const PORT = 4894, BASE = `http://127.0.0.1:${PORT}`, WHSEC = 'whsec_test_' + randomBytes(8).toString('hex')
const dataDir = await mkdtemp(join(tmpdir(), 'gm-'))
const server = spawn(process.execPath, ['server.js'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT), BASE_URL: BASE, DATA_DIR: dataDir, STRIPE_API: FAKE, STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_WEBHOOK_SECRET: WHSEC,
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.address().port), SMTP_SECURE: 'false', SMTP_USER: '', MAIL_FROM: 'shop@example.com', CONTACT_EMAIL: 'labas@example.com',
    ADMIN_PASSWORD: 'test-pass', MAX_DOWNLOADS: '3', SELLER_NAME: 'Testinė MB', SELLER_CODE: '123456789' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let log = ''; server.stdout.on('data', d => log += d); server.stderr.on('data', d => log += d)
for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/health')).ok) break } catch {} await new Promise(r => setTimeout(r, 100)) }

const step = s => console.log('✓', s)
const purchases = async () => JSON.parse(await readFile(join(dataDir, 'purchases.json'), 'utf8').catch(() => '{"purchases":[]}')).purchases
const errors = []
const browser = await chromium.launch()
try {
  // ── landing on a phone
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(BASE + '/')
  assert.match(await page.textContent('h1'), /Giliuko meniu/)
  assert.match(await page.textContent('#pirkti'), /9,99 €/)
  assert.equal((await page.$$('.recipes li')).length, 24)
  assert.match(await page.textContent('.foot'), /Testinė MB · Įm. k. 123456789/)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'no sideways scroll on a phone')
  step('landing: title, price, 24 recipes, seller details, phone layout')

  // ── no selling before the PDF is uploaded; then upload it on /admin
  const coBefore = await fetch(BASE + '/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consent: true }) })
  assert.equal(coBefore.status, 503)
  const auth = { authorization: 'Basic ' + Buffer.from('x:test-pass').toString('base64') }
  assert.equal((await fetch(BASE + '/admin/pdf', { method: 'PUT', body: 'not a pdf', headers: { ...auth } })).status, 400)
  assert.equal((await fetch(BASE + '/admin/pdf', { method: 'PUT', body: await readFile(PDF_FILE) })).status, 401)
  const up = await fetch(BASE + '/admin/pdf', { method: 'PUT', body: await readFile(PDF_FILE), headers: { ...auth, 'content-type': 'application/pdf' } })
  assert.equal(up.status, 200)
  assert.match(await (await fetch(BASE + '/admin', { headers: auth })).text(), /Parduodamas PDF: <b>įkeltas/)
  step('selling stays off until the PDF is uploaded on /admin (password, PDF check)')

  // ── buy: consent required, then Stripe, then thank-you page
  await page.click('#buyBtn')
  assert.match(await page.textContent('#buyStatus'), /sutikim/)
  assert.equal(stripeCalls.length, 0, 'no checkout without consent')
  await page.check('#consent')
  await Promise.all([page.waitForURL(/\/aciu\?session_id=cs_test_/), page.click('#buyBtn')])
  const call = stripeCalls[0]
  assert.deepEqual([call.mode, call['line_items[0][price_data][currency]'], call['line_items[0][price_data][unit_amount]'], call.locale, call['metadata[product]'], call.allow_promotion_codes],
    ['payment', 'eur', '999', 'lt', 'giliuko-meniu-lt', 'true'])
  assert.match(call['metadata[consent]'], /^digital-content-immediate /)
  assert.equal(call.success_url, `${BASE}/aciu?session_id={CHECKOUT_SESSION_ID}`)
  assert.match(await page.textContent('main'), /Mokėjimas gautas/)
  assert.match(await page.textContent('main'), /ruta@example\.com/)
  step('buy: consent required; Stripe Checkout (payment, 9.99 EUR, LT, promo codes) -> thank-you page')

  // ── download
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('a.btn--big')])
  assert.equal(dl.suggestedFilename(), 'Giliuko-meniu.pdf')
  const pdf = await readFile(await dl.path())
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.ok(pdf.length > 500000)
  step('download: the real PDF, as Giliuko-meniu.pdf')

  // ── email
  for (let i = 0; i < 30 && !mails.length; i++) await new Promise(r => setTimeout(r, 100))
  assert.equal(mails.length, 1)
  let all = await purchases()
  assert.equal(all.length, 1)
  const token = all[0].token
  assert.ok(mails[0].includes(`/parsisiusti/${token}`) || mails[0].replace(/=\r?\n/g, '').includes(`/parsisiusti/${token}`))
  assert.match(mails[0], /To: ruta@example\.com/i)
  assert.match(mails[0], /Reply-To: labas@example\.com/)
  step('email: download link sent to the buyer, replies go to the shop')

  // ── same payment reported again (reload + webhook) -> still one purchase, one email
  await page.reload()
  const sid = new URL(page.url()).searchParams.get('session_id')
  const signed = (payload, secret = WHSEC) => { const t = Math.floor(Date.now() / 1000); return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}` }
  const hook = (obj, secret) => { const payload = JSON.stringify(obj); return fetch(BASE + '/api/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signed(payload, secret) }, body: payload }) }
  assert.equal((await hook({ type: 'checkout.session.completed', data: { object: sessions.get(sid) } })).status, 200)
  await new Promise(r => setTimeout(r, 300))
  assert.equal((await purchases()).length, 1); assert.equal(mails.length, 1)
  step('no double purchase or email when the page is reloaded and the webhook also arrives')

  // ── buyer who closes the tab: only the webhook arrives
  const lone = { id: 'cs_test_lone' + randomBytes(6).toString('hex'), payment_status: 'paid', status: 'complete', amount_total: 999, currency: 'eur', metadata: { product: 'giliuko-meniu-lt' }, customer_details: { email: 'jonas@example.com', name: 'Jonas' } }
  assert.equal((await hook({ type: 'checkout.session.completed', data: { object: lone } }, 'whsec_wrong')).status, 400)
  assert.equal((await purchases()).length, 1, 'forged webhook ignored')
  assert.equal((await hook({ type: 'checkout.session.completed', data: { object: lone } })).status, 200)
  for (let i = 0; i < 30 && mails.length < 2; i++) await new Promise(r => setTimeout(r, 100))
  all = await purchases(); assert.equal(all.length, 2); assert.equal(all[1].email, 'jonas@example.com'); assert.equal(mails.length, 2)
  const unpaid = { ...lone, id: 'cs_test_unpaid1', payment_status: 'unpaid' }
  await hook({ type: 'checkout.session.completed', data: { object: unpaid } })
  assert.equal((await purchases()).length, 2, 'unpaid session not fulfilled')
  step('webhook: signed payment fulfilled + emailed; forged signature and unpaid sessions ignored')

  // ── resend link: same answer for everyone, email only to buyers
  const resend = email => fetch(BASE + '/api/resend', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.' + Math.floor(Math.random() * 200) }, body: JSON.stringify({ email }) })
  const r1 = await resend('RUTA@example.com'), r2 = await resend('nobody@example.com')
  assert.equal(r1.status, 200); assert.equal(r2.status, 200)
  assert.deepEqual(await r1.json(), await r2.json())
  for (let i = 0; i < 30 && mails.length < 3; i++) await new Promise(r => setTimeout(r, 100))
  await new Promise(r => setTimeout(r, 300))
  assert.equal(mails.length, 3); assert.match(mails[2], /To: ruta@example\.com/i)
  step('resend link: emailed to buyers only, identical answer for unknown emails')

  // ── download limit + bad links + no direct access to the PDF
  for (let i = 0; i < 2; i++) assert.equal((await fetch(`${BASE}/parsisiusti/${token}`)).status, 200)
  assert.equal((await fetch(`${BASE}/parsisiusti/${token}`)).status, 429, 'limit (3 in this test)')
  assert.equal((await fetch(`${BASE}/parsisiusti/${'x'.repeat(32)}`)).status, 404)
  for (const p of ['/products/giliuko-meniu-lt.pdf', '/../data/products/giliuko-meniu-lt.pdf', '/%2e%2e/products/giliuko-meniu-lt.pdf', '/giliuko-meniu-lt.pdf']) {
    const r = await fetch(BASE + p); assert.notEqual(r.headers.get('content-type'), 'application/pdf', p)
  }
  assert.equal((await fetch(BASE + '/aciu?session_id=cs_test_doesnotexist')).status, 200)
  assert.match(await (await fetch(BASE + '/aciu?session_id=cs_test_doesnotexist')).text(), /Šio užsakymo neradome/)
  step('PDF only through a personal link; download limit; unknown links and orders handled')

  // ── admin
  assert.equal((await fetch(BASE + '/admin')).status, 401)
  const adm = await fetch(BASE + '/admin', { headers: { authorization: 'Basic ' + Buffer.from('x:test-pass').toString('base64') } })
  const html = await adm.text()
  assert.equal(adm.status, 200); assert.match(html, /Pirkimai: 2 · 19\.98 €/); assert.ok(html.includes('ruta@example.com') && html.includes('jonas@example.com'))
  step('/admin: password, purchases and total')

  // ── other pages
  for (const p of ['/taisykles']) assert.equal((await fetch(BASE + p)).status, 200)
  const home = await (await fetch(BASE + '/')).text()
  assert.match(home, /\/css\/site\.css\?v=[a-f0-9]{10}/, 'own files fingerprinted')
  step('terms page; fingerprinted CSS/JS')

  assert.deepEqual(errors, []); step('no JavaScript errors')
  console.log('\nALL PASSED')
} catch (e) {
  console.error('\nFAILED:', e); console.error(log.slice(-2500)); process.exitCode = 1
} finally {
  await browser.close(); server.kill(); smtp.close(); fake.close(); await rm(dataDir, { recursive: true, force: true })
}
