/*
 * Frosted glass in WebGL2 (ENG-72, round 2), written for Tazrim.
 *
 * Three passes, the first two only when the page behind changes:
 *   1. The page background behind the element (plus a margin and some slack
 *      for scrolling) is painted at the device pixel ratio
 *      (lib/background/paint.ts) and uploaded with mipmaps.
 *   2. A separable Gaussian blur (FROST_BLUR, about CSS blur(16px)) runs at a
 *      quarter texel per CSS px into two small framebuffers; reading the
 *      mipmapped source at that size filters it properly, so nothing
 *      aliases.
 *   3. Per frame (scroll, motion): each pixel of the element reads the
 *      blurred page at its place on screen, bent a little within a thin
 *      bevel at the rim and clamped inside the element; the palette's glow
 *      blobs (lib/glass/glow.ts) are added under the frost; then a milky
 *      tint, a slight saturation boost, a 1-2px bright rim (brightest top
 *      left) and a whisper of dither against banding.
 *
 * Drawn only when something changes (components/glass/glass-runtime.ts).
 */

import { BLUR_TEXELS_PER_PX, FROST_BLUR, RIM_BEND, RIM_BEVEL, gaussianWeights, type Rect } from './geometry'
import type { GlowBlob } from './glow'

const VERTEX = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

const MAX_TAPS = 32

// Separable Gaussian: one direction per pass. Rows run top to bottom in
// every texture (v = 0 is the top), as the painted canvas does.
const BLUR = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_out;        // output size, texels
uniform vec2 u_step;       // one output texel along the blur direction, in uv
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

const COMPOSITE = `#version 300 es
precision highp float;
uniform vec2 u_size;      // element size, CSS px
uniform float u_dpr;      // canvas px per CSS px
uniform vec4 u_rect;      // element on screen: left, top (CSS px), scale x, scale y
uniform vec4 u_region;    // the blurred texture's region: x, y, width, height (viewport CSS px)
uniform sampler2D u_frost;
uniform float u_radius;
uniform float u_bevel;
uniform float u_bend;
uniform float u_dark;
uniform vec3 u_glowA;
uniform vec3 u_glowB;
uniform float u_glow;     // overall glow strength (0 = off)
uniform vec4 u_blob[3];   // cx, cy, rx, ry (element-relative)
uniform vec2 u_blobInfo[3]; // colour (0/1), alpha
out vec4 o;

float sdRoundRect(vec2 p, vec2 hs, float r) {
  vec2 q = abs(p) - hs + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 frag = gl_FragCoord.xy / u_dpr;
  vec2 local = vec2(frag.x, u_size.y - frag.y);
  vec2 hs = u_size * 0.5;
  vec2 c = local - hs;
  float d = sdRoundRect(c, hs, u_radius);
  float cover = clamp(0.5 - d * u_dpr, 0.0, 1.0);
  if (cover <= 0.0) { o = vec4(0.0); return; }
  float e = max(-d, 0.0);

  // Outward direction (gradient of the distance field)
  float eps = 0.5;
  vec2 grad = vec2(
    sdRoundRect(c + vec2(eps, 0.0), hs, u_radius) - sdRoundRect(c - vec2(eps, 0.0), hs, u_radius),
    sdRoundRect(c + vec2(0.0, eps), hs, u_radius) - sdRoundRect(c - vec2(0.0, eps), hs, u_radius));
  grad = length(grad) > 1e-5 ? normalize(grad) : vec2(0.0);

  // The thin bevel bends the frost a little toward the middle; never past the element
  float t = 1.0 - clamp(e / u_bevel, 0.0, 1.0);
  vec2 p = clamp(local - grad * u_bend * t * t, vec2(1.0), u_size - 1.0);
  vec2 vp = u_rect.xy + p * u_rect.zw;
  vec3 col = texture(u_frost, (vp - u_region.xy) / u_region.zw).rgb;

  // The glow on the page under the element, already soft (frosted)
  if (u_glow > 0.0) {
    vec2 uv = local / u_size;
    for (int i = 0; i < 3; i++) {
      vec2 q = (uv - u_blob[i].xy) / u_blob[i].zw;
      float a = u_blobInfo[i].y * exp(-2.2 * dot(q, q)) * u_glow;
      col = mix(col, u_blobInfo[i].x > 0.5 ? u_glowB : u_glowA, clamp(a, 0.0, 1.0));
    }
  }

  // Frosted acrylic: a slight saturation boost, then a milky tint
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 1.15);
  col = u_dark > 0.5 ? mix(col, vec3(0.118, 0.161, 0.231), 0.3) : mix(col, vec3(1.0), 0.15);

  // A faint sheen from the top left
  vec2 uvs = local / u_size;
  float sheen = clamp(1.0 - (uvs.x + uvs.y) * 0.9, 0.0, 1.0);
  col += vec3(1.0) * sheen * sheen * (u_dark > 0.5 ? 0.04 : 0.06);

  // The rim: a 1-2px bright line, brightest along the top-left edges, fainter opposite
  float rimLine = 1.0 - smoothstep(0.6, 1.8, e);
  float tl = clamp(dot(grad, normalize(vec2(-1.0, -1.0))), 0.0, 1.0);
  float br = clamp(dot(grad, normalize(vec2(1.0, 1.0))), 0.0, 1.0);
  float rim = rimLine * (0.18 + 0.6 * tl + 0.12 * br);
  col = mix(col, vec3(1.0), rim * (u_dark > 0.5 ? 0.55 : 0.9));

  // Dither against banding in the smooth frost
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;

  o = vec4(clamp(col, 0.0, 1.0) * cover, cover);
}
`

