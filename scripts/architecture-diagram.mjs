// The architecture diagrams in the repo root, drawn in Excalidraw's hand-drawn style:
// rough.js strokes, the Virgil font (OFL, scripts/diagram/Virgil-LICENSE.md, embedded in the SVG
// so GitHub shows it) and simple-icons logos. Squid has no logo there, so it is a small doodle.
//
//   node scripts/architecture-diagram.mjs   ->   architecture.svg (isolation on), architecture-off.svg
//
// Change the drawing here when containers, networks or ports change (docker-compose.yml,
// docker-compose.egress.yml), then run it again and commit both SVGs.
import fs from 'node:fs'
import rough from 'roughjs'
import * as si from 'simple-icons'

const gen = rough.generator()
const font = fs.readFileSync(new URL('./diagram/Virgil.woff2', import.meta.url)).toString('base64')
let seed = 7
const nextSeed = () => (seed = (seed * 9301 + 49297) % 233280) + 1

const C = {
  ink: '#1e1e1e', muted: '#5c5c5c',
  inside: '#1971c2', insideFill: '#a5d8ff',
  app: '#e8590c', appFill: '#ffd8a8',
  upd: '#7048e8', updFill: '#d0bfff',
  net: '#2f9e44', netFill: '#b2f2bb',
  red: '#e03131', box: '#ffffff', note: '#fff3bf',
}

