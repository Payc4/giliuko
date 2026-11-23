# Giliuko meniu – shop

One-page shop for the **Giliuko meniu** PDF (24 family recipes, Lithuanian): landing page → Stripe Checkout (one-time, 4.99 EUR) → download page + email with a personal link.

- `server.js`: landing page, `POST /api/checkout`, Stripe webhook, thank-you page `/aciu`, downloads `/parsisiusti/<token>`, "resend my link", `/admin`
- `lib/stripe.js`: Stripe over plain REST (no SDK) + webhook signature check
- `lib/store.js`: purchases in `DATA_DIR/purchases.json`
- `lib/mail.js`: download-link email over SMTP (nodemailer)
- `public/`: the landing page and small pages (thank you, terms, 404)
- `book/`: the code that designs the PDF (layout + illustrations). **The recipe text (`book/content/`) and the PDF are not in this repo** – it is public, and they are the paid product.

## The PDF

The sold PDF lives on the server's persistent volume, not in git. After deploying, open `/admin`, and upload it (“Įkelti PDF”). Until a PDF is uploaded the buy button answers “temporarily unavailable”, so nothing can be sold without a file.

To rebuild the PDF after editing recipes: put the content file at `book/content/lt.mjs`, then `npm run book` (needs Playwright + Chromium) → `book/out/giliuko-meniu-lt.pdf`, and upload it on `/admin`.

## How a purchase works

1. Buyer ticks the consent box (digital content delivered immediately → no 14-day withdrawal) and clicks **Pirkti**.
2. `POST /api/checkout` creates a Stripe Checkout Session (`mode=payment`, EUR, Lithuanian, promo codes allowed). The consent and its time go into the session metadata.
3. After paying, Stripe sends the buyer to `/aciu?session_id=…`. The server asks Stripe whether it's paid, records the purchase **once**, shows the download button and emails the link.
4. The webhook `checkout.session.completed` does the same for buyers who close the tab early. Page + webhook never create two purchases or two emails.
5. Links are personal and work 30 times (`MAX_DOWNLOADS`). Lost link → the form under “Pametėte atsisiuntimo nuorodą?” emails it again.

## Stripe setup (new Stripe account for Giliuko meniu)

1. Create the account (stripe.com → your account menu → **New account**), fill in the business details.
2. **Developers → API keys**: copy the *Secret key* into Coolify as `STRIPE_SECRET_KEY` (use `sk_test_…` first to test, then `sk_live_…`).
3. **Developers → Webhooks → Add endpoint**: URL `https://giliukomeniu.lt/api/stripe/webhook`, events `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy the *Signing secret* into `STRIPE_WEBHOOK_SECRET`.
4. Optional: **Settings → Customer emails** → turn on receipts for successful payments. **Settings → Payment methods**: cards, Apple Pay and Google Pay are on by default.
5. For testing: create a 100% coupon + promotion code (Products → Coupons) and buy with it, or use test card `4242 4242 4242 4242` with a test key.

## Deploy on Coolify

1. New resource → Public repository `Payc4/giliuko`, branch `main`, build pack **Dockerfile**, port **3000**.
2. Persistent storage: volume at **`/app/data`** (purchases + the uploaded PDF).
3. Domain `https://giliukomeniu.lt` (+ `www`). DNS: A record `@` → `2.24.164.200` (and `www`).
4. Environment variables (runtime):

| Variable | Example | |
|---|---|---|
| `BASE_URL` | `https://giliukomeniu.lt` | Used in Stripe return links and emails |
| `STRIPE_SECRET_KEY` | `sk_live_…` | Secret – Coolify only |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | Secret – Coolify only |
| `PRICE_CENTS` | `499` | Price shown and charged (default 499 = 4.99 EUR) |
| `STRIPE_PRICE_ID` | `price_…` | Optional: use a Stripe Price instead of `PRICE_CENTS` |
| `STRIPE_INVOICES` | `true` | Optional: Stripe creates an invoice PDF per purchase (Stripe charges a small fee) |
| `ADMIN_PASSWORD` | long random | `/admin` (any username) |
| `CONTACT_EMAIL` | `labas@giliukomeniu.lt` | Shown on the site; replies to emails go here |
| `SELLER_NAME`, `SELLER_CODE`, `SELLER_ADDRESS` | | Seller details in the footer and terms (required for an online shop) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | | Email for download links (Brevo / Gmail app password / Hostinger) |
| `MAX_DOWNLOADS` | `30` | Uses per personal link |

The deploy log prints `Stripe ON/OFF · email ON/OFF`.

## Run and test locally

```
npm install
npm start                 # http://localhost:3000 (Stripe OFF without keys)
npm test                  # e2e with fake Stripe + fake SMTP (needs Playwright; PDF_FILE=path/to.pdf if book/out is empty)
```

## Later

The shop is built around products (`PRODUCT` in `server.js`) so an English PDF, the AI coach, video lessons and a quiz can be added as more products later.
