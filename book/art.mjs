// Original watercolour-style illustrations for Giliuko meniu (inline SVG, drawn for this project).
// A shared filter set gives soft, wobbly pigment edges and paper granulation.

export const palette = {
  paper: '#f7f1e3', paper2: '#efe6d2', ink: '#4a3b2f', ink2: '#6e5b4a',
  olive: '#7d8a5a', sage: '#a7b28a', moss: '#5f6e45', rose: '#c98f8a', rose2: '#e3b9b2',
  sand: '#d8bf95', acorn: '#a26f45', acornDark: '#7a4f2e', cap: '#8c6a43', berry: '#4f5f86', berry2: '#7c8db5',
  carrot: '#e0915a', red: '#c9675b',
}

// One <defs> block per document: watercolour filters
export const filters = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <filter id="wc" x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="3" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="5" xChannelSelector="R" yChannelSelector="G" result="wob"/>
    <!-- pigment: gentle, low-frequency variation instead of grain -->
    <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="8" result="pig"/>
    <feColorMatrix in="pig" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -.55 1.12" result="pigA"/>
    <feComposite in="wob" in2="pigA" operator="in" result="tex"/>
    <!-- darker rim where the paint dried at the edge -->
    <feMorphology in="wob" operator="erode" radius="1.3" result="er"/>
    <feComposite in="wob" in2="er" operator="out" result="rim"/>
    <feColorMatrix in="rim" type="matrix" values=".72 0 0 0 0  0 .72 0 0 0  0 0 .72 0 0  0 0 0 .55 0" result="rimD"/>
    <feGaussianBlur in="rimD" stdDeviation=".45" result="rimB"/>
    <feMerge><feMergeNode in="tex"/><feMergeNode in="rimB"/></feMerge>
  </filter>
  <filter id="wcSoft" x="-30%" y="-30%" width="160%" height="160%">
    <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="2" seed="11" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="9" xChannelSelector="R" yChannelSelector="G" result="wob"/>
    <feGaussianBlur in="wob" stdDeviation="1.6"/>
  </filter>
  <filter id="ink" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="5" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="1.6" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</defs></svg>`

const P = palette
const wrap = (vb, body, cls = '') => `<svg class="art ${cls}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`

