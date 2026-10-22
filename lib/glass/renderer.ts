/*
 * The glass slab in WebGL2 (ENG-72). Written for Tazrim, inspired by the
 * look of ray-marched "fluid glass" demos but sharing no code with them: the
 * slab is analytic (a rounded-rectangle distance field and a quarter-round
 * bevel, lib/glass/geometry.ts), so each pixel is one closed-form ray, not a
 * march.
 *
 * Per pixel: the top surface's normal (flat, a whisper of dome for a slight
 * magnification, tilting outward on the bevel) refracts a straight-down view
 * ray into the glass; it crosses the slab, refracts out of the flat
 * underside and lands on the page `lift` px below, where the page background
 * (a texture painted by lib/background/paint.ts) is sampled. Red, green and
 * blue use slightly different indices of refraction (dispersion: faint
 * rainbow fringes at the rim), three taps each give a very small frost, and
 * fresnel mixes in the reflection of a soft studio: a bright key light top
 * left, a softer fill bottom right, a darker floor. The tint is almost clear.
 *
 * Drawn only when something changes (lib/glass/scheduler.ts), never in a loop.
 */

import { domeTilt, type SlabParams } from './geometry'

const VERTEX = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 u_size;      // element size, CSS px
uniform float u_dpr;      // canvas px per CSS px
uniform vec4 u_rect;      // element on screen: left, top (CSS px), scale x, scale y
uniform vec4 u_tex;       // texture region: x, y, width, height (viewport CSS px)
uniform sampler2D u_bg;
uniform float u_radius;
uniform float u_bevel;
uniform float u_thick;
uniform float u_lift;
uniform float u_magnify;  // tilt per px from the centre (the faint dome)
uniform float u_ior;
uniform float u_spread;   // dispersion: ior difference between red and blue
uniform float u_frost;    // frost radius, CSS px
uniform float u_dark;
uniform vec3 u_page;      // the page colour under the pattern
uniform float u_contrast; // how much stronger the pattern reads through the glass
out vec4 o;

