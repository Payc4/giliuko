# Notes for Claude / developers

- **This repo is public.** Never commit the recipe text (`book/content/`), the PDF, or anything from the paid book beyond the three sample page images in `public/img/`. `.gitignore` covers them; check `git status` before committing.
- The sold PDF is uploaded on `/admin` and lives on the volume (`DATA_DIR/products/`). Selling is off until it exists.
- Stripe is called over REST in `lib/stripe.js` (no SDK). Keys only as Coolify runtime env vars; never in code, logs or chat.
- Purchases must stay idempotent: the thank-you page and the webhook can both report the same session (`store.addOnce`).
- Product wording comes from the author's draft; don't invent claims, reviews or testimonials. Numbers on the landing page (24 recipes, 15 family, 9 breakfast, 8 freezer, 6 lunch box, 29 pages) come from the book: update them if the book changes.
- Node 22, one dependency (nodemailer). Run `npm test` (fake Stripe + fake SMTP, Playwright) before pushing.
