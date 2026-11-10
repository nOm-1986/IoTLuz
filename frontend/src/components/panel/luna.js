// Luz nocturna de la página: un haz frío que entra por la esquina superior derecha (fuera de la
// pantalla), cruza la página por detrás de los mandos y llega a la lámpara. Delante de la fuente
// pasan nubes (el haz se apaga y se enciende por franjas) y en el haz flota polvo.
//
// Va en su propio lienzo WebGL, fijo detrás del contenido. La escena 3D recibe la misma luz con
// un foco de verdad (sombras); `alNube(g)` le pasa cuánto tapan las nubes en cada momento.
const COLOR = [0.7, 0.82, 1.0]
const FUERZA = { oscuro: 0.85, claro: 1.0 }
const POLVO = 240

const RUIDO = /* glsl */ `
  float azar(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float ruido(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(azar(i), azar(i + vec2(1, 0)), u.x), mix(azar(i + vec2(0, 1)), azar(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int k = 0; k < 4; k++) { v += a * ruido(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  uniform vec2 uRes;
  uniform vec2 uFuente;
  uniform vec2 uObjetivo;
  uniform float uTiempo;
  uniform float uGlobal;
  // Cuánta luz llega a un punto (en píxeles del lienzo, origen abajo a la izquierda).
  float haz(vec2 p, bool conDetalle) {
    vec2 eje = normalize(uObjetivo - uFuente);
    vec2 d = p - uFuente;
    float largo = dot(d, eje);
    if (largo <= 0.0) return 0.0;
    float L = length(uObjetivo - uFuente);
    float ang = dot(d, vec2(-eje.y, eje.x)) / largo; // tangente del ángulo con el eje
    float cono = smoothstep(0.26, 0.06, abs(ang));
    float caida = smoothstep(L * 1.35, L * 0.25, largo) * (0.55 + 0.45 * exp(-largo / (L * 0.5)));
    float nubes = 1.0;
    float rayos = 1.0;
    if (conDetalle) {
      // Las nubes cruzan delante de la fuente: franjas que se mueven a lo ancho del haz.
      nubes = mix(0.3, 1.0, smoothstep(0.3, 0.72, fbm(vec2(ang * 5.0 - uTiempo * 0.05, uTiempo * 0.018))));
      rayos = 0.7 + 0.3 * fbm(vec2(ang * 26.0 + uTiempo * 0.012, 3.0));
    }
    return cono * caida * nubes * rayos * mix(0.5, 1.0, uGlobal);
  }
`

const VERT_PLANO = /* glsl */ `#version 300 es
  in vec2 aPos;
  void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`
const FRAG_HAZ = /* glsl */ `#version 300 es
  precision highp float;
  ${RUIDO}
  uniform float uFuerza;
  uniform vec3 uColor;
  out vec4 salida;
  void main() {
    vec2 p = gl_FragCoord.xy;
    float a = haz(p, true);
    // resplandor por donde entra la luz (la fuente queda fuera de la página)
    float r = length(p - uFuente) / max(uRes.x, uRes.y);
    a += 0.55 * exp(-r * 5.0) * mix(0.4, 1.0, uGlobal);
    a *= uFuerza;
    a += (azar(p + uTiempo) - 0.5) / 255.0; // tramado: sin escalones en el degradado
    a = clamp(a, 0.0, 1.0);
    salida = vec4(uColor * a, a);
  }
`
const VERT_POLVO = /* glsl */ `#version 300 es
  precision highp float;
  ${RUIDO}
  in float aSemilla;
  uniform float uEscala;
  out float vLuz;
  out float vBorroso;
  void main() {
    float s = aSemilla;
    vec2 h = vec2(azar(vec2(s, 1.0)), azar(vec2(s, 2.0)));
    float h3 = azar(vec2(s, 3.0));
    // deriva lenta: baja muy despacio y serpentea; da la vuelta por abajo
    vec2 pos = h * uRes;
    pos.x += sin(uTiempo * (0.05 + 0.1 * h3) + s * 6.283) * 40.0 * uEscala + uTiempo * 3.0 * uEscala;
    pos.y -= uTiempo * (2.0 + 7.0 * h3) * uEscala;
    pos.y += sin(uTiempo * 0.3 + s * 11.0) * 6.0 * uEscala;
    pos = mod(pos, uRes);
    float brillo = 0.5 + 0.5 * sin(uTiempo * (0.8 + h3 * 1.6) + s * 20.0); // gira y destella
    vLuz = haz(pos, false) * (0.25 + 0.75 * brillo * brillo);
    vBorroso = step(0.86, h3); // unas pocas motas, cerca de la cámara: grandes y desenfocadas
    gl_Position = vec4(pos / uRes * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = (vBorroso > 0.5 ? 6.0 + 6.0 * h.x : 1.2 + 2.0 * h3) * uEscala;
  }
`
const FRAG_POLVO = /* glsl */ `#version 300 es
  precision highp float;
  in float vLuz;
  in float vBorroso;
  uniform vec3 uColor;
  uniform float uFuerza;
  out vec4 salida;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float forma = vBorroso > 0.5 ? (1.0 - smoothstep(0.2, 1.0, d)) * 0.35 : 1.0 - smoothstep(0.4, 1.0, d);
    float a = clamp(vLuz * forma * uFuerza * 3.0, 0.0, 1.0);
    salida = vec4(mix(uColor, vec3(1.0), 0.5) * a, a);
  }
`

