// Minimal Stripe client: Checkout Sessions over REST + webhook signature check. No SDK needed.
import { createHmac, timingSafeEqual } from 'node:crypto'

const API = () => process.env.STRIPE_API || 'https://api.stripe.com'
const KEY = () => process.env.STRIPE_SECRET_KEY || ''

// Stripe wants form encoding with bracket notation: a[b][0][c]=x
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (typeof v === 'object') form(v, key, out)
    else out.append(key, String(v))
  }
  return out
}

async function call(method, path, params) {
  if (!KEY()) throw Object.assign(new Error('Stripe is not set up (STRIPE_SECRET_KEY missing)'), { code: 'no_stripe' })
  const res = await fetch(API() + path, {
    method,
    headers: { authorization: `Bearer ${KEY()}`, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': '2024-06-20' },
    body: params ? form(params) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || `Stripe ${res.status}`), { code: 'stripe', status: res.status })
  return data
}

export const createCheckout = params => call('POST', '/v1/checkout/sessions', params)
export const getCheckout = id => call('GET', `/v1/checkout/sessions/${encodeURIComponent(id)}`)
export const stripeReady = () => Boolean(KEY())

// https://docs.stripe.com/webhooks#verify-manually
export function verifyWebhook(raw, header, secret, toleranceSec = 300) {
  if (!secret || !header) return false
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')).filter(p => p.length === 2).map(([k, v]) => [k.trim(), v]))
  const sigs = header.split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3))
  const t = Number(parts.t)
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false
  const expected = createHmac('sha256', secret).update(`${t}.${raw}`).digest()
  return sigs.some(s => { const b = Buffer.from(s, 'hex'); return b.length === expected.length && timingSafeEqual(b, expected) })
}