function Canvas(w, h) {
  const out = []
  const rd = (drawable) => {
    for (const p of gen.toPaths(drawable)) {
      out.push(`<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="${p.fill ?? 'none'}"${drawable.options.strokeLineDash ? ` stroke-dasharray="${drawable.options.strokeLineDash.join(' ')}"` : ''} stroke-linecap="round" stroke-linejoin="round"/>`)
    }
  }
  const base = o => ({ roughness: 1.2, bowing: 1, strokeWidth: 1.6, stroke: C.ink, seed: nextSeed(), fillWeight: 1, hachureGap: 7, ...o })
  const api = {
    rect(x, y, w, h, o = {}) {
      const r = o.r ?? 14
      const d = `M${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} L${x + r},${y + h} Q${x},${y + h} ${x},${y + h - r} L${x},${y + r} Q${x},${y} ${x + r},${y} Z`
      rd(gen.path(d, base(o)))
    },
    path(d, o = {}) { rd(gen.path(d, base(o))) },
    line(x1, y1, x2, y2, o = {}) { rd(gen.line(x1, y1, x2, y2, base(o))) },
    curve(pts, o = {}) { rd(gen.curve(pts, base(o))) },
    ellipse(cx, cy, w, h, o = {}) { rd(gen.ellipse(cx, cy, w, h, base(o))) },
    arrow(pts, o = {}) {
      const p = pts.length === 2 ? pts : pts
      if (p.length === 2) api.line(p[0][0], p[0][1], p[1][0], p[1][1], o)
      else api.curve(p, o)
      const heads = o.both ? [[p[p.length - 2], p[p.length - 1]], [p[1], p[0]]] : [[p[p.length - 2], p[p.length - 1]]]
      for (const [[ax, ay], [bx, by]] of heads) {
        const a = Math.atan2(by - ay, bx - ax), L = 13
        for (const s of [-0.45, 0.45]) api.line(bx, by, bx - L * Math.cos(a + s), by - L * Math.sin(a + s), { ...o, strokeLineDash: undefined, roughness: 0.8 })
      }
    },
    text(x, y, s, o = {}) {
      const size = o.size ?? 18, anchor = o.anchor ?? 'start'
      const lines = String(s).split('\n')
      lines.forEach((l, i) => out.push(`<text x="${x}" y="${y + i * size * 1.25}" font-family="Virgil, 'Comic Sans MS', cursive" font-size="${size}" fill="${o.color ?? C.ink}" text-anchor="${anchor}" stroke="${o.halo ?? '#ffffff'}" stroke-width="${o.haloW ?? 6}" paint-order="stroke" stroke-linejoin="round"${o.bold ? ' font-weight="bold"' : ''}>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`))
    },
    logo(name, x, y, size = 30, color) {
      const ic = si[name]
      out.push(`<g transform="translate(${x},${y}) scale(${size / 24})"><path d="${ic.path}" fill="#${color ?? ic.hex}"/></g>`)
    },
    raw(s) { out.push(s) },
    svg() {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><style>@font-face{font-family:Virgil;src:url(data:font/woff2;base64,${font}) format("woff2")}</style></defs>
<rect width="${w}" height="${h}" fill="#ffffff"/>
${out.join('\n')}
</svg>`
    },
  }
  return api
}

// ---- doodles ----
function squid(c, x, y, s = 1) {
  // a little squid: pointed mantle, eyes, wavy tentacles
  const k = v => v * s
  c.curve([[x + k(0), y + k(26)], [x + k(4), y + k(6)], [x + k(14), y - k(4)], [x + k(24), y + k(6)], [x + k(28), y + k(26)]], { stroke: '#c2255c', fill: '#fcc2d7', fillStyle: 'solid' })
  c.line(x, y + k(26), x + k(28), y + k(26), { stroke: '#c2255c' })
  c.ellipse(x + k(9), y + k(18), k(4), k(4), { fill: C.ink, fillStyle: 'solid', roughness: 0.3 })
  c.ellipse(x + k(19), y + k(18), k(4), k(4), { fill: C.ink, fillStyle: 'solid', roughness: 0.3 })
  for (let i = 0; i < 5; i++) {
    const tx = x + k(3 + i * 5.5)
    c.curve([[tx, y + k(26)], [tx - k(3), y + k(33)], [tx + k(2), y + k(39)], [tx - k(1), y + k(45)]], { stroke: '#c2255c', roughness: 0.6 })
  }
}
function bank(c, x, y, s = 1) {
  const k = v => v * s
  c.line(x, y + k(12), x + k(15), y, { strokeWidth: 1.4 }); c.line(x + k(15), y, x + k(30), y + k(12), { strokeWidth: 1.4 })
  c.line(x, y + k(12), x + k(30), y + k(12), { strokeWidth: 1.4 })
  for (let i = 0; i < 4; i++) c.line(x + k(4 + i * 7.3), y + k(15), x + k(4 + i * 7.3), y + k(28), { strokeWidth: 1.4, roughness: 0.6 })
  c.line(x - k(2), y + k(31), x + k(32), y + k(31), { strokeWidth: 1.4 })
}
function laptop(c, x, y) {
  c.rect(x + 6, y, 52, 34, { r: 4, fill: '#e7f5ff', fillStyle: 'solid' })
  c.line(x, y + 40, x + 64, y + 40); c.line(x + 6, y + 34, x, y + 40); c.line(x + 58, y + 34, x + 64, y + 40)
}
function phone(c, x, y) {
  c.rect(x, y, 30, 52, { r: 6, fill: '#e7f5ff', fillStyle: 'solid' })
  c.line(x + 11, y + 46, x + 19, y + 46, { roughness: 0.4 })
}
function cylinder(c, x, y, w, h, label, sub) {
  c.ellipse(x + w / 2, y, w, 16, { fill: '#f1f3f5', fillStyle: 'solid' })
  c.line(x, y, x, y + h); c.line(x + w, y, x + w, y + h)
  c.curve([[x, y + h], [x + w / 2, y + h + 8], [x + w, y + h]])
  c.text(x + w / 2, y + 28, label, { size: 15, anchor: 'middle' })
  if (sub) c.text(x + w / 2, y + 46, sub, { size: 12, anchor: 'middle', color: C.muted })
}
function cloud(c, x, y, w, h) {
  // scalloped outline: small arcs bulging outwards along an ellipse
  const n = 12, cx = x + w / 2, cy = y + h / 2
  const pt = a => [cx + (w / 2) * 0.92 * Math.cos(a), cy + (h / 2) * 0.92 * Math.sin(a)]
  let d = ''
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1)
    const qx = cx + (w / 2) * 1.12 * Math.cos(am), qy = cy + (h / 2) * 1.12 * Math.sin(am)
    d += (i ? '' : `M${x0},${y0} `) + `Q${qx},${qy} ${x1},${y1} `
  }
  c.path(d + 'Z', { fill: '#f8f9fa', fillStyle: 'solid', strokeWidth: 1.8 })
}

// a container card: name, logos, a line or two
function box(c, x, y, w, h, o) {
  c.rect(x, y, w, h, { fill: o.fill ?? C.box, fillStyle: 'solid', strokeWidth: 2, strokeLineDash: o.dashed ? [8, 6] : undefined })
  let lx = x + 14
  for (const l of o.logos ?? []) {
    if (l === 'squid') { squid(c, lx, y + 10, 0.8); lx += 30 } else { c.logo(l, lx, y + 13, 26); lx += 34 }
  }
  c.text(lx + 4, y + 34, o.name, { size: 20, bold: true })
  if (o.lines) c.text(x + 14, y + 64, o.lines, { size: 14, color: C.muted })
}

function legend(c, x, y, rows) {
  rows.forEach(([color, label, dashed], i) => {
    c.line(x, y + i * 26, x + 44, y + i * 26, { stroke: color, strokeWidth: 3, strokeLineDash: dashed ? [8, 6] : undefined, roughness: 0.6 })
    c.text(x + 54, y + i * 26 + 5, label, { size: 15 })
  })
}

// ================= A: network zones (isolation on / off) =================
const INK = { inside: '#1864ab', app: '#b03d06', upd: '#5f3dc4', net: '#2b8a3e', red: '#c92a2a' }
function zones(on) {
  seed = 11
  const c = Canvas(1700, 1060)
  c.text(40, 56, `Tazrim: containers and networks (network isolation ${on ? 'on' : 'off'})`, { size: 30, bold: true })

  // devices
  c.text(40, 130, 'Your devices', { size: 18, color: C.muted })
  laptop(c, 50, 170); c.text(40, 240, 'this computer\nlocalhost:3000', { size: 15 })
  phone(c, 64, 330); c.text(40, 410, 'phone, home Wi-Fi\n<ip>:3001', { size: 15 })
  phone(c, 64, 520); c.text(40, 600, 'phone with passkeys\nhttps://tazrim.internal', { size: 15 })

  // Docker = the default network (has internet)
  c.rect(230, 100, 1060, 920, { stroke: C.net, fill: C.netFill, fillStyle: 'hachure', hachureGap: 14, strokeWidth: 2.2 })
  c.logo('siDocker', 248, 112, 30)
  c.text(288, 134, 'Docker on this computer: the "default" network can reach the internet', { size: 18, color: INK.net, haloW: 9 })

  // volumes (both)
  cylinder(c, 500, 860, 150, 60, 'tazrim-data', 'tazrim.db (SQLite)')
  cylinder(c, 700, 860, 170, 60, 'install folder', on ? '.env · egress/ · keys' : '.env')
  c.text(905, 890, 'docker.sock', { size: 16 })


  // internet
  cloud(c, 1330, 300, 340, 420)
  c.text(1500, 360, 'internet', { size: 21, anchor: 'middle', bold: true })
  bank(c, 1380, 400, 1.2); c.text(1430, 428, '18 bank and\ncard sites', { size: 16 })
  c.logo('siGithub', 1384, 500, 30); c.text(1430, 522, 'api.github.com', { size: 16 })

  if (on) {
    c.rect(470, 170, 400, 600, { stroke: C.inside, fill: '#e7f5ff', fillStyle: 'solid', strokeWidth: 2.2, strokeLineDash: [10, 6] })
    c.text(486, 200, '"inside" (internal: no internet)', { size: 17, color: INK.inside, halo: '#e7f5ff' })
    c.rect(700, 250, 420, 170, { stroke: C.app, fill: '#fff4e6', fillStyle: 'solid', strokeWidth: 2.2, strokeLineDash: [10, 6] })
    c.text(1104, 278, '"app-net" (internal)', { size: 17, color: INK.app, halo: '#fff4e6', anchor: 'end' })
    c.rect(700, 540, 420, 180, { stroke: C.upd, fill: '#f3f0ff', fillStyle: 'solid', strokeWidth: 2.2, strokeLineDash: [10, 6] })
    c.text(1104, 706, '"updater-net" (internal)', { size: 17, color: INK.upd, halo: '#f3f0ff', anchor: 'end' })

    box(c, 270, 420, 250, 96, { name: 'caddy', logos: ['siCaddy'], lines: 'optional: HTTPS for\ntazrim.internal', dashed: true })
    box(c, 270, 610, 250, 96, { name: 'adguard', logos: ['siAdguard'], lines: 'optional: answers the\n.internal names', dashed: true })
    box(c, 270, 230, 250, 96, { name: 'gateway', logos: ['siNodedotjs'], lines: 'publishes :3000 and :3001\nforwards them to the app' })
    box(c, 600, 290, 230, 112, { name: 'tazrim', logos: ['siNextdotjs', 'siSqlite', 'siGooglechrome'], lines: 'the app · bank sync\nin headless Chrome · vault' })
    box(c, 600, 570, 230, 112, { name: 'updater', logos: ['siNodedotjs', 'siDocker'], lines: 'updates · settings\napproves allowlist changes' })
    box(c, 1010, 420, 250, 112, { name: 'squid', logos: ['squid'], lines: 'proxy with an allowlist\nlogs every site asked for' })

    c.arrow([[120, 190], [270, 270]]); c.arrow([[100, 355], [270, 290]]); c.arrow([[100, 545], [270, 460]])
    c.arrow([[520, 278], [600, 330]], { stroke: C.inside, strokeWidth: 2.4 })
    c.arrow([[520, 468], [600, 360]], { stroke: C.inside, strokeWidth: 2.4 })
    c.arrow([[830, 346], [1010, 460]], { stroke: C.app, strokeWidth: 2.6 })
    c.arrow([[830, 626], [1010, 500]], { stroke: C.upd, strokeWidth: 2.6 })
    c.text(1384, 610, '✗ anything else', { size: 17, color: INK.red })
    c.arrow([[1260, 455], [1380, 420]], { stroke: C.app, strokeWidth: 2.6 })
    c.arrow([[1260, 495], [1380, 512]], { stroke: C.upd, strokeWidth: 2.6 })
    c.arrow([[1260, 515], [1378, 598]], { stroke: C.red, strokeWidth: 2, strokeLineDash: [6, 6] })
    legend(c, 1330, 790, [[C.app, 'app → banks only'], [C.upd, 'updater → GitHub only'], [C.inside, 'requests from your devices'], [C.red, 'refused by Squid', true]])
  } else {
    box(c, 270, 420, 250, 96, { name: 'caddy', logos: ['siCaddy'], lines: 'optional: HTTPS for\ntazrim.internal', dashed: true })
    box(c, 270, 610, 250, 96, { name: 'adguard', logos: ['siAdguard'], lines: 'optional: answers the\n.internal names', dashed: true })
    box(c, 580, 260, 260, 120, { name: 'tazrim', logos: ['siNextdotjs', 'siSqlite', 'siGooglechrome'], lines: 'the app · bank sync\nin headless Chrome · vault\npublishes :3000 and :3001' })
    box(c, 580, 560, 260, 112, { name: 'updater', logos: ['siNodedotjs', 'siDocker'], lines: 'updates · settings\nturns isolation on' })

    c.arrow([[120, 190], [580, 300]]); c.arrow([[100, 355], [580, 330]]); c.arrow([[100, 545], [270, 460]])
    c.arrow([[520, 468], [580, 360]], { stroke: C.inside, strokeWidth: 2.4 })
    c.text(1384, 610, '⚠ any other site', { size: 17, color: INK.red })
    c.arrow([[840, 300], [1380, 420]], { stroke: C.app, strokeWidth: 2.6 })
    c.arrow([[840, 340], [1378, 598]], { stroke: C.red, strokeWidth: 2.4, strokeLineDash: [6, 6] })
    c.arrow([[840, 600], [1380, 512]], { stroke: C.upd, strokeWidth: 2.6 })
    c.arrow([[840, 630], [1378, 608]], { stroke: C.red, strokeWidth: 2.4, strokeLineDash: [6, 6] })

    c.rect(1000, 745, 280, 150, { fill: C.note, fillStyle: 'solid', strokeWidth: 1.6, r: 6 })
    c.text(1014, 776, 'Every container is on\nDocker\'s default network,\nwith internet. Bad code in\nthe app could send the\nbank logins anywhere.', { size: 16, halo: C.note })
    legend(c, 1330, 790, [[C.app, 'app → banks (and anything)'], [C.upd, 'updater → GitHub (and anything)'], [C.inside, 'requests from your devices'], [C.red, 'nothing stops these', true]])
    c.text(1330, 920, 'Turn on: Settings → בידוד רשת', { size: 16, color: INK.net })
  }

  // volume lines
  const up = on ? [600, 682] : [580, 672]
  c.arrow(on ? [[615, 402], [574, 520], [562, 700], [560, 850]] : [[598, 380], [556, 520], [548, 700], [560, 850]], { stroke: C.muted, strokeWidth: 1.3 })
  c.arrow([[up[0] + 115, up[1]], [600, 850]], { stroke: C.muted, strokeWidth: 1.3 })
  c.arrow([[up[0] + 140, up[1]], [780, 850]], { stroke: C.muted, strokeWidth: 1.3 })
  c.arrow([[up[0] + 190, up[1]], [930, 870]], { stroke: C.muted, strokeWidth: 1.3 })
  c.text(1330, on ? 920 : 950, 'dashed box = optional', { size: 15, color: C.muted })
  return c.svg()
}

const root = new URL('../', import.meta.url)
fs.writeFileSync(new URL('architecture.svg', root), zones(true))
fs.writeFileSync(new URL('architecture-off.svg', root), zones(false))
console.log('wrote architecture.svg and architecture-off.svg')