// ── building blocks (return SVG fragments in local coordinates) ──
function oakLeaf(x, y, s, rot, fill = P.sage, vein = P.moss) {
  // lobed oak leaf ~ 60 x 100 units at s=1, stem at (0,0) pointing down
  const d = 'M0 0 C-3 -8 -10 -10 -14 -16 C-22 -14 -26 -20 -20 -27 C-27 -31 -27 -39 -19 -41 C-25 -48 -22 -57 -13 -56 C-15 -66 -8 -72 -2 -66 C0 -76 6 -78 8 -70 C14 -76 22 -70 17 -62 C26 -62 28 -53 20 -49 C28 -45 26 -36 18 -35 C24 -29 20 -21 12 -23 C10 -16 5 -9 0 0 Z'
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <path d="${d}" fill="${fill}" opacity=".85" filter="url(#wc)"/>
    <path d="${d}" fill="none" stroke="${vein}" stroke-width="1" opacity=".35" filter="url(#ink)"/>
    <path d="M0 0 C1 -20 2 -45 3 -66 M1.5 -30 L-12 -38 M2 -42 L14 -50 M1 -20 L10 -27 M2.5 -55 L-8 -60" fill="none" stroke="${vein}" stroke-width=".9" opacity=".45" filter="url(#ink)"/>
  </g>`
}
function acorn(x, y, s, rot = 0, face = false) {
  // nut: golden, egg-shaped with a small pointed tip; cap: scaly dome with a rim and a stem
  const scales = []
  for (let r = 0; r < 4; r++) {
    const yy = -8 + r * 4.2, half = 13 + r * 2.4, n = 5 + r
    for (let i = 0; i < n; i++) {
      const xx = -half + (i + .5) * (2 * half / n) + (r % 2 ? 1.2 : -1.2)
      scales.push(`<path d="M${(xx - 2.6).toFixed(1)} ${yy.toFixed(1)} q2.6 3.4 5.2 0" />`)
    }
  }
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <path d="M-16.5 8 C-17.5 23 -11 37 -1.6 44.5 Q0 47.5 1.6 44.5 C11 37 17.5 23 16.5 8 Z" fill="#c9965a" filter="url(#wc)"/>
    <path d="M9 14 C11 24 8 33 2 40" stroke="#9a6a3a" stroke-width="3.2" opacity=".45" fill="none" stroke-linecap="round" filter="url(#wcSoft)"/>
    <path d="M-9 14 C-10.5 22 -8.5 29 -5 34" stroke="#f2d3a2" stroke-width="4.5" opacity=".75" fill="none" stroke-linecap="round" filter="url(#wcSoft)"/>
    <path d="M-1.2 45.5 L0 49 L1.2 45.5" fill="#7a4f2e" opacity=".8"/>
    <path d="M-22 10.5 C-23 -3 -12.5 -12 0 -12 C12.5 -12 23 -3 22 10.5 C14 13.5 -14 13.5 -22 10.5 Z" fill="#9b7448" filter="url(#wc)"/>
    <g fill="none" stroke="#6b4b2c" stroke-width="1" opacity=".6" filter="url(#ink)">${scales.join('')}</g>
    <path d="M-22 10.5 C-14 14 14 14 22 10.5" stroke="#5f4126" stroke-width="1.6" fill="none" opacity=".55" filter="url(#ink)"/>
    <path d="M-14 -4 C-9 -9 -3 -10.5 3 -10.5" stroke="#c8a275" stroke-width="2.6" opacity=".55" fill="none" stroke-linecap="round" filter="url(#wcSoft)"/>
    <path d="M0.5 -12 C1 -16.5 3.2 -19.5 6.6 -21" stroke="#5f4126" stroke-width="2.6" stroke-linecap="round" fill="none" filter="url(#ink)"/>
    ${face ? `<ellipse cx="-6" cy="25" rx="1.9" ry="2.3" fill="${P.ink}"/><ellipse cx="6" cy="25" rx="1.9" ry="2.3" fill="${P.ink}"/>
      <circle cx="-5.4" cy="24.2" r=".6" fill="#fff" opacity=".9"/><circle cx="6.6" cy="24.2" r=".6" fill="#fff" opacity=".9"/>
      <path d="M-3.4 30.5 Q0 33.4 3.4 30.5" stroke="${P.ink}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <ellipse cx="-10.5" cy="30" rx="3" ry="1.9" fill="${P.rose}" opacity=".55"/><ellipse cx="10.5" cy="30" rx="3" ry="1.9" fill="${P.rose}" opacity=".55"/>` : ''}
  </g>`
}
function twig(d, w = 2.2) {
  return `<path d="${d}" fill="none" stroke="${P.ink2}" stroke-width="${w}" stroke-linecap="round" opacity=".75" filter="url(#ink)"/>`
}
function berry(x, y, r, c = P.berry, hi = P.berry2) {
  return `<g><circle cx="${x}" cy="${y}" r="${r}" fill="${c}" filter="url(#wc)"/><circle cx="${x - r * .35}" cy="${y - r * .35}" r="${r * .35}" fill="${hi}" opacity=".7" filter="url(#wcSoft)"/>
    <path d="M${x - r * .25} ${y + r * .1} l${r * .25} -${r * .2} l${r * .25} ${r * .2}" stroke="${P.ink}" stroke-width=".7" opacity=".45" fill="none"/></g>`
}
function smallLeaf(x, y, s, rot, fill = P.olive) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0 0 C-9 -10 -8 -26 0 -34 C8 -26 9 -10 0 0 Z" fill="${fill}" opacity=".85" filter="url(#wc)"/>
    <path d="M0 -1 L0 -30" stroke="${P.moss}" stroke-width=".9" opacity=".5" filter="url(#ink)"/></g>`
}