function programa(gl, vs, fs) {
  const p = gl.createProgram()
  for (const [tipo, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(tipo)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`luna: ${gl.getShaderInfoLog(s)}`)
    gl.attachShader(p, s)
  }
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p))
  return p
}

/** Cuánto dejan pasar las nubes (0..1), igual en la página y en la escena 3D. */
export function nubeGlobal(t) {
  return 0.5 + 0.5 * (0.6 * Math.sin(t * 0.11) + 0.4 * Math.sin(t * 0.047 + 1.3))
}

/**
 * @param {HTMLCanvasElement} lienzo  capa fija detrás del contenido
 * @param {{ objetivo: () => {x: number, y: number} | null, tema?: string, alNube?: (g: number) => void }} op
 *   `objetivo`: a dónde apunta el haz, en píxeles de la ventana (el suelo bajo la lámpara).
 */
export function crearLuna(lienzo, { objetivo, tema = 'claro', alNube = () => {} }) {
  const gl = lienzo.getContext('webgl2', { premultipliedAlpha: true, antialias: false })
  if (!gl) return { setTema() {}, destruir() {} }
  const pHaz = programa(gl, VERT_PLANO, FRAG_HAZ)
  const pPolvo = programa(gl, VERT_POLVO, FRAG_POLVO)

  const plano = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, plano)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const semillas = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, semillas)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(Array.from({ length: POLVO }, (_, i) => i + 0.123)), gl.STATIC_DRAW)

  const u = (p, n) => gl.getUniformLocation(p, n)
  let fuerza = FUERZA[tema === 'oscuro' ? 'oscuro' : 'claro']
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches
  const inicio = performance.now()
  let escala = 1
  let cuadro = 0

  function medir() {
    escala = Math.min(devicePixelRatio, 1.5)
    const w = Math.round(lienzo.clientWidth * escala)
    const h = Math.round(lienzo.clientHeight * escala)
    if (lienzo.width !== w || lienzo.height !== h) {
      lienzo.width = w
      lienzo.height = h
    }
  }

  function pintar(ahora) {
    medir()
    const t = reducido ? 40 : (ahora - inicio) / 1000
    const g = nubeGlobal(t)
    alNube(g)
    const W = lienzo.width, H = lienzo.height
    // fuente: más allá de la esquina superior derecha; en GL el origen está abajo
    const fuente = [W * 1.06, H * 1.12]
    const o = objetivo()
    const obj = o ? [o.x * escala, H - o.y * escala] : [W * 0.25, H * 0.15]
    gl.viewport(0, 0, W, H)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    for (const p of [pHaz, pPolvo]) {
      gl.useProgram(p)
      gl.uniform2f(u(p, 'uRes'), W, H)
      gl.uniform2f(u(p, 'uFuente'), ...fuente)
      gl.uniform2f(u(p, 'uObjetivo'), ...obj)
      gl.uniform1f(u(p, 'uTiempo'), t)
      gl.uniform1f(u(p, 'uGlobal'), g)
      gl.uniform1f(u(p, 'uFuerza'), fuerza)
    }
    gl.useProgram(pHaz)
    gl.uniform3f(u(pHaz, 'uColor'), ...COLOR)
    gl.disable(gl.BLEND)
    gl.bindBuffer(gl.ARRAY_BUFFER, plano)
    const aPos = gl.getAttribLocation(pHaz, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.disableVertexAttribArray(aPos)

    gl.useProgram(pPolvo)
    gl.uniform3f(u(pPolvo, 'uColor'), ...COLOR)
    gl.uniform1f(u(pPolvo, 'uEscala'), escala)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.bindBuffer(gl.ARRAY_BUFFER, semillas)
    const aSem = gl.getAttribLocation(pPolvo, 'aSemilla')
    gl.enableVertexAttribArray(aSem)
    gl.vertexAttribPointer(aSem, 1, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.POINTS, 0, POLVO)
    gl.disableVertexAttribArray(aSem)

    cuadro = reducido || document.hidden ? 0 : requestAnimationFrame(pintar)
  }
  const seguir = () => {
    if (!cuadro) cuadro = requestAnimationFrame(pintar)
  }
  document.addEventListener('visibilitychange', seguir)
  addEventListener('resize', seguir)
  seguir()

  return {
    setTema(t) {
      fuerza = FUERZA[t === 'oscuro' ? 'oscuro' : 'claro']
      seguir()
    },
    destruir() {
      cancelAnimationFrame(cuadro)
      cuadro = -1
      document.removeEventListener('visibilitychange', seguir)
      removeEventListener('resize', seguir)
    },
  }
}