export interface GlassFrame {
  /** Element size, CSS px (untransformed) */
  width: number
  height: number
  /** Canvas pixels per CSS px */
  dpr: number
  /** On screen: left / top (viewport CSS px) and the element's scale */
  left: number
  top: number
  scaleX: number
  scaleY: number
  radius: number
  dark: boolean
  glow: {
    strength: number
    colors: readonly [readonly [number, number, number], readonly [number, number, number]]
    blobs: ReadonlyArray<GlowBlob>
  } | null
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)
  if (!sh) throw new Error('glass: no shader')
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`glass: shader: ${log}`)
  }
  return sh
}

function link(gl: WebGL2RenderingContext, fragment: string): WebGLProgram {
  const program = gl.createProgram()
  if (!program) throw new Error('glass: no program')
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment))
  gl.bindAttribLocation(program, 0, 'a_pos')
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`glass: link: ${gl.getProgramInfoLog(program)}`)
  return program
}

function makeTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture()
  if (!tex) throw new Error('glass: no texture')
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return tex
}

interface Target {
  tex: WebGLTexture
  fbo: WebGLFramebuffer
  width: number
  height: number
}

export class GlassGL {
  private gl: WebGL2RenderingContext
  private blurProgram: WebGLProgram
  private compositeProgram: WebGLProgram
  private source: WebGLTexture
  private targets: [Target, Target] | null = null
  private region: Rect = { x: 0, y: 0, width: 1, height: 1 }
  private ub: Record<string, WebGLUniformLocation | null> = {}
  private uc: Record<string, WebGLUniformLocation | null> = {}
  readonly maxTextureSize: number
  readonly canvas: HTMLCanvasElement

