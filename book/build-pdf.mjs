// Builds the Giliuko meniu PDF: node build-pdf.mjs [lt]  -> out/giliuko-meniu-<lang>.pdf (+ page previews)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { art, filters, icons, palette as C } from './art.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const lang = process.argv[2] || 'lt'
const { book, recipes } = await import(`./content/${lang}.mjs`)
mkdirSync('out/img', { recursive: true })
const b = await chromium.launch()

// 1) illustrations -> transparent PNGs (sharp in print, small PDF)
const sizes = { wreath: 1400, acornHero: 900, oakSprig: 1100, divider: 900 }
for (const [k, f] of Object.entries(art)) {
  const file = `out/img/${k}.png`
  if (existsSync(file) && !process.env.REDRAW) continue
  const [, , vw, vh] = /viewBox="([^"]+)"/.exec(f())[1].split(/\s+/).map(Number)
  const W = sizes[k] || 700, H = Math.round(W * vh / vw) // canvas the same shape as the drawing: no empty margins
  const p = await b.newPage({ viewport: { width: W, height: H } })
  await p.setContent(`<style>html,body{margin:0;background:transparent}svg{width:100vw;height:100vh;display:block}</style>${filters}${f()}`)
  await p.waitForTimeout(100)
  await p.screenshot({ path: file, omitBackground: true }); await p.close()
}
const img = k => `data:image/png;base64,${readFileSync(`out/img/${k}.png`).toString('base64')}`
// the author's photo (background removed, faded at the waist) – private, kept next to the content
const photo = existsSync(`content/photo.png`) ? `data:image/png;base64,${readFileSync('content/photo.png').toString('base64')}` : null

