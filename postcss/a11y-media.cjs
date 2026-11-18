/*
 * Settings → Accessibility (ENG-128): the switches "Stop animations" and "High contrast" must
 * behave exactly like the system settings they mirror. So every @media block that asks for
 *
 *   prefers-reduced-motion: reduce        -> also applies under  html.a11y-still
 *   prefers-contrast: more                -> also applies under  html.a11y-contrast
 *   prefers-reduced-transparency: reduce  -> also applies under  html.a11y-contrast
 *
 * gets a copy right after it, with every selector scoped to that class. This covers the
 * hand-written blocks in app/globals.css and everything Tailwind generates (`motion-reduce:`
 * variants, arbitrary `[@media(prefers-reduced-transparency:reduce)]:` variants).
 *
 * Details:
 *  - The class is added with :where(), which has no specificity, so the copy ranks exactly as the
 *    media block did and source order (the copy comes right after) decides, as before.
 *  - A selector whose first compound already targets <html> (`:root`, `html`, `.dark` as next-themes
 *    puts it, or one of the attributes the app sets on <html>) gets the class on that compound
 *    (`html.dark` -> `html.dark:where(.a11y-x)`); any other gets a prefix
 *    (`.foo` -> `:where(:root.a11y-x) .foo`).
 *  - Other conditions joined with `and` stay, in a new @media around the copy; in a comma list each
 *    query that matches is handled.
 *  - @keyframes / @font-face inside the block are hoisted unchanged (they are not selectors).
 */
const FEATURES = [
  { re: /^\(prefers-reduced-motion:reduce\)$/i, cls: 'a11y-still' },
  { re: /^\(prefers-contrast:more\)$/i, cls: 'a11y-contrast' },
  { re: /^\(prefers-reduced-transparency:reduce\)$/i, cls: 'a11y-contrast' },
]

// Attributes (and the class) the app puts on <html>: lib/background/setting.ts, components/layout/privacy.tsx, lib/utils/theme-fade.ts
const ROOT_ATTRIBUTES = ['data-bg', 'data-bg-palette', 'data-privacy', 'data-privacy-switch', 'data-theme-fade']
const ROOT_COMPOUND = new RegExp(
  `^(?::root(?![\\w-])|html(?![\\w-])|\\.dark(?![\\w\\\\-])|\\[(?:${ROOT_ATTRIBUTES.join('|')})(?:[~|^$*]?=|\\]))`
)

/** Split a media query list on its top-level commas */
function splitTop(text, sep) {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of text) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === sep && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

/** One query -> the parts joined by `and` */
function andParts(query) {
  return query
    .trim()
    .split(/\s+and\s+|(?<=\))and(?=\()|(?<=\))\s+and(?=\()|(?<=\))and\s+(?=\()/i)
    .map(p => p.trim())
    .filter(Boolean)
}

/** The classes a media params string asks for: { cls, rest } per matching query ('' rest: nothing else needed) */
function matchQueries(params) {
  const found = []
  for (const query of splitTop(params, ',')) {
    const parts = andParts(query)
    const hits = parts.filter(p => FEATURES.some(f => f.re.test(p.replace(/\s+/g, ''))))
    // `not ...` and queries with several of these features are not handled
    if (hits.length !== 1 || /^not\b/i.test(query.trim())) continue
    const cls = FEATURES.find(f => f.re.test(hits[0].replace(/\s+/g, ''))).cls
    found.push({ cls, rest: parts.filter(p => p !== hits[0]).join(' and ') })
  }
  return found
}

/** The first compound selector's length (up to a top-level combinator) */
function firstCompoundEnd(sel) {
  let depth = 0
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (depth === 0 && /[\s>+~]/.test(ch)) return i
  }
  return sel.length
}

function scopeSelector(selector, cls) {
  const sel = selector.trim()
  if (ROOT_COMPOUND.test(sel)) {
    const end = firstCompoundEnd(sel)
    const compound = sel.slice(0, end)
    // before a pseudo-element, which must stay last
    let at = compound.length
    let depth = 0
    for (let i = 0; i < compound.length; i++) {
      const ch = compound[i]
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === '(' || ch === '[') depth++
      else if (ch === ')' || ch === ']') depth--
      else if (depth === 0 && ch === ':' && compound[i + 1] === ':') {
        at = i
        break
      }
    }
    return compound.slice(0, at) + `:where(.${cls})` + compound.slice(at) + sel.slice(end)
  }
  return `:where(:root.${cls}) ${sel}`
}

const GENERATED = new WeakSet()

/** Scope every rule under `container`; returns the keyframes-like at-rules to hoist */
function scopeContents(container, cls, hoisted) {
  container.each(node => {
    if (node.type === 'rule') {
      node.selectors = node.selectors.map(s => scopeSelector(s, cls))
    } else if (node.type === 'atrule') {
      if (/keyframes$/i.test(node.name) || node.name === 'font-face') {
        hoisted.push(node.clone())
        node.remove()
      } else if (node.nodes) {
        scopeContents(node, cls, hoisted)
      }
    }
  })
}

function insideGenerated(node) {
  for (let p = node.parent; p; p = p.parent) if (GENERATED.has(p)) return true
  return false
}

const plugin = () => ({
  postcssPlugin: 'tazrim-a11y-media',
  Once(root) {
    const medias = []
    root.walkAtRules('media', rule => {
      if (!insideGenerated(rule) && !GENERATED.has(rule)) medias.push(rule)
    })
    for (const media of medias) {
      const found = matchQueries(media.params)
      if (!found.length || !media.nodes) continue
      // One copy per class; its conditions are the rests of the queries that asked for it
      const byClass = new Map()
      for (const { cls, rest } of found) byClass.set(cls, [...(byClass.get(cls) ?? []), rest])
      let anchor = media
      for (const [cls, rests] of byClass) {
        const copy = media.clone({ nodes: [] })
        for (const child of media.nodes) copy.append(child.clone())
        const hoisted = []
        scopeContents(copy, cls, hoisted)
        // Nothing but keyframes inside: nothing to scope
        const out = []
        if (copy.nodes.length) {
          const conditions = [...new Set(rests)]
          if (conditions.includes('')) {
            // Unconditional under the class: the rules themselves, no wrapper needed
            out.push(...copy.nodes.map(n => n.clone()))
          } else {
            copy.params = conditions.join(', ')
            out.push(copy)
          }
        }
        out.push(...hoisted)
        for (const node of out) {
          GENERATED.add(node)
          anchor.after(node)
          anchor = node
        }
      }
    }
  },
})
plugin.postcss = true

module.exports = plugin