// ── finished illustrations ──
function wreathSvg(full) {
  return wrap('-165 -165 330 330', (() => {
    const out = [], R = 122
    // leaves follow the ring (tangent), alternating a little in/out; small gap at the bottom for acorns and berries
    for (let i = 0; i < 22; i++) {
      const deg = 112 + i * 14.6, a = deg * Math.PI / 180
      const x = Math.cos(a) * R, y = Math.sin(a) * R
      if (!full && deg % 360 > 25 && deg % 360 < 160) continue
      const tilt = i % 2 ? 28 : -28
      out.push(i % 3 === 2 ? smallLeaf(x, y, .95, deg + 180 + tilt, i % 2 ? P.olive : P.sage) : oakLeaf(x, y, .5 + (i % 4) * .04, deg + 180 + tilt, i % 2 ? '#b9c29b' : P.sage))
    }
    if (full) out.push(acorn(-34, 112, .62, -28), acorn(-20, 122, .5, 8), acorn(34, 110, .58, 26))
    if (full) out.push(berry(2, 126, 7, P.rose, P.rose2), berry(13, 120, 6, P.rose, P.rose2), berry(-8, 119, 5.5, P.rose, P.rose2))
    return out.join('')
  })())
}

export const art = {
  acornHero: () => wrap('-60 -60 120 130', `
    ${oakLeaf(-8, 30, .78, -38)}${oakLeaf(10, 32, .7, 32, '#b9c29b')}
    ${acorn(0, 4, 1.35, -6, true)}`),

  oakSprig: () => wrap('0 0 240 150', `
    ${twig('M10 140 C60 120 110 96 150 70 C180 50 205 32 232 18')}
    ${twig('M118 90 C112 70 112 56 118 42', 1.6)}${twig('M170 58 C182 64 192 76 196 92', 1.6)}
    ${oakLeaf(60, 118, .8, -60)}${oakLeaf(96, 100, .9, -20, '#b9c29b')}${oakLeaf(150, 70, .75, 40)}
    ${oakLeaf(206, 30, .65, -70, '#b9c29b')}${oakLeaf(120, 48, .55, -5)}
    ${acorn(196, 92, .62, -18)}${acorn(214, 102, .52, 20)}`),

  berries: () => wrap('0 0 170 170', `
    ${twig('M20 160 C50 120 80 90 140 30')}${twig('M70 104 C88 100 104 104 116 116', 1.4)}${twig('M98 70 C96 56 98 44 106 34', 1.4)}
    ${smallLeaf(46, 132, 1.1, -70)}${smallLeaf(84, 96, 1, 40, P.sage)}${smallLeaf(124, 48, .9, -50)}${smallLeaf(140, 30, .8, 30, P.sage)}
    ${berry(118, 120, 9)}${berry(131, 113, 8)}${berry(122, 132, 7.5)}${berry(106, 30, 7)}${berry(96, 36, 6.5)}`),

  strawberry: () => wrap('0 0 140 150', `
    ${twig('M70 18 C66 10 70 4 78 2', 1.6)}
    <path d="M70 24 C40 24 26 50 34 80 C42 110 62 136 70 140 C78 136 98 110 106 80 C114 50 100 24 70 24 Z" fill="${P.red}" filter="url(#wc)"/>
    <path d="M52 44 C46 60 46 80 54 100" stroke="#e6a097" stroke-width="7" opacity=".5" fill="none" filter="url(#wcSoft)"/>
    ${[[56, 50], [76, 46], [92, 60], [60, 72], [82, 74], [70, 96], [52, 92], [90, 92], [72, 118]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.6" ry="2.4" fill="#f3d9a2" opacity=".9"/>`).join('')}
    ${smallLeaf(70, 28, .7, -70)}${smallLeaf(70, 28, .7, 70, P.sage)}${smallLeaf(70, 28, .6, -20)}${smallLeaf(70, 28, .6, 25, P.sage)}`),

  carrot: () => wrap('0 0 120 190', `
    <path d="M60 52 C44 52 40 66 44 84 C50 116 56 150 60 182 C64 150 70 116 76 84 C80 66 76 52 60 52 Z" fill="${P.carrot}" filter="url(#wc)"/>
    <path d="M50 74 l8 2 M66 96 l8 -2 M52 112 l7 2 M64 132 l6 -1 M58 154 l4 1" stroke="${P.acornDark}" stroke-width="1.1" opacity=".45" filter="url(#ink)"/>
    ${smallLeaf(60, 54, 1.25, -28, P.olive)}${smallLeaf(60, 54, 1.35, 8, P.sage)}${smallLeaf(60, 54, 1.15, 38, P.olive)}`),

  mushroom: () => wrap('0 0 140 140', `
    <path d="M54 66 C50 88 48 106 50 122 C62 129 80 129 92 122 C94 106 92 88 86 66 Z" fill="#efe2c8" filter="url(#wc)"/>
    <path d="M58 76 C56 94 56 108 57 120" stroke="#d6c09b" stroke-width="5" opacity=".55" fill="none" filter="url(#wcSoft)"/>
    <path d="M16 72 C18 40 44 22 70 22 C96 22 122 40 124 72 C100 80 40 80 16 72 Z" fill="${P.acorn}" filter="url(#wc)"/>
    <path d="M32 52 C44 38 60 32 78 32" stroke="#c89466" stroke-width="7" opacity=".55" fill="none" filter="url(#wcSoft)"/>
    ${smallLeaf(28, 126, .8, -70)}${smallLeaf(112, 128, .7, 65, P.sage)}`),

  wheat: () => wrap('0 0 90 200', `
    ${twig('M45 196 C46 150 46 100 45 40', 1.8)}
    ${[0, 1, 2, 3, 4, 5].map(i => { const y = 50 + i * 22; return `<ellipse cx="35" cy="${y}" rx="7" ry="12" transform="rotate(-30 35 ${y})" fill="${P.sand}" filter="url(#wc)"/><ellipse cx="55" cy="${y + 10}" rx="7" ry="12" transform="rotate(30 55 ${y + 10})" fill="#e2cda6" filter="url(#wc)"/>` }).join('')}
    <ellipse cx="45" cy="34" rx="6" ry="11" fill="${P.sand}" filter="url(#wc)"/>`),

  apple: () => wrap('0 0 130 140', `
    <path d="M65 36 C48 22 18 30 18 66 C18 100 44 128 65 122 C86 128 112 100 112 66 C112 30 82 22 65 36 Z" fill="${P.red}" filter="url(#wc)"/>
    <path d="M36 58 C34 76 40 94 52 106" stroke="#e7a49a" stroke-width="8" opacity=".55" fill="none" filter="url(#wcSoft)"/>
    ${twig('M65 36 C64 26 66 18 71 12', 2)}${smallLeaf(70, 22, 1, 60)}`),

  wreath: () => wreathSvg(true),
  // same ring without acorns, berries or the lowest leaves: sits behind the author's photo, which fades out at the bottom
  wreathOpen: () => wreathSvg(false),

  divider: () => wrap('0 0 260 30', `
    ${twig('M10 15 C60 10 100 20 130 15 C160 10 200 20 250 15', 1.3)}
    ${smallLeaf(70, 14, .45, -70)}${smallLeaf(90, 16, .42, 110, P.sage)}${smallLeaf(170, 14, .45, 70)}${smallLeaf(190, 16, .42, -110, P.sage)}
    ${acorn(130, 4, .38, 0)}`),
}

// small line icons for recipe tags (16 x 16, currentColor)
const L = (d, extra = '') => `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">${d}</g>${extra}</svg>`
export const icons = {
  veg: L('<path d="M9.5 6.5 L3 13 L9.5 9.8 C11 9 11.5 7.5 9.5 6.5 Z"/><path d="M10 6 C10.5 4 12 3 13.5 3 M10.5 6.5 C12 6 13 6.5 13.8 7.5 M9.8 5.8 C9.5 4.5 10 3.2 11 2.4"/>'),
  freeze: L('<path d="M8 1.8 V14.2 M2.6 4.9 L13.4 11.1 M2.6 11.1 L13.4 4.9 M6.5 2.8 L8 4.2 L9.5 2.8 M6.5 13.2 L8 11.8 L9.5 13.2"/>'),
  family: L('<circle cx="5" cy="5" r="1.8"/><circle cx="11" cy="5" r="1.8"/><circle cx="8" cy="8.6" r="1.4"/><path d="M1.8 13.5 C2 10.8 3.3 9.4 5 9.4 C5.8 9.4 6.4 9.7 6.9 10.2 M14.2 13.5 C14 10.8 12.7 9.4 11 9.4 C10.2 9.4 9.6 9.7 9.1 10.2 M5.6 14 C5.8 12.3 6.7 11.4 8 11.4 C9.3 11.4 10.2 12.3 10.4 14"/>'),
  baby: L('<path d="M6 5 H10 V13 C10 14 9.3 14.5 8 14.5 C6.7 14.5 6 14 6 13 Z M6.6 5 V3.6 H9.4 V5 M8 3.6 V1.8 M6 8 H7.6 M6 10.5 H7.6"/>'),
  quick: L('<circle cx="8" cy="8.6" r="5.6"/><path d="M8 5.6 V8.8 L10.2 10.2 M6.6 1.6 H9.4"/>'),
  lunch: L('<rect x="2" y="5.5" width="12" height="8" rx="1.6"/><path d="M6 5.5 V4.2 C6 3.5 6.5 3 7.2 3 H8.8 C9.5 3 10 3.5 10 4.2 V5.5 M2 8.8 H14 M8 8.8 V13.5"/>'),
  breakfast: L('<path d="M3.5 9.5 H12.5 C12.5 12 10.5 13.8 8 13.8 C5.5 13.8 3.5 12 3.5 9.5 Z M12.5 10.3 C13.8 10.3 14.4 9.6 14.2 8.8 C14 8.1 13.2 8 12.6 8.4"/><path d="M6 7 C5.4 6 6.6 5.2 6 4.2 M9 7 C8.4 6 9.6 5.2 9 4.2"/>'),
  nobake: L('<path d="M3 13 C3 7 7 3 13 3 C13 9 9 13 3 13 Z M3 13 L9.5 6.5"/>'),
  party: L('<path d="M2.5 14 H13.5 M3.5 14 V9.5 H12.5 V14 M3.5 11.6 C5 12.6 6.5 10.6 8 11.6 C9.5 12.6 11 10.6 12.5 11.6 M8 9.5 V6.6"/><path d="M8 3 C7.2 4 7.2 5 8 5.6 C8.8 5 8.8 4 8 3 Z"/>'),
  portions: L('<path d="M2 8 H14 C14 11.3 11.3 14 8 14 C4.7 14 2 11.3 2 8 Z M5.5 5.8 C5 4.8 6 4 5.5 3 M8 5.8 C7.5 4.8 8.5 4 8 3 M10.5 5.8 C10 4.8 11 4 10.5 3"/>'),
  acorn: `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.4 7.4 C4.2 10.6 6 13.4 7.6 14.6 Q8 15.2 8.4 14.6 C10 13.4 11.8 10.6 11.6 7.4 Z" fill="#c9965a"/><path d="M3 7.8 C2.8 4.6 5.2 3.2 8 3.2 C10.8 3.2 13.2 4.6 13 7.8 C10.8 8.6 5.2 8.6 3 7.8 Z" fill="#9b7448"/><path d="M4.6 5.6 q.9 1 1.8 0 M7.1 5.4 q.9 1 1.8 0 M9.6 5.6 q.9 1 1.8 0" stroke="#6b4b2c" stroke-width=".7" fill="none"/><path d="M8.2 3.2 C8.4 2.2 9 1.6 9.8 1.3" stroke="#5f4126" stroke-width="1.1" stroke-linecap="round" fill="none"/></svg>`,
}