float sdRoundRect(vec2 p, vec2 hs, float r) {
  vec2 q = abs(p) - hs + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 page(vec2 local) {
  vec2 vp = u_rect.xy + local * u_rect.zw;
  return texture(u_bg, (vp - u_tex.xy) / u_tex.zw).rgb;
}

// Offset (CSS px) from the point below to where the ray meets the page
vec2 bend(vec3 n, float h, float ior) {
  vec3 t1 = refract(vec3(0.0, 0.0, -1.0), n, 1.0 / ior);
  if (dot(t1, t1) < 1e-6) t1 = vec3(0.0, 0.0, -1.0);
  t1 = normalize(t1);
  vec3 t2 = refract(t1, vec3(0.0, 0.0, 1.0), ior);
  if (dot(t2, t2) < 1e-6) t2 = t1;
  t2 = normalize(t2);
  return t1.xy * (h / max(0.05, -t1.z)) + t2.xy * (u_lift / max(0.05, -t2.z));
}

float channel(vec2 local, vec2 off, float f, int c) {
  vec2 p = local + off;
  float a = page(p + vec2(f, 0.0))[c];
  float b = page(p + vec2(-0.5 * f, 0.866 * f))[c];
  float d = page(p + vec2(-0.5 * f, -0.866 * f))[c];
  return (a + b + d) / 3.0;
}

void main() {
  vec2 frag = gl_FragCoord.xy / u_dpr;
  vec2 local = vec2(frag.x, u_size.y - frag.y);
  vec2 hs = u_size * 0.5;
  vec2 c = local - hs;
  float d = sdRoundRect(c, hs, u_radius);
  float cover = clamp(0.5 - d * u_dpr, 0.0, 1.0);
  if (cover <= 0.0) { o = vec4(0.0); return; }

  // Outward direction: gradient of the distance field
  float eps = 0.5;
  vec2 grad = vec2(
    sdRoundRect(c + vec2(eps, 0.0), hs, u_radius) - sdRoundRect(c - vec2(eps, 0.0), hs, u_radius),
    sdRoundRect(c + vec2(0.0, eps), hs, u_radius) - sdRoundRect(c - vec2(0.0, eps), hs, u_radius));
  grad = length(grad) > 1e-5 ? normalize(grad) : vec2(0.0);

  // Quarter-round bevel meeting the flat top
  float e = max(-d, 0.0);
  float s = clamp(1.0 - e / u_bevel, 0.0, 0.985);
  float root = sqrt(1.0 - s * s);
  float h = u_thick * root;
  float slope = u_thick * s / (u_bevel * root);
  float rim = 1.0 - smoothstep(0.0, u_bevel, e);

  // The dome only bends what is seen through it; it reads as flat, so it
  // takes no part in the reflections below
  vec3 n = normalize(vec3(slope * grad + u_magnify * c, 1.0));
  vec3 nr = normalize(vec3(slope * grad, 1.0));

  // Dispersion: one index per channel
  float f = u_frost * (1.0 + 2.5 * rim);
  vec3 col = vec3(
    channel(local, bend(n, h, u_ior - u_spread), f, 0),
    channel(local, bend(n, h, u_ior), f, 1),
    channel(local, bend(n, h, u_ior + u_spread), f, 2));

  // Through the glass the pattern reads a little stronger and more saturated
  // (the approved mockup: 1.6× the lines, saturate(170%)), then an almost clear tint
  col = clamp(u_page + (col - u_page) * u_contrast, 0.0, 1.0);
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = clamp(mix(vec3(luma), col, 1.5), 0.0, 1.0);
  col = mix(col, vec3(1.0), u_dark > 0.5 ? 0.03 : 0.05);

  // Reflection of a soft studio: key light top left, fill bottom right, a floor
  vec3 r = reflect(vec3(0.0, 0.0, -1.0), nr);
  vec3 key = normalize(vec3(-0.55, -0.62, 0.56));
  vec3 fill = normalize(vec3(0.6, 0.62, 0.5));
  float sky = smoothstep(-0.3, 0.9, r.z);
  vec3 env = u_dark > 0.5 ? mix(vec3(0.02, 0.03, 0.06), vec3(0.32, 0.35, 0.42), sky)
                          : mix(vec3(0.5, 0.54, 0.62), vec3(0.98), sky);
  float fresnel = 0.04 + 0.96 * pow(1.0 - clamp(nr.z, 0.0, 1.0), 5.0);
  col = mix(col, env, fresnel * (u_dark > 0.5 ? 0.7 : 0.6));
  // Lobes measured from the flat top's reflection (r = up), so the flat
  // middle stays clear and whole edges catch the light, not just corners
  float k = pow(max(dot(r, key) - key.z, 0.0) / (1.0 - key.z), 3.0);
  float l = pow(max(dot(r, fill) - fill.z, 0.0) / (1.0 - fill.z), 2.6);
  col += vec3(1.0) * (k * (u_dark > 0.5 ? 0.5 : 0.65) + l * (u_dark > 0.5 ? 0.2 : 0.25));

  // A hairline where the bevel meets the air
  float edge = 1.0 - smoothstep(0.0, 1.25, e);
  col = mix(col, u_dark > 0.5 ? vec3(1.0) : vec3(0.45, 0.5, 0.6), edge * (u_dark > 0.5 ? 0.22 : 0.3));

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
  slab: SlabParams
  dark: boolean
  /** The page colour under the pattern, 0-1 RGB */
  page: [number, number, number]
  /** How much stronger the pattern reads through the glass (1 = as on the page) */
  contrast?: number
  ior?: number
}

export interface TextureRegion {
  x: number
  y: number
  width: number
  height: number
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

export class GlassGL {
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private texture: WebGLTexture
  private uniforms: Record<string, WebGLUniformLocation | null> = {}
  private region: TextureRegion = { x: 0, y: 0, width: 1, height: 1 }
  readonly maxTextureSize: number

  /** Throws when WebGL2 or the shader is not available (the caller falls back to CSS). */
  constructor(readonly canvas: HTMLCanvasElement) {
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
    const program = gl.createProgram()
    if (!program) throw new Error('glass: no program')
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
    gl.bindAttribLocation(program, 0, 'a_pos')
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`glass: link: ${gl.getProgramInfoLog(program)}`)
    this.program = program
    gl.useProgram(program)
    for (const name of ['u_size', 'u_dpr', 'u_rect', 'u_tex', 'u_bg', 'u_radius', 'u_bevel', 'u_thick', 'u_lift', 'u_magnify', 'u_ior', 'u_spread', 'u_frost', 'u_dark', 'u_page', 'u_contrast']) {
      this.uniforms[name] = gl.getUniformLocation(program, name)
    }
    // One triangle that covers the canvas
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    const tex = gl.createTexture()
    if (!tex) throw new Error('glass: no texture')
    this.texture = tex
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.uniform1i(this.uniforms.u_bg, 0)
  }

  /** Uploads the painted page background (rows top to bottom). */
  setBackground(source: HTMLCanvasElement, region: TextureRegion) {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    this.region = region
  }

  render(f: GlassFrame) {
    const gl = this.gl
    const w = Math.max(1, Math.round(f.width * f.dpr))
    const h = Math.max(1, Math.round(f.height * f.dpr))
    if (this.canvas.width !== w) this.canvas.width = w
    if (this.canvas.height !== h) this.canvas.height = h
    gl.viewport(0, 0, w, h)
    const u = this.uniforms
    const ior = f.ior ?? 1.45
    gl.uniform2f(u.u_size, f.width, f.height)
    gl.uniform1f(u.u_dpr, w / f.width)
    gl.uniform4f(u.u_rect, f.left, f.top, f.scaleX, f.scaleY)
    gl.uniform4f(u.u_tex, this.region.x, this.region.y, this.region.width, this.region.height)
    gl.uniform1f(u.u_radius, f.slab.radius)
    gl.uniform1f(u.u_bevel, f.slab.bevel)
    gl.uniform1f(u.u_thick, f.slab.thickness)
    gl.uniform1f(u.u_lift, f.slab.lift)
    gl.uniform1f(u.u_magnify, domeTilt(f.slab, ior))
    gl.uniform1f(u.u_ior, ior)
    gl.uniform1f(u.u_spread, 0.035)
    gl.uniform1f(u.u_frost, 0.6)
    gl.uniform1f(u.u_dark, f.dark ? 1 : 0)
    gl.uniform3f(u.u_page, f.page[0], f.page[1], f.page[2])
    gl.uniform1f(u.u_contrast, f.contrast ?? 1.6)
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
    gl.deleteTexture(this.texture)
    gl.deleteProgram(this.program)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
