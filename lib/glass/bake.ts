/*
 * Bakes the glass of one element into a bitmap (ENG-72, round 3), written
 * for Tazrim. Browser only.
 *
 * The page background scrolls with the document (lib/background/tile-svg.ts),
 * so what is behind a glass element does not change while the page scrolls:
 * the glass is computed once (mount, size or position change, theme or
 * background change, the wallet settling) and the element shows it as a
 * plain 2D canvas. Nothing runs while scrolling.
 *
 * One WebGL2 context for every element, on a canvas that is never attached:
 *   1. the background behind the element (plus a margin) is painted at the
 *      device pixel ratio (lib/background/paint.ts) and uploaded with mipmaps
 *   2. a separable Gaussian blur (FROST_BLUR) into two small framebuffers
 *   3. the lens: a narrow band along the rounded edge looks outward (the
 *      page just past the edge bends in), red and blue a little apart there
 *      (dispersion at the rim only); a light tint and a touch of
 *      saturation; Blinn-Phong highlights from a key light top left and a
 *      fill bottom right on the band's tilted normal, Fresnel (Schlick) at
 *      the rim, a hairline rim, a soft inner shadow along the bottom edge
 *   4. the result is copied into the element's own canvas.
 * Without WebGL2: a Canvas2D version (the frost by drawing small and scaling
 * up, the tint and the rim; no lens).
 */

import { paintBackground, type PageGeometry } from '@/lib/background/paint'
import type { BackgroundSetting } from '@/lib/background/setting'
import { BLUR_TEXELS_PER_PX, FROST_BLUR, bakeMargin, bakeRegion, bakeScale, gaussianWeights, lensParams, type Rect } from './geometry'

export interface BakeInput {
  /** The element's canvas (sized here) */
  target: HTMLCanvasElement
  /** Element size, CSS px (untransformed) */
  width: number
  height: number
  radius: number
  /** The element on the document: top left (CSS px) and its scale on screen */
  x: number
  y: number
  scaleX: number
  scaleY: number
  dpr: number
  setting: BackgroundSetting
  dark: boolean
  page: PageGeometry
}

export type BakeBackend = 'webgl' | 'canvas2d'

/** Which baker to use: WebGL2 unless it is missing or has failed. Pure, for the tests. */
export function chooseBackend(env: { webgl2: boolean; failed: boolean }): BakeBackend {
  return env.webgl2 && !env.failed ? 'webgl' : 'canvas2d'
}

const VERTEX = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

const MAX_TAPS = 24

const BLUR = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_out;
uniform vec2 u_step;
uniform float u_weights[${MAX_TAPS + 1}];
uniform int u_radius;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / u_out;
  vec4 sum = texture(u_src, uv) * u_weights[0];
  for (int i = 1; i <= ${MAX_TAPS}; i++) {
    if (i > u_radius) break;
    vec2 d = u_step * float(i);
    sum += (texture(u_src, uv + d) + texture(u_src, uv - d)) * u_weights[i];
  }
  o = sum;
}
`

const LENS = `#version 300 es
precision highp float;
uniform vec2 u_size;     // element, CSS px
uniform float u_dpr;
uniform vec4 u_elem;     // element on the document: x, y, scale x, scale y
uniform vec4 u_region;   // the frost texture's region on the document
uniform sampler2D u_frost;
uniform float u_radius;
uniform float u_band;
uniform float u_reach;
uniform float u_dark;
out vec4 o;

