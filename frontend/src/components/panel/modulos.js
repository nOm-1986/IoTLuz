// Maqueta D: piezas del rack. Pantallas a color (píxeles + dígitos de segmentos) y mandos que se
// arrastran con tacto (clic suave en cada marca, golpe en los topes).
import { anchoTexto, celdas, icono, trazado } from '../login/pixeles.js'
import { tocar, prepararTacto } from '../login/tacto.js'

const SEGMENTOS = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  '-': 'g', ' ': '', h: 'fegc', e: 'afged', a: 'abcefg', s: 'afgcd', o: 'gcde', n: 'ceg', f: 'afge', r: 'eg',
}

/** Dígitos de 7 segmentos (hexágonos). Devuelve { luz, apagado } en `d` de <path>; los segmentos
 * apagados se pintan muy tenues, como el fantasma de un LCD de verdad. */
export function segmentos(texto, x, y, alto, { grosor = alto * 0.13, hueco = alto * 0.025 } = {}) {
  const ancho = alto * 0.52
  const paso = ancho + alto * 0.2
  const t = grosor
  const h = (x0, x1, yc) => `M${x0} ${yc}l${t / 2} ${-t / 2}H${x1 - t / 2}l${t / 2} ${t / 2}l${-t / 2} ${t / 2}H${x0 + t / 2}z`
  const v = (xc, y0, y1) => `M${xc} ${y0}l${t / 2} ${t / 2}V${y1 - t / 2}l${-t / 2} ${t / 2}l${-t / 2} ${-t / 2}V${y0 + t / 2}z`
  let luz = ''
  let apagado = ''
  let cx = x
  for (const c of String(texto).toLowerCase()) {
    if (c === ',' || c === '.') {
      luz += `M${cx - alto * 0.14} ${y + alto - t}h${t}v${t}h${-t}z`
      continue
    }
    const x0 = cx + t / 2 + hueco
    const x1 = cx + ancho - t / 2 - hueco
    const formas = {
      a: h(x0, x1, y + t / 2),
      g: h(x0, x1, y + alto / 2),
      d: h(x0, x1, y + alto - t / 2),
      f: v(cx + t / 2, y + t / 2 + hueco, y + alto / 2 - hueco),
      b: v(cx + ancho - t / 2, y + t / 2 + hueco, y + alto / 2 - hueco),
      e: v(cx + t / 2, y + alto / 2 + hueco, y + alto - t / 2 - hueco),
      c: v(cx + ancho - t / 2, y + alto / 2 + hueco, y + alto - t / 2 - hueco),
    }
    const encendidos = SEGMENTOS[c] ?? ''
    for (const [s, d] of Object.entries(formas)) encendidos.includes(s) ? (luz += d) : (apagado += d)
    cx += paso
  }
  return { luz, apagado, ancho: cx - x - alto * 0.2 }
}

export const anchoSegmentos = (texto, alto) => {
  const n = [...String(texto)].filter((c) => c !== ',' && c !== '.').length
  return n * (alto * 0.72) - alto * 0.2
}

/**
 * Pinta una pantalla. `capas`: lista de piezas
 *  { t, x, y, e, color, derecha }            texto en píxeles
 *  { icono, x, y, e, color }                 icono en píxeles
 *  { seg, x, y, alto, color, derecha }        dígitos de segmentos
 *  { celdas: [[x,y,e]...], color }            píxeles sueltos
 * color: luz | tenue | nar | azul | verde | roja
 */
