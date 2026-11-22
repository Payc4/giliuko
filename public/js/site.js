// Giliuko meniu: buy button -> Stripe Checkout, page preview lightbox, "resend my link" form.
(() => {
  const $ = s => document.querySelector(s)

  // buy
  const btn = $('#buyBtn'), consent = $('#consent'), status = $('#buyStatus')
  btn?.addEventListener('click', async () => {
    status.textContent = ''
    if (!consent.checked) {
      consent.closest('.consent').classList.add('need')
      status.textContent = 'Pažymėkite sutikimą, kad PDF būtų pateiktas iš karto.'
      consent.focus(); return
    }
    btn.disabled = true; btn.textContent = 'Jungiamasi prie mokėjimo…'
    try {
      const res = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consent: true }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok || !out.url) throw new Error(out.error || 'Nepavyko pradėti mokėjimo. Pabandykite dar kartą.')
      location.href = out.url
    } catch (e) {
      status.textContent = e.message; btn.disabled = false; btn.textContent = btn.dataset.label
    }
  })
  consent?.addEventListener('change', () => { consent.closest('.consent').classList.remove('need'); status.textContent = '' })
  // back from Stripe (cancel) or from a link: the browser may restore a disabled button
  if (btn) btn.dataset.label = btn.textContent
  addEventListener('pageshow', () => { if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label } })

  // page previews
  const lb = $('#lightbox')
  document.querySelectorAll('.page').forEach(p => p.addEventListener('click', () => { lb.querySelector('img').src = p.dataset.full; lb.querySelector('img').alt = p.querySelector('img').alt; lb.hidden = false }))
  lb?.addEventListener('click', () => { lb.hidden = true })
  addEventListener('keydown', e => { if (e.key === 'Escape' && lb) lb.hidden = true })

  // open the "lost link" answer when arriving via #nuoroda
  if (location.hash === '#nuoroda') $('#nuoroda')?.setAttribute('open', '')

  // resend link
  const form = $('#resendForm'), rs = $('#resendStatus')
  form?.addEventListener('submit', async e => {
    e.preventDefault()
    const email = form.email.value.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { rs.className = 'resend__status err'; rs.textContent = 'Įrašykite teisingą el. pašto adresą.'; return }
    const b = form.querySelector('button'); b.disabled = true
    try {
      const res = await fetch('/api/resend', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out.error || 'Nepavyko. Pabandykite dar kartą.')
      rs.className = 'resend__status ok'; rs.textContent = 'Jei šiuo adresu buvo pirkta, nuorodą jau išsiuntėme. Patikrinkite ir „Spam“ aplanką.'
    } catch (err) { rs.className = 'resend__status err'; rs.textContent = err.message } finally { b.disabled = false }
  })
})()