float sdRoundRect(vec2 p, vec2 hs, float r) {
  vec2 q = abs(p) - hs + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 frost(vec2 local) {
  vec2 doc = u_elem.xy + local * u_elem.zw;
  return texture(u_frost, (doc - u_region.xy) / u_region.zw).rgb;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 frag = gl_FragCoord.xy / u_dpr;
  vec2 local = vec2(frag.x, u_size.y - frag.y);
  vec2 hs = u_size * 0.5;
  vec2 c = local - hs;
  float d = sdRoundRect(c, hs, u_radius);
  float cover = clamp(0.5 - d * u_dpr, 0.0, 1.0);
  if (cover <= 0.0) { o = vec4(0.0); return; }
  float e = max(-d, 0.0);
  float eps = 0.5;
  vec2 grad = vec2(
    sdRoundRect(c + vec2(eps, 0.0), hs, u_radius) - sdRoundRect(c - vec2(eps, 0.0), hs, u_radius),
    sdRoundRect(c + vec2(0.0, eps), hs, u_radius) - sdRoundRect(c - vec2(0.0, eps), hs, u_radius));
  grad = length(grad) > 1e-5 ? normalize(grad) : vec2(0.0);

  // The lens band: looks outward, most at the very edge
  float f = 1.0 - smoothstep(0.0, u_band, e);
  vec2 off = grad * u_reach * f * f;
  vec3 col = vec3(
    frost(local + off * (1.0 + 0.1 * f)).r,
    frost(local + off).g,
    frost(local + off * (1.0 - 0.1 * f)).b);

  // A touch of saturation, then a light tint
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 1.1);
  col = u_dark > 0.5 ? mix(col, vec3(0.09, 0.12, 0.18), 0.22) : mix(col, vec3(1.0), 0.1);

  // The band's slope tilts the normal outward (y down here, z toward the viewer)
  vec3 n = normalize(vec3(grad * f * 1.6, 1.0));
  vec3 v = vec3(0.0, 0.0, 1.0);
  vec3 key = normalize(vec3(-0.6, -0.7, 0.8));
  vec3 fill = normalize(vec3(0.6, 0.7, 0.8));
  float spec = pow(max(dot(n, normalize(key + v)), 0.0), 90.0);
  float spec2 = pow(max(dot(n, normalize(fill + v)), 0.0), 90.0);
  float fres = 0.04 + 0.96 * pow(1.0 - n.z, 5.0);
  col += vec3(1.0) * (spec * (u_dark > 0.5 ? 0.6 : 0.85) + spec2 * (u_dark > 0.5 ? 0.18 : 0.3));
  col = mix(col, vec3(1.0), fres * (u_dark > 0.5 ? 0.25 : 0.4));

  // A hairline rim, brighter top left
  float tl = clamp(dot(grad, normalize(vec2(-1.0, -1.0))), 0.0, 1.0);
  float rim = 1.0 - smoothstep(0.5, 1.6, e);
  col = mix(col, vec3(1.0), rim * (0.2 + 0.45 * tl) * (u_dark > 0.5 ? 0.6 : 1.0));

  // A soft inner shadow along the bottom edge
  float bottom = clamp(grad.y, 0.0, 1.0) * (1.0 - smoothstep(0.0, u_band, e));
  col *= 1.0 - bottom * (u_dark > 0.5 ? 0.22 : 0.08);

  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  o = vec4(clamp(col, 0.0, 1.0) * cover, cover);
}
`

interface Target {
  tex: WebGLTexture
  fbo: WebGLFramebuffer
  width: number
  height: number
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)
  if (!sh) throw new Error('glass: no shader')
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`glass: shader: ${gl.getShaderInfoLog(sh)}`)
  return sh
}

function link(gl: WebGL2RenderingContext, fragment: string): WebGLProgram {
  const p = gl.createProgram()
  if (!p) throw new Error('glass: no program')
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fragment))
  gl.bindAttribLocation(p, 0, 'a_pos')
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`glass: link: ${gl.getProgramInfoLog(p)}`)
  return p
}

function texture(gl: WebGL2RenderingContext): WebGLTexture {
  const t = gl.createTexture()
  if (!t) throw new Error('glass: no texture')
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return t
}

class GLBaker {
  readonly canvas = document.createElement('canvas')
  private gl: WebGL2RenderingContext
  private blur: WebGLProgram
  private lens: WebGLProgram
  private source: WebGLTexture
  private targets: [Target, Target] | null = null
  private ub: Record<string, WebGLUniformLocation | null> = {}
  private ul: Record<string, WebGLUniformLocation | null> = {}
  readonly maxTextureSize: number

  constructor() {
    const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true })
    if (!gl) throw new Error('glass: no webgl2')
    this.gl = gl
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    this.blur = link(gl, BLUR)
    this.lens = link(gl, LENS)
    for (const n of ['u_src', 'u_out', 'u_step', 'u_weights', 'u_radius']) this.ub[n] = gl.getUniformLocation(this.blur, n)
    for (const n of ['u_size', 'u_dpr', 'u_elem', 'u_region', 'u_frost', 'u_radius', 'u_band', 'u_reach', 'u_dark']) this.ul[n] = gl.getUniformLocation(this.lens, n)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    this.source = texture(gl)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  }

  get lost() {
    return this.gl.isContextLost()
  }

  private target(w: number, h: number): Target {
    const gl = this.gl
    const tex = texture(gl)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    const fbo = gl.createFramebuffer()
    if (!fbo) throw new Error('glass: no framebuffer')
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return { tex, fbo, width: w, height: h }
  }

  bake(input: BakeInput, painted: HTMLCanvasElement, region: Rect, band: number, reach: number) {
    const gl = this.gl
    // 1. The painted background, mipmapped
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.source)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, painted)
    gl.generateMipmap(gl.TEXTURE_2D)

    // 2. The frost: a separable Gaussian
    const w = Math.max(2, Math.round(region.width * BLUR_TEXELS_PER_PX))
    const h = Math.max(2, Math.round(region.height * BLUR_TEXELS_PER_PX))
    if (!this.targets || this.targets[0].width !== w || this.targets[0].height !== h) {
      if (this.targets) for (const t of this.targets) {
        gl.deleteFramebuffer(t.fbo)
        gl.deleteTexture(t.tex)
      }
      this.targets = [this.target(w, h), this.target(w, h)]
    }
    const weights = gaussianWeights(FROST_BLUR * BLUR_TEXELS_PER_PX)
    const padded = new Float32Array(MAX_TAPS + 1)
    padded.set(weights.slice(0, MAX_TAPS + 1))
    gl.useProgram(this.blur)
    gl.uniform1i(this.ub.u_src, 0)
    gl.uniform2f(this.ub.u_out, w, h)
    gl.uniform1fv(this.ub.u_weights, padded)
    gl.uniform1i(this.ub.u_radius, Math.min(MAX_TAPS, weights.length - 1))
    gl.viewport(0, 0, w, h)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[0].fbo)
    gl.bindTexture(gl.TEXTURE_2D, this.source)
    gl.uniform2f(this.ub.u_step, 1 / w, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[1].fbo)
    gl.bindTexture(gl.TEXTURE_2D, this.targets[0].tex)
    gl.uniform2f(this.ub.u_step, 0, 1 / h)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    // 3. The lens, into the shared canvas
    const cw = Math.max(1, Math.round(input.width * input.dpr))
    const ch = Math.max(1, Math.round(input.height * input.dpr))
    if (this.canvas.width !== cw) this.canvas.width = cw
    if (this.canvas.height !== ch) this.canvas.height = ch
    gl.viewport(0, 0, cw, ch)
    gl.useProgram(this.lens)
    gl.bindTexture(gl.TEXTURE_2D, this.targets[1].tex)
    const u = this.ul
    gl.uniform1i(u.u_frost, 0)
    gl.uniform2f(u.u_size, input.width, input.height)
    gl.uniform1f(u.u_dpr, cw / input.width)
    gl.uniform4f(u.u_elem, input.x, input.y, input.scaleX, input.scaleY)
    gl.uniform4f(u.u_region, region.x, region.y, region.width, region.height)
    gl.uniform1f(u.u_radius, input.radius)
    gl.uniform1f(u.u_band, band)
    gl.uniform1f(u.u_reach, reach)
    gl.uniform1f(u.u_dark, input.dark ? 1 : 0)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}

/** Canvas2D fallback: the frost by drawing small and scaling up, a tint and a rim; no lens. */
function bake2d(input: BakeInput, painted: HTMLCanvasElement, region: Rect, ctx: CanvasRenderingContext2D) {
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  const k = W / input.width
  // Downscale (the frost), then draw the element's part of it back up
  const f = Math.max(2, FROST_BLUR / 2)
  const small = document.createElement('canvas')
  small.width = Math.max(2, Math.round(region.width / f))
  small.height = Math.max(2, Math.round(region.height / f))
  const s = small.getContext('2d')
  if (!s) return
  s.imageSmoothingQuality = 'high'
  s.drawImage(painted, 0, 0, small.width, small.height)
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(0, 0, W, H, input.radius * k)
  ctx.clip()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // region → element-local px: (doc − element) / elementScale
  const ox = (region.x - input.x) / input.scaleX
  const oy = (region.y - input.y) / input.scaleY
  ctx.drawImage(small, ox * k, oy * k, (region.width / input.scaleX) * k, (region.height / input.scaleY) * k)
  ctx.fillStyle = input.dark ? 'rgba(23, 31, 46, 0.22)' : 'rgba(255, 255, 255, 0.1)'
  ctx.fillRect(0, 0, W, H)
  const sheen = ctx.createLinearGradient(0, 0, W * 0.6, H * 0.6)
  sheen.addColorStop(0, input.dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.3)')
  sheen.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, W, H)
  ctx.restore()
  ctx.lineWidth = Math.max(1, k)
  ctx.strokeStyle = input.dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.roundRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth, input.radius * k)
  ctx.stroke()
}

let gl: GLBaker | null = null
let glFailed = false
let painted: HTMLCanvasElement | null = null

type DebugWindow = Window & { __tazrimGlassBakes?: number[] }

/** Bakes one element's glass into its canvas. Returns the time it took and the baker used. */
export function bakeGlass(input: BakeInput): { ms: number; backend: BakeBackend } {
  const t0 = performance.now()
  let backend = chooseBackend({ webgl2: typeof WebGL2RenderingContext !== 'undefined', failed: glFailed })
  if (backend === 'webgl' && (!gl || gl.lost)) {
    try {
      gl = new GLBaker()
    } catch {
      glFailed = true
      gl = null
      backend = 'canvas2d'
    }
  }
  const lens = lensParams(input.width, input.height)
  const rect = { x: input.x, y: input.y, width: input.width * input.scaleX, height: input.height * input.scaleY }
  const region = bakeRegion(rect, bakeMargin(lens))
  const scale = bakeScale(region, input.dpr, gl?.maxTextureSize ?? 4096)
  if (!painted) painted = document.createElement('canvas')
  paintBackground(painted, input.setting, input.dark, { ...region, scale }, input.page)

  const W = Math.max(1, Math.round(input.width * input.dpr))
  const H = Math.max(1, Math.round(input.height * input.dpr))
  if (input.target.width !== W) input.target.width = W
  if (input.target.height !== H) input.target.height = H
  const ctx = input.target.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, W, H)
    if (backend === 'webgl' && gl) {
      gl.bake(input, painted, region, lens.band, lens.reach)
      ctx.drawImage(gl.canvas, 0, 0)
    } else {
      bake2d(input, painted, region, ctx)
    }
  }
  const ms = performance.now() - t0
  const debug = (window as DebugWindow).__tazrimGlassBakes
  if (Array.isArray(debug)) debug.push(ms)
  return { ms, backend }
}
