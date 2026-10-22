/*
 * The glass runtime (ENG-72), browser only: what the page background is, the
 * page painted behind each WebGL glass element, the WebGL slots, and one scheduler
 * that redraws glass only when something changed: mount, resize, scroll, the
 * theme or background setting, or an element moving (the wallet's WAAPI
 * motion, the tilt, an entrance). Changes within a frame are coalesced into
 * one requestAnimationFrame; nothing runs while the page is still.
 */

import { BACKGROUND_PALETTES, DEFAULT_BACKGROUND, clampStrength, type BackgroundKind, type BackgroundPalette, type BackgroundSetting } from '@/lib/background/setting'
import { TILE_HEIGHT, TILE_WIDTH } from '@/lib/background/lines'
import { paintBackground } from '@/lib/background/paint'
import { covers, neededRegion, paintRegion, paintScale, resolveRadius, type Rect } from '@/lib/glass/geometry'
import { GLOW_BLOBS, GLOW_COLORS, GLOW_OVERRIDE_KEY, GLOW_STRENGTH, glassGlowEnabled } from '@/lib/glass/glow'
import type { GlassGL } from '@/lib/glass/renderer'
import { createSlotRegistry, type SlotRegistry } from '@/lib/glass/policy'

export const TILE_ID = 'tz-bg-tile'
const SVG_NS = 'http://www.w3.org/2000/svg'

// ── Environment ────────────────────────────────────────────────────────────

export interface GlassEnv {
  setting: BackgroundSetting
  dark: boolean
  viewport: { width: number; height: number }
  /** Changes whenever the painted background would look different */
  version: number
}

/** The setting as the stylesheet sees it (attributes on <html>, kept current by the background provider). */
export function readSetting(root: HTMLElement = document.documentElement): BackgroundSetting {
  const kind = root.dataset.bg as BackgroundKind | undefined
  const palette = root.dataset.bgPalette as BackgroundPalette | undefined
  const strength = parseFloat(root.style.getPropertyValue('--bg-strength'))
  return {
    kind: kind === 'plain' || kind === 'lines' || kind === 'ribbons' ? kind : DEFAULT_BACKGROUND.kind,
    palette: BACKGROUND_PALETTES.some(p => p.value === palette) ? palette! : DEFAULT_BACKGROUND.palette,
    strength: Number.isFinite(strength) ? clampStrength(strength * 100) : DEFAULT_BACKGROUND.strength,
  }
}

let envVersion = 0
let envKey = ''
function currentEnv(): GlassEnv {
  const setting = readSetting()
  const dark = document.documentElement.classList.contains('dark')
  const viewport = { width: window.innerWidth, height: window.innerHeight }
  const key = `${setting.kind}|${setting.palette}|${setting.strength}|${dark}|${viewport.width}x${viewport.height}`
  if (key !== envKey) {
    envKey = key
    envVersion++
  }
  return { setting, dark, viewport, version: envVersion }
}

// ── Media preferences (for React, via useSyncExternalStore) ───────────────

export interface GlassPrefs {
  webgl2: boolean
  reducedTransparency: boolean
  moreContrast: boolean
}

const SERVER_PREFS: GlassPrefs = { webgl2: false, reducedTransparency: false, moreContrast: false }
let prefs: GlassPrefs = SERVER_PREFS
const prefSubs = new Set<() => void>()
let prefsReady = false

function initPrefs() {
  if (prefsReady || typeof window === 'undefined') return
  prefsReady = true
  const rt = window.matchMedia('(prefers-reduced-transparency: reduce)')
  const mc = window.matchMedia('(prefers-contrast: more)')
  const read = () => {
    prefs = { webgl2: typeof WebGL2RenderingContext !== 'undefined', reducedTransparency: rt.matches, moreContrast: mc.matches }
    prefSubs.forEach(fn => fn())
  }
  rt.addEventListener?.('change', read)
  mc.addEventListener?.('change', read)
  read()
}

export function subscribePrefs(fn: () => void) {
  initPrefs()
  prefSubs.add(fn)
  return () => {
    prefSubs.delete(fn)
  }
}
export const getPrefs = () => {
  initPrefs()
  return prefs
}
export const getServerPrefs = () => SERVER_PREFS

// ── WebGL slots ────────────────────────────────────────────────────────────

let slots: SlotRegistry | null = null
export function glassSlots(): SlotRegistry {
  if (!slots) slots = createSlotRegistry()
  return slots
}

// ── The glow behind glass ─────────────────────────────────────────────────