  /** Throws when WebGL2 or a shader is not available (the caller falls back to CSS). */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    })
    if (!gl) throw new Error('glass: no webgl2')
    this.gl = gl
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    this.blurProgram = link(gl, BLUR)
    this.compositeProgram = link(gl, COMPOSITE)
    for (const n of ['u_src', 'u_out', 'u_step', 'u_weights', 'u_radius']) this.ub[n] = gl.getUniformLocation(this.blurProgram, n)
    for (const n of ['u_size', 'u_dpr', 'u_rect', 'u_region', 'u_frost', 'u_radius', 'u_bevel', 'u_bend', 'u_dark', 'u_glowA', 'u_glowB', 'u_glow', 'u_blob', 'u_blobInfo']) {
      this.uc[n] = gl.getUniformLocation(this.compositeProgram, n)
    }
    // One triangle that covers the target
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    this.source = makeTexture(gl)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  }

  private target(width: number, height: number): Target {
    const gl = this.gl
    const tex = makeTexture(gl)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    const fbo = gl.createFramebuffer()
    if (!fbo) throw new Error('glass: no framebuffer')
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return { tex, fbo, width, height }
  }

  /**
   * Takes the painted page behind the element (`region`, viewport CSS px;
   * rows top to bottom) and blurs it into the frost.
   */
  setBackground(source: HTMLCanvasElement, region: Rect, blur = FROST_BLUR) {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.source)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.generateMipmap(gl.TEXTURE_2D)
    this.region = region

    const w = Math.max(2, Math.round(region.width * BLUR_TEXELS_PER_PX))
    const h = Math.max(2, Math.round(region.height * BLUR_TEXELS_PER_PX))
    if (!this.targets || this.targets[0].width !== w || this.targets[0].height !== h) {
      if (this.targets) for (const t of this.targets) {
        gl.deleteFramebuffer(t.fbo)
        gl.deleteTexture(t.tex)
      }
      this.targets = [this.target(w, h), this.target(w, h)]
    }
    const weights = gaussianWeights(blur * BLUR_TEXELS_PER_PX)
    const radius = Math.min(MAX_TAPS, weights.length - 1)
    const padded = new Float32Array(MAX_TAPS + 1)
    padded.set(weights.slice(0, MAX_TAPS + 1))
    gl.useProgram(this.blurProgram)
    gl.uniform1i(this.ub.u_src, 0)
    gl.uniform2f(this.ub.u_out, w, h)
    gl.uniform1fv(this.ub.u_weights, padded)
    gl.uniform1i(this.ub.u_radius, radius)
    gl.viewport(0, 0, w, h)
    // Horizontal: the mipmapped page into the first target
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[0].fbo)
    gl.bindTexture(gl.TEXTURE_2D, this.source)
    gl.uniform2f(this.ub.u_step, 1 / w, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    // Vertical: into the second
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[1].fbo)
    gl.bindTexture(gl.TEXTURE_2D, this.targets[0].tex)
    gl.uniform2f(this.ub.u_step, 0, 1 / h)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** The region the current frost covers (viewport CSS px). */
  get covered(): Rect {
    return this.region
  }

  render(f: GlassFrame) {
    const gl = this.gl
    if (!this.targets) return
    const w = Math.max(1, Math.round(f.width * f.dpr))
    const h = Math.max(1, Math.round(f.height * f.dpr))
    if (this.canvas.width !== w) this.canvas.width = w
    if (this.canvas.height !== h) this.canvas.height = h
    gl.viewport(0, 0, w, h)
    gl.useProgram(this.compositeProgram)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.targets[1].tex)
    const u = this.uc
    gl.uniform1i(u.u_frost, 0)
    gl.uniform2f(u.u_size, f.width, f.height)
    gl.uniform1f(u.u_dpr, w / f.width)
    gl.uniform4f(u.u_rect, f.left, f.top, f.scaleX, f.scaleY)
    gl.uniform4f(u.u_region, this.region.x, this.region.y, this.region.width, this.region.height)
    gl.uniform1f(u.u_radius, f.radius)
    gl.uniform1f(u.u_bevel, RIM_BEVEL)
    gl.uniform1f(u.u_bend, RIM_BEND)
    gl.uniform1f(u.u_dark, f.dark ? 1 : 0)
    if (f.glow) {
      gl.uniform1f(u.u_glow, f.glow.strength)
      gl.uniform3f(u.u_glowA, ...f.glow.colors[0])
      gl.uniform3f(u.u_glowB, ...f.glow.colors[1])
      const blobs = new Float32Array(12)
      const info = new Float32Array(6)
      f.glow.blobs.slice(0, 3).forEach((b, i) => {
        blobs.set([b.cx, b.cy, b.rx, b.ry], i * 4)
        info.set([b.color, b.alpha], i * 2)
      })
      gl.uniform4fv(u.u_blob, blobs)
      gl.uniform2fv(u.u_blobInfo, info)
    } else {
      gl.uniform1f(u.u_glow, 0)
    }
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  get lost(): boolean {
    return this.gl.isContextLost()
  }

  /** Frees the context now (browsers cap how many live at once). */
  dispose() {
    const gl = this.gl
    if (this.targets) for (const t of this.targets) {
      gl.deleteFramebuffer(t.fbo)
      gl.deleteTexture(t.tex)
    }
    gl.deleteTexture(this.source)
    gl.deleteProgram(this.blurProgram)
    gl.deleteProgram(this.compositeProgram)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