// 2) fonts
const fontDir = 'node_modules/@fontsource'
const RANGES = { latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD', 'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' }
const face = (fam, dir, w, st) => ['latin', 'latin-ext'].map(sub => `@font-face{font-family:'${fam}';font-weight:${w};font-style:${st};unicode-range:${RANGES[sub]};src:url(data:font/woff2;base64,${readFileSync(`${fontDir}/${dir}/files/${dir}-${sub}-${w}-${st}.woff2`).toString('base64')}) format('woff2')}`).join('')
const fonts = [[500, 'normal'], [600, 'normal'], [700, 'normal'], [500, 'italic'], [600, 'italic']].map(([w, s]) => face('Cormorant', 'cormorant-garamond', w, s)).join('')
  + [400, 500, 600].map(w => face('Montserrat', 'montserrat', w, 'normal')).join('')

// 3) pages
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&lt;(\/?)b&gt;/g, '<$1b>')
// small motif top-right (never wider than the title's right margin) + a big vignette that fills the free space at the bottom
const cornerArt = ['wheat', 'apple', 'wheat', 'strawberry', 'berries', 'mushroom', 'apple', 'carrot', 'wheat', 'apple', 'wheat', 'carrot', 'berries', 'apple', 'strawberry', 'wheat', 'mushroom', 'carrot', 'mushroom', 'berries', 'carrot', 'wheat', 'apple', 'carrot']
const fillArt = ['oakSprig', 'berries', 'oakSprig', 'carrot', 'oakSprig', 'berries', 'oakSprig', 'mushroom', 'oakSprig', 'berries', 'oakSprig', 'oakSprig', 'carrot', 'oakSprig', 'berries', 'oakSprig', 'oakSprig', 'berries', 'oakSprig', 'oakSprig', 'berries', 'oakSprig', 'oakSprig', 'berries']
const tipTitle = t => t.title || book.labels[t.kind] || book.labels.tip
const chips = r => {
  const out = []
  if (r.meta?.yield) out.push(`<li>${icons.portions}${esc(r.meta.yield)}</li>`)
  if (r.meta?.time) out.push(`<li>${icons.quick}${esc(r.meta.time)}</li>`)
  for (const t of r.tags || []) if (!(t === 'quick' && r.meta?.time)) out.push(`<li>${icons[t]}${esc(book.tags[t])}</li>`)
  if (r.metaExtra) out.push(`<li class="plain">${esc(r.metaExtra)}</li>`)
  return out.length ? `<ul class="chips">${out.join('')}</ul>` : ''
}
const list = (items, ordered) => `<${ordered ? 'ol' : 'ul'}>${items.map(i => `<li>${esc(i)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`
const ingredients = r => `<aside class="ingr"><h3>${book.labels.ingredients}</h3>
  ${r.groups.map(g => `${g.title ? `<h4>${esc(g.title)}</h4>` : ''}${g.lead ? `<p class="lead-s">${esc(g.lead)}</p>` : ''}${g.inline ? `<p class="inline">${g.items.map(esc).join(' · ')}</p>` : list(g.items)}${g.after ? `<p class="note">${esc(g.after)}</p>` : ''}`).join('')}
  ${r.note ? `<p class="note">${esc(r.note)}</p>` : ''}${(r.notes || []).map(n => `<p class="note">${esc(n)}</p>`).join('')}</aside>`
const method = (r, { withFillings = true } = {}) => `<div class="method">
  ${r.steps ? `<h3>${book.labels.steps}</h3>${list(r.steps, true)}` : ''}
  ${r.stepGroups ? `<h3>${book.labels.steps}</h3>${r.stepGroups.map((g, i) => `<h4><span class="gn">${i + 1}</span>${esc(g.title)}</h4>${g.paras.map(p => `<p>${esc(p)}</p>`).join('')}`).join('')}` : ''}
  ${(r.extras || []).map(x => `<section class="extra"><h4>${esc(x.title)}</h4>${x.parasAfter ? '' : (x.paras || []).map(p => `<p>${esc(p)}</p>`).join('')}${x.list ? list(x.list, x.ordered) : ''}${x.parasAfter ? (x.paras || []).map(p => `<p>${esc(p)}</p>`).join('') : ''}</section>`).join('')}
  ${r.warning ? `<p class="warn">${esc(r.warning)}</p>` : ''}
  ${withFillings && r.fillings ? fillings(r) : ''}</div>`
const fillings = r => `<div class="fillings">${r.fillings.map((f, i) => `<section class="filling"><h4><span class="gn">${i + 1}</span>${esc(f.title)}</h4>${list(f.items)}<p>${esc(f.text)}</p></section>`).join('')}</div>`
const tip = t => t ? `<div class="tip"><div class="tip__h">${icons.acorn}<span>${esc(tipTitle(t))}</span></div>${t.paras.map(p => `<p>${esc(p)}</p>`).join('')}
  ${t.quote ? `<blockquote>${t.quote.map((q, i) => `<p${i === 0 ? ' class="q1"' : ''}>${esc(q)}</p>`).join('')}</blockquote>` : ''}</div>` : ''

let pageNo = 0
const pages = []
const page = (cls, body, { num = true } = {}) => { pageNo++; pages.push(`<section class="page ${cls}"><div class="inner">${body}</div>${num ? `<footer><span>${esc(book.footer)}</span><span class="pn">${pageNo}</span></footer>` : ''}</section>`) }

// cover
page('cover', `<div class="cover__wreath"><img src="${img('wreath')}" alt="">${photo ? `<img class="cover__photo" src="${photo}" alt="">` : `<img class="cover__acorn" src="${img('acornHero')}" alt="">`}</div>
  <h1>${esc(book.title)}</h1><p class="cover__sub">${esc(book.subtitle)}</p><img class="cover__div" src="${img('divider')}" alt=""><p class="cover__line">${esc(book.coverLine)}</p>`, { num: false })
// intro letter
page('letter', `<h2 class="ptitle">${esc(book.introTitle)}</h2><img class="div" src="${img('divider')}" alt="">
  <div class="letter__body">${book.intro.map((p, i) => `<p${i === 0 ? ' class="salute"' : ''}>${esc(p)}</p>`).join('')}<p class="sign">– ${esc(book.signature)}</p></div>
  ${photo ? `<div class="corner letter__photo"><img src="${img('wreath')}" alt=""><img class="letter__photo-img" src="${photo}" alt=""></div>` : ''}
  <img class="corner letter__art" src="${img('oakSprig')}" alt="">`)
// contents (filled after we know recipe pages)
const contentsIndex = pages.length; page('contents', '')
// recipes
const startPage = []
recipes.forEach((r, i) => {
  const art = cornerArt[i % cornerArt.length], fill = fillArt[i % fillArt.length]
  const fillImg = `<img class="fill fill--${i % 2 ? 'left' : 'right'} fill--${fill}" src="${img(fill)}" alt="">`
  const head = `<img class="corner corner--right corner--${art}" src="${img(art)}" alt="">
    <header class="rh"><p class="rnum">${book.labels.recipe} ${i + 1}</p><h2>${esc(r.title)}</h2>${r.sub ? `<p class="rsub">${esc(r.sub)}</p>` : ''}${chips(r)}</header>
    ${(r.intro || []).map(p => `<p class="rintro">${esc(p)}</p>`).join('')}`
  startPage[i] = pageNo + 1
  if (r.fillings) {
    // one page: base recipe, then the three fillings side by side, then the tip
    page('recipe', `${head}<div class="cols">${ingredients(r)}${method(r, { withFillings: false })}</div>${fillings(r)}${tip(r.tip)}${fillImg}`)
  } else {
    page('recipe', `${head}<div class="cols">${ingredients(r)}${method(r)}</div>${tip(r.tip)}${fillImg}`)
  }
})
// safety page
if (book.safety) {
  const sf = book.safety
  page('safety', `<h2 class="ptitle">${esc(sf.title)}</h2><img class="div" src="${img('divider')}" alt="">
    <ul class="safety__list">${sf.items.map(t => `<li>${icons.acorn}<span>${esc(t)}</span></li>`).join('')}</ul>
    <p class="safety__note">${esc(sf.note)}</p><p class="safety__src">${sf.sources.split(' · ').map(esc).join('<br>')}</p>
    <img class="corner safety__art" src="${img('berries')}" alt="">`)
}
// outro
page('outro', `<img class="outro__acorn" src="${img('acornHero')}" alt=""><h2 class="ptitle">${esc(book.outroTitle)}</h2><img class="div" src="${img('divider')}" alt="">${book.outro.map(p => `<p>${esc(p)}</p>`).join('')}<p class="copy">${esc(book.copyright)}</p>`, { num: false })
// contents body
const tocItems = recipes.map((r, i) => `<li><span class="tn">${i + 1}</span><span class="tt">${esc(r.title)}</span><span class="dots"></span><span class="tp">${startPage[i]}</span></li>`).join('')
const legend = Object.entries(book.tags).map(([k, v]) => `<li>${icons[k]}${esc(v)}</li>`).join('')
pages[contentsIndex] = pages[contentsIndex].replace('<div class="inner"></div>', `<div class="inner"><h2 class="ptitle">${esc(book.contentsTitle)}</h2><img class="div" src="${img('divider')}" alt=""><ol class="toc">${tocItems}</ol><div class="legend"><h3>${esc(book.legendTitle)}</h3><ul>${legend}</ul></div></div>`)

const css = `${fonts}
@page { size: A4; margin: 0 }
:root { --fs: 11.2pt }
* { box-sizing: border-box }
html, body { margin: 0; padding: 0 }
body { font-family: Montserrat, sans-serif; color: ${C.ink}; -webkit-print-color-adjust: exact; print-color-adjust: exact }
.page { position: relative; width: 210mm; height: 297mm; overflow: hidden; page-break-after: always; break-after: page;
  background: radial-gradient(ellipse at 30% 20%, #fbf6ea 0%, ${C.paper} 55%, #f1e8d4 100%) }
.page::before { content: ''; position: absolute; inset: 7mm; border: .35mm solid rgba(125,138,90,.28); border-radius: 3mm; pointer-events: none }
.inner { position: absolute; inset: 15mm 17mm 19mm; font-size: var(--fs); line-height: 1.5 }
footer { position: absolute; left: 17mm; right: 17mm; bottom: 10.5mm; display: flex; justify-content: space-between; font: 500 7.5pt Montserrat; letter-spacing: .18em; text-transform: uppercase; color: ${C.olive} }
footer .pn { letter-spacing: 0; font: 600 italic 11pt Cormorant }
h1, h2 { font-family: Cormorant, serif; font-weight: 600; color: ${C.ink}; margin: 0 }
.ptitle { text-align: center; font-size: 34pt; margin-top: 8mm }
img.div { display: block; width: 62mm; margin: 2mm auto 7mm }
p { margin: 0 0 .55em }
/* cover */
.cover .inner { inset: 14mm 18mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding-bottom: 8mm }
.cover__wreath { position: relative; width: 150mm; height: 150mm; margin: 0 0 2mm }
.cover__wreath img:first-child { width: 100%; height: 100% }
.cover__photo { position: absolute; left: 50%; top: 9%; width: 78%; transform: translateX(-50%); z-index: 1 }
.letter__photo { position: absolute; left: -2mm; bottom: -4mm; width: 86mm; height: 86mm }
.letter__photo > img:first-child { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .9 }
.letter__photo-img { position: absolute; left: 50%; top: 8%; width: 80%; transform: translateX(-50%) }
.safety .inner { padding: 0 6mm }
.safety__list { list-style: none; padding: 0; margin: 2mm auto 0; max-width: 150mm }
.safety__list li { display: flex; gap: 3.5mm; align-items: flex-start; padding: 3.2mm 0; border-bottom: .3mm dotted rgba(74,59,47,.2); font-size: 11.4pt; line-height: 1.55 }
.safety__list li:last-child { border-bottom: 0 }
.safety__list .ico { width: 5.2mm; height: 5.2mm; margin-top: .6mm }
.safety__note { max-width: 150mm; margin: 7mm auto 0; padding: 5mm 6mm; border-radius: 3mm; background: rgba(167,178,138,.2); border-left: 1.4mm solid ${C.sage}; font: italic 600 14pt Cormorant; color: ${C.moss}; line-height: 1.35 }
.safety__src { position: absolute; left: 6mm; right: 6mm; bottom: 0; text-align: center; font-size: 7.6pt; line-height: 1.6; color: ${C.ink2}; letter-spacing: .01em }
.safety__art { position: absolute; right: -10mm; top: -8mm; width: 40mm }
.cover__acorn { position: absolute; left: 50%; top: 50%; width: 72mm; transform: translate(-50%, -54%) }
.cover h1 { font-size: 64pt; line-height: 1; margin-top: 2mm; letter-spacing: .01em }
.cover__sub { font: italic 500 17pt Cormorant; color: ${C.ink2}; margin: 3mm 0 0 }
.cover__div { width: 70mm; margin: 6mm 0 5mm }
.cover__line { font-size: 9.5pt; letter-spacing: .08em; color: ${C.olive}; max-width: 120mm; line-height: 1.6 }
/* letter */
.letter__body { max-width: 138mm; margin: 0 auto; font-size: 11pt; line-height: 1.72 }
.letter__body p { margin-bottom: 1em }
.letter__body .salute { font: italic 600 17pt Cormorant; margin-bottom: .8em }
.letter__body .sign { font: italic 600 15pt Cormorant; color: ${C.olive}; text-align: right; margin-top: 1.4em }
.letter__art { position: absolute; right: -10mm; bottom: -9mm; width: 78mm; transform: scaleX(-1) }
/* contents */
.toc { list-style: none; padding: 0; margin: 4mm 0 0; columns: 2; column-gap: 10mm }
.toc li { display: flex; align-items: baseline; gap: 2.4mm; padding: 1.6mm 0; font-size: 10pt; line-height: 1.35; break-inside: avoid }
.tn { font: italic 600 13pt Cormorant; color: ${C.rose}; width: 7mm; text-align: right; flex: none }
.dots { flex: 1; border-bottom: .3mm dotted rgba(74,59,47,.35); transform: translateY(-1mm) }
.tp { font: 600 12pt Cormorant; flex: none }
.legend { margin-top: 12mm; padding-top: 7mm; border-top: .3mm solid rgba(125,138,90,.25); text-align: center }
.legend h3, .ingr h3, .method h3 { font: 600 8pt Montserrat; letter-spacing: .2em; text-transform: uppercase; color: ${C.olive}; margin: 0 0 2.5mm }
.legend ul { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 2mm 5mm; font-size: 8.5pt }
.legend li, .chips li { display: inline-flex; align-items: center; gap: 1.4mm }
.ico { width: 4.2mm; height: 4.2mm; color: ${C.olive}; flex: none }
/* recipe */
.corner { position: absolute; z-index: 0; opacity: .95; pointer-events: none }
.corner--right { right: -6mm; top: -5mm; width: 34mm }
.corner--wheat { width: 20mm; right: 0 } .corner--carrot { width: 22mm; right: 0 } .corner--berries { width: 36mm }
.recipe .rh { position: relative; z-index: 1; padding-right: 34mm }
.fill { position: absolute; bottom: -2mm; width: auto; z-index: 0; pointer-events: none; object-fit: contain }
.fill--right { right: -6mm } .fill--left { left: -6mm; transform: scaleX(-1) }
.rnum { font: 600 7.5pt Montserrat; letter-spacing: .24em; text-transform: uppercase; color: ${C.rose}; margin: 0 0 1mm }
.rh h2 { font-size: 27pt; line-height: 1.05 }
.rh--cont h2 { font-size: 20pt; color: ${C.ink2} }
.rsub { font: italic 500 13.5pt Cormorant; color: ${C.ink2}; margin: 1.5mm 0 0; line-height: 1.3 }
.chips { list-style: none; padding: 0; margin: 3mm 0 0; display: flex; flex-wrap: wrap; gap: 1.6mm 2.4mm }
.chips li { font-size: 7.6pt; font-weight: 500; letter-spacing: .02em; padding: .9mm 2.4mm .9mm 1.8mm; border-radius: 99px; background: rgba(167,178,138,.22); color: ${C.ink} }
.chips li.plain { padding-left: 2.4mm; background: rgba(201,143,138,.16) }
.chips .ico { width: 3.5mm; height: 3.5mm }
.rintro { font: italic 500 12.4pt Cormorant; line-height: 1.45; color: ${C.ink2}; margin: 4mm 0 0; position: relative; z-index: 1 }
.cols { position: relative; z-index: 1; display: grid; grid-template-columns: 62mm 1fr; gap: 7mm; margin-top: 5.5mm }
.ingr { background: rgba(239,230,210,.75); border-radius: 3mm; padding: 4.5mm 4.5mm 3.5mm; align-self: start }
.ingr h4, .method h4 { font: 600 italic 12pt Cormorant; color: ${C.moss}; margin: 2.5mm 0 1mm }
.ingr h3 + h4 { margin-top: 0 }
.ingr ul { list-style: none; padding: 0; margin: 0 0 1mm }
.ingr li { position: relative; padding: .55mm 0 .55mm 4mm; font-size: .93em; line-height: 1.38; border-bottom: .25mm dotted rgba(74,59,47,.16) }
.ingr li:last-child { border-bottom: 0 }
.ingr li::before { content: ''; position: absolute; left: .4mm; top: 2.1mm; width: 1.5mm; height: 1.5mm; border-radius: 50%; background: ${C.sage} }
.ingr .note, .ingr .lead-s, .ingr .inline { font-size: .86em; line-height: 1.45; color: ${C.ink2}; margin: 2mm 0 0 }
.ingr .inline { margin-top: .5mm }
.method ol { list-style: none; counter-reset: s; padding: 0; margin: 0 }
.method ol li { counter-increment: s; position: relative; padding-left: 8mm; margin-bottom: 2mm }
.method ol li::before { content: counter(s); position: absolute; left: 0; top: -.6mm; width: 5.6mm; text-align: center; font: italic 600 14pt Cormorant; color: ${C.rose} }
.method h4 .gn, .filling h4 .gn { display: inline-block; width: 5mm; font-style: italic; color: ${C.rose} }
.extra { margin-top: 3mm }
.extra ul, .extra ol { margin: 0; padding-left: 5mm }
.extra ul li, .extra ol li { margin-bottom: .8mm }
.extra ol li::before { content: none }
.extra ol { list-style: decimal }
.warn { margin-top: 3mm; padding: 2.5mm 3.5mm; border-radius: 2mm; background: rgba(201,143,138,.16); font-size: .9em }
.fillings { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; margin-top: 6mm; position: relative; z-index: 1 }
.filling { background: rgba(239,230,210,.75); border-radius: 3mm; padding: 4mm }
.filling h4 { font: 600 italic 13pt Cormorant; color: ${C.moss}; margin: 0 0 2mm }
.filling ul { padding-left: 4.5mm; margin: 0 0 2mm; font-size: .93em }
.tip { position: relative; z-index: 1; margin-top: 5mm; padding: 4mm 5mm 3mm; border-radius: 3mm; background: rgba(255,252,245,.7); border: .35mm solid rgba(125,138,90,.35); border-left: 1.4mm solid ${C.sage} }
.tip__h { display: flex; align-items: center; gap: 2mm; font: 600 italic 13.5pt Cormorant; color: ${C.moss}; margin-bottom: 1.5mm }
.tip__h .ico { width: 5mm; height: 5mm }
.tip p { font-size: .95em }
blockquote { margin: 3mm 0 1mm; padding: 0; text-align: center; font: italic 500 13pt Cormorant; color: ${C.ink2} }
blockquote .q1 { font-weight: 600; font-size: 15pt; color: ${C.rose} }
/* outro */
.outro .inner { text-align: center }
.outro__acorn { width: 60mm; display: block; margin: 40mm auto 0 }
.outro p { font: italic 500 15pt Cormorant; color: ${C.ink2}; margin: 0 0 2mm }
.outro .copy { position: absolute; left: 0; right: 0; bottom: 0; font: 400 7.5pt Montserrat; letter-spacing: .03em; color: ${C.olive} }
`
const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(book.title)}</title><style>${css}</style></head><body>${pages.join('\n')}</body></html>`
writeFileSync(`out/book-${lang}.html`, html)

// 4) fit: shrink a page's text a little if it doesn't fit; report pages that still overflow
const p = await b.newPage()
await p.setContent(html, { waitUntil: 'load' })
await p.evaluate(() => document.fonts.ready)
const report = await p.evaluate(() => {
  const out = []
  document.querySelectorAll('.page').forEach((pg, i) => {
    const inner = pg.querySelector('.inner')
    const over = () => { const r = inner.getBoundingClientRect(); return [...inner.children].some(c => !c.matches('.corner, .fill') && c.getBoundingClientRect().bottom > r.bottom + 1) }
    let fs = 11.2
    if (pg.classList.contains('recipe')) while (over() && fs > 8.8) { fs -= 0.2; inner.style.setProperty('--fs', fs.toFixed(1) + 'pt') }
    // big vignette: fill the free space under the content, or drop it if there isn't room
    const fill = inner.querySelector('.fill')
    if (fill) {
      const mm = 96 / 25.4, r = inner.getBoundingClientRect()
      const last = Math.max(...[...inner.children].filter(c => !c.matches('.corner, .fill')).map(c => c.getBoundingClientRect().bottom))
      const free = (r.bottom - last) / mm
      if (free < 34) fill.remove()
      else { fill.style.height = Math.min(free - 6, 86) + 'mm'; fill.style.maxWidth = '118mm' }
    }
    if (fs < 11.2 || over()) out.push({ page: i + 1, fs: +fs.toFixed(1), overflow: over() })
  })
  return out
})
console.log('pages:', pageNo, 'adjusted:', JSON.stringify(report))
await p.pdf({ path: `out/giliuko-meniu-${lang}.pdf`, preferCSSPageSize: true, printBackground: true })
await b.close()