let glowOn: boolean | null = null
/** GLASS_GLOW, or this browser's override (localStorage "tazrim:glass-glow"). */
export function glowEnabled(): boolean {
  if (glowOn === null) {
    let override: string | null = null
    try {
      override = window.localStorage.getItem(GLOW_OVERRIDE_KEY)
    } catch {
      // storage blocked: the constant decides
    }
    glowOn = glassGlowEnabled(override)
  }
  return glowOn
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// One scratch canvas for painting the page behind a slab before upload
let scratch: HTMLCanvasElement | null = null

// ── Scheduler ─────────────────────────────────────────────────────────────

export interface GlassInstance {
  /** The element the glass belongs to */
  readonly host: HTMLElement
  /** Read layout (all instances measure before any draws) */
  measure(env: GlassEnv): void
  /** Write: draw / move layers */
  draw(env: GlassEnv): void
}

const instances = new Set<GlassInstance>()
let frame = 0
let listening = false
const firstDrawMarked = new Set<string>()

/** Debug timings, only when window.__tazrimGlassDebug is an array (set from devtools / tests). */
type DebugWindow = Window & { __tazrimGlassDebug?: number[] }

function moving(): boolean {
  if (typeof document.getAnimations !== 'function') return false
  for (const a of document.getAnimations()) {
    if (a.playState !== 'running') continue
    const target = (a.effect as KeyframeEffect | null)?.target
    if (!(target instanceof Element)) continue
    for (const inst of instances) if (target === inst.host || target.contains(inst.host)) return true
  }
  return false
}

function run() {
  frame = 0
  if (!instances.size) return
  const t0 = performance.now()
  const env = currentEnv()
  for (const inst of instances) inst.measure(env)
  for (const inst of instances) inst.draw(env)
  const debug = (window as DebugWindow).__tazrimGlassDebug
  if (Array.isArray(debug)) debug.push(performance.now() - t0)
  // Keep up with an element that is moving, then stop
  if (moving()) schedule()
}

export function schedule() {
  if (!frame && typeof window !== 'undefined') frame = requestAnimationFrame(run)
}

/** Marks the first glass drawn on the page (for the time-to-first-glass measure). */
export function markFirstDraw(kind: 'webgl' | 'css') {
  if (firstDrawMarked.has(kind)) return
  firstDrawMarked.add(kind)
  performance.mark(`tazrim:glass-first-${kind}`)
}

function listen() {
  if (listening) return
  listening = true
  const opts = { passive: true, capture: true } as const
  window.addEventListener('scroll', schedule, opts)
  window.addEventListener('resize', schedule, { passive: true })
  window.visualViewport?.addEventListener('resize', schedule, { passive: true })
  // Animations and transitions that start on or above a glass element
  document.addEventListener('animationstart', schedule, opts)
  document.addEventListener('transitionrun', schedule, opts)
  window.addEventListener('pointermove', onPointer, { passive: true })
  // Theme class and background attributes on <html>
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-bg', 'data-bg-palette', 'style'] })
}

// The desktop tilt writes transforms straight from pointer moves
function onPointer() {
  for (const inst of instances) {
    if (inst.host.closest('[data-tilting]')) {
      schedule()
      return
    }
  }
}

export function register(inst: GlassInstance) {
  listen()
  instances.add(inst)
  schedule()
  return () => {
    instances.delete(inst)
  }
}

/** Starts a short redraw loop for an element whose motion the scheduler cannot see (WAAPI started elsewhere). */
export function nudge() {
  schedule()
}

// ── Shared geometry of an instance ────────────────────────────────────────

export interface HostBox {
  left: number
  top: number
  width: number
  height: number
  scaleX: number
  scaleY: number
  visible: boolean
}

export function measureHost(host: HTMLElement, env: GlassEnv): HostBox {
  const r = host.getBoundingClientRect()
  const width = host.offsetWidth || r.width
  const height = host.offsetHeight || r.height
  const visible = r.bottom > -64 && r.top < env.viewport.height + 64 && r.right > -64 && r.left < env.viewport.width + 64 && r.width > 0
  return {
    left: r.left,
    top: r.top,
    width,
    height,
    scaleX: width ? r.width / width : 1,
    scaleY: height ? r.height / height : 1,
    visible,
  }
}

// ── The CSS lens: the background lines redrawn inside, frosted ───────────

function useTile(): SVGUseElement {
  const u = document.createElementNS(SVG_NS, 'use')
  u.setAttribute('href', `#${TILE_ID}`)
  return u
}

/**
 * The page's lines redrawn inside the element at their place on screen (the
 * stylesheet blurs them into frost), so glass on an opaque surface (a mini
 * face in a list) still shows the background's colour.
 */
export class LensInstance implements GlassInstance {
  private group: SVGGElement
  private uses: SVGUseElement[] = []
  private box: HostBox | null = null
  private lastKey = ''
  readonly host: HTMLElement
  constructor(host: HTMLElement, lines: SVGSVGElement) {
    this.host = host
    this.group = document.createElementNS(SVG_NS, 'g')
    for (let i = 0; i < 4; i++) {
      const u = useTile()
      this.uses.push(u)
      this.group.appendChild(u)
    }
    lines.appendChild(this.group)
  }
  measure(env: GlassEnv) {
    this.box = env.setting.kind === 'lines' ? measureHost(this.host, env) : null
  }
  draw(env: GlassEnv) {
    const b = this.box
    if (!b || !b.visible) return
    const key = `${env.version}|${b.left.toFixed(1)}|${b.top.toFixed(1)}|${b.width}|${b.height}|${b.scaleX.toFixed(4)}`
    if (key === this.lastKey) return
    this.lastKey = key
    // local = (viewport − box) / scale
    const k = 1 / (b.scaleX || 1)
    this.group.setAttribute('transform', `matrix(${k} 0 0 ${k} ${(-b.left * k).toFixed(2)} ${(-b.top * k).toFixed(2)})`)
    // A frosted copy reads fainter than the crisp lines, so it is drawn a little stronger
    this.group.setAttribute('opacity', String(Math.min(0.7, (env.setting.strength / 100) * 2.2)))
    const i0 = Math.floor(b.left / TILE_WIDTH)
    const j0 = Math.floor(b.top / TILE_HEIGHT)
    this.uses.forEach((u, n) => {
      u.setAttribute('x', String((i0 + (n % 2)) * TILE_WIDTH))
      u.setAttribute('y', String((j0 + (n >> 1)) * TILE_HEIGHT))
    })
    markFirstDraw('css')
  }
  dispose() {
    this.group.remove()
  }
}

// ── The WebGL frosted slab ────────────────────────────────────────────────

export class SlabInstance implements GlassInstance {
  private box: HostBox | null = null
  private painted: { region: Rect; version: number; dpr: number } | null = null
  private lastKey = ''
  private radiusKey = ''
  private radius = 0
  readonly host: HTMLElement
  private gl: GlassGL
  private onLost: () => void
  constructor(host: HTMLElement, gl: GlassGL, onLost: () => void) {
    this.host = host
    this.gl = gl
    this.onLost = onLost
  }
  measure(env: GlassEnv) {
    this.box = measureHost(this.host, env)
    const sizeKey = `${this.box.width}x${this.box.height}`
    if (sizeKey !== this.radiusKey) {
      this.radiusKey = sizeKey
      this.radius = resolveRadius(getComputedStyle(this.host).borderTopLeftRadius, this.box.width, this.box.height)
    }
  }
  draw(env: GlassEnv) {
    const b = this.box
    if (!b || !b.visible) return
    if (this.gl.lost) {
      this.onLost()
      return
    }
    const onScreen: Rect = { x: b.left, y: b.top, width: b.width * b.scaleX, height: b.height * b.scaleY }
    const dpr = window.devicePixelRatio || 1
    // Paint the page behind the element again when the frost no longer covers it
    let changed = false
    const p = this.painted
    if (!p || p.version !== env.version || p.dpr !== dpr || !covers(p.region, neededRegion(onScreen))) {
      const region = paintRegion(onScreen)
      const scale = paintScale(region, dpr, this.gl.maxTextureSize)
      if (!scratch) scratch = document.createElement('canvas')
      paintBackground(scratch, env.setting, env.dark, { ...region, scale }, env.viewport)
      this.gl.setBackground(scratch, region)
      this.painted = { region, version: env.version, dpr }
      changed = true
    }
    const canvasDpr = Math.min(3, dpr)
    const glow = glowEnabled()
    const key = `${b.left.toFixed(2)}|${b.top.toFixed(2)}|${b.width}|${b.height}|${b.scaleX.toFixed(4)}|${b.scaleY.toFixed(4)}|${canvasDpr}|${env.dark}|${glow}`
    if (!changed && key === this.lastKey) return
    this.lastKey = key
    const colors = GLOW_COLORS[env.setting.palette] ?? GLOW_COLORS['indigo-pink']
    this.gl.render({
      width: b.width,
      height: b.height,
      dpr: canvasDpr,
      left: b.left,
      top: b.top,
      scaleX: b.scaleX,
      scaleY: b.scaleY,
      radius: this.radius,
      dark: env.dark,
      glow: glow
        ? { strength: env.dark ? GLOW_STRENGTH.dark : GLOW_STRENGTH.light, colors: [hexRgb(colors[0]), hexRgb(colors[1])], blobs: GLOW_BLOBS }
        : null,
    })
    markFirstDraw('webgl')
  }
}