export function pinta(svg, ancho, alto, capas) {
  const pix = {}
  const vect = {}
  const mas = (obj, color, d) => (obj[color] = (obj[color] ?? '') + d)
  for (const c of capas) {
    const color = c.color ?? 'luz'
    if (c.seg !== undefined) {
      const x = c.derecha ? ancho - c.x - anchoSegmentos(c.seg, c.alto) : c.x
      const s = segmentos(c.seg, x, c.y, c.alto)
      mas(vect, color, s.luz)
      mas(vect, 'apagado', s.apagado)
    } else if (c.celdas) {
      mas(pix, color, trazado(c.celdas))
    } else {
      const e = c.e ?? 1
      const x = c.derecha ? ancho - c.x - (c.icono ? 7 * e : anchoTexto(c.t, e)) : c.x
      mas(pix, color, trazado(c.icono ? icono(c.icono, x, c.y, e) : celdas(c.t, x, c.y, e)))
    }
  }
  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`)
  svg.innerHTML =
    Object.entries(vect).map(([k, d]) => `<path class="${k}" d="${d}"/>`).join('') +
    `<g shape-rendering="crispEdges">${Object.entries(pix).map(([k, d]) => `<path class="${k}" d="${d}"/>`).join('')}</g>`
}

/** Perilla: se gira arrastrando arriba/abajo (o con la rueda del ratón / flechas). 270° de recorrido. */
export function perilla(zona, op) {
  // React (StrictMode) puede montar dos veces el mismo nodo: una sola instancia por nodo.
  if (zona._rk) return zona._rk
  const { min = 0, max = 1023, paso = 8, marcas = 27 } = op
  let valor = op.valor ?? 0
  const alCambiar = (v) => op.alCambiar?.(v)
  let espera
  const soltarTarde = () => { clearTimeout(espera); espera = setTimeout(() => op.alSoltar?.(valor), 450) }
  const knob = zona.querySelector('.perilla')
  const svg = zona.querySelector('svg.marcas')
  svg.setAttribute('viewBox', '-50 -50 100 100')
  svg.innerHTML = Array.from({ length: marcas }, (_, i) => {
    const a = ((-135 + (270 * i) / (marcas - 1)) * Math.PI) / 180
    const r0 = i % 13 === 0 ? 40 : 42
    return `<line class="m" data-i="${i}" x1="${Math.sin(a) * r0}" y1="${-Math.cos(a) * r0}" x2="${Math.sin(a) * 46}" y2="${-Math.cos(a) * 46}"/>`
  }).join('')
  const lineas = [...svg.querySelectorAll('.m')]
  zona.tabIndex = 0
  zona.setAttribute('role', 'slider')
  zona.setAttribute('aria-valuemin', min)
  zona.setAttribute('aria-valuemax', max)

  const poner = (v, conTacto = true) => {
    const nuevo = Math.max(min, Math.min(max, Math.round(v / paso) * paso))
    if (nuevo === valor && conTacto) return
    const antes = valor
    valor = nuevo
    const p = (valor - min) / (max - min)
    knob.style.setProperty('--angulo', `${-135 + 270 * p}deg`)
    lineas.forEach((l, i) => l.classList.toggle('on', i / (marcas - 1) <= p + 1e-6))
    zona.setAttribute('aria-valuenow', valor)
    if (conTacto) {
      if (valor === min || valor === max) tocar('tope')
      else if (Math.floor(antes / (paso * 4)) !== Math.floor(valor / (paso * 4))) tocar('marca')
    }
    alCambiar(valor)
  }
  let inicio = null
  zona.addEventListener('pointerdown', (e) => {
    prepararTacto()
    zona.setPointerCapture(e.pointerId)
    inicio = { y: e.clientY, x: e.clientX, v: valor }
  })
  zona.addEventListener('pointermove', (e) => {
    if (!inicio) return
    // 220 px de arrastre = recorrido entero; vale arriba/abajo y también derecha/izquierda.
    const d = inicio.y - e.clientY + (e.clientX - inicio.x)
    poner(inicio.v + (d / 220) * (max - min))
  })
  const soltar = () => {
    if (inicio && inicio.v !== valor) op.alSoltar?.(valor)
    inicio = null
  }
  zona.addEventListener('pointerup', soltar)
  zona.addEventListener('pointercancel', soltar)
  zona.addEventListener('wheel', (e) => {
    e.preventDefault()
    poner(valor - Math.sign(e.deltaY) * paso * 2)
    soltarTarde()
  }, { passive: false })
  zona.addEventListener('keydown', (e) => {
    const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]
    if (!d) return
    e.preventDefault()
    poner(valor + d * paso * (e.shiftKey ? 8 : 1))
    soltarTarde()
  })
  const v0 = valor
  valor = NaN
  poner(v0, false)
  zona._rk = {
    get valor() { return valor },
    get tocando() { return inicio !== null },
    /** Pone el valor desde fuera (lo que confirma el Arduino) sin sonar. */
    poner: (v) => { if (inicio === null && v !== valor) { valor = NaN; poner(v, false) } },
  }
  return zona._rk
}

/** Fader horizontal. `escala(p)` pasa de 0..1 al valor; un clic en la ranura salta con muelle. */
export function fader(zona, op) {
  if (zona._rk) return zona._rk
  const { p = 0, pasos = 40 } = op
  const alCambiar = (v) => op.alCambiar?.(v)
  let espera
  const soltarTarde = () => { clearTimeout(espera); espera = setTimeout(() => op.alSoltar?.(actual), 450) }
  zona.innerHTML = `<div class="escala">${'<i></i>'.repeat(21)}</div><div class="ranura"><div class="relleno"></div></div><div class="capuchon"></div>`
  zona.tabIndex = 0
  zona.setAttribute('role', 'slider')
  const cap = zona.querySelector('.capuchon')
  let actual = -1
  const poner = (np, conTacto = true) => {
    np = Math.max(0, Math.min(1, np))
    const paso = Math.round(np * pasos)
    if (conTacto && paso !== Math.round(actual * pasos)) tocar(paso === 0 || paso === pasos ? 'tope' : 'marca')
    actual = np
    zona.style.setProperty('--v', np)
    alCambiar(np)
  }
  const aP = (x) => {
    const r = zona.getBoundingClientRect()
    return (x - r.left - 11) / (r.width - 22)
  }
  let agarre = null
  zona.addEventListener('pointerdown', (e) => {
    prepararTacto()
    zona.setPointerCapture(e.pointerId)
    if (e.target === cap) {
      agarre = aP(e.clientX) - actual
    } else {
      // clic fuera del capuchón: salta hasta ahí con un pequeño rebote, y desde ahí se arrastra
      zona.classList.add('animado')
      agarre = 0
      poner(aP(e.clientX))
      setTimeout(() => zona.classList.remove('animado'), 420)
    }
  })
  zona.addEventListener('pointermove', (e) => agarre !== null && !zona.classList.contains('animado') && poner(aP(e.clientX) - agarre))
  const soltar = () => {
    if (agarre !== null) op.alSoltar?.(actual)
    agarre = null
  }
  zona.addEventListener('pointerup', soltar)
  zona.addEventListener('pointercancel', soltar)
  zona.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]
    if (!d) return
    e.preventDefault()
    poner(actual + d / pasos)
    soltarTarde()
  })
  poner(p, false)
  zona._rk = {
    poner: (np) => { if (agarre === null && Math.abs(np - actual) > 1e-4) poner(np, false) },
  }
  return zona._rk
}

/** Teclas de goma: suena al bajar, no al soltar (como una tecla de verdad). */
export function sonarTecla() {
  prepararTacto()
  tocar('tope')
}
