// Gráfica vectorial de luz ambiente dentro de una pantalla de cristal negro.
// Se dibuja a la resolución real del contenedor para que las líneas queden nítidas.
const NS = 'http://www.w3.org/2000/svg'
const el = (tag, attrs = {}, padre) => {
  const n = document.createElementNS(NS, tag)
  for (const k in attrs) n.setAttribute(k, attrs[k])
  padre?.appendChild(n)
  return n
}
// Se guarda una lectura cada ~30 s; un salto mayor es un periodo sin datos (Arduino fuera de línea).
const HUECO_MS = 90000

const hhmm = (ms) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

/**
 * `puntos`: [{ t (ms), luz, umbral, estado }] en orden. El eje X es tiempo real: de `minutos`
 * atrás hasta ahora, así un hueco sin lecturas se ve como hueco.
 */
export function grafica(contenedor) {
  if (contenedor._rk) return contenedor._rk
  let puntos = []
  let minutos = 30
  let umbralVivo = null
  const svg = el('svg', {}, contenedor)
  let W = 0, H = 0, fin = Date.now()
  const m = { i: 44, d: 64, a: 18, b: 40 }
  let cursor, medidas

  function pinta() {
    W = contenedor.clientWidth; H = contenedor.clientHeight
    if (!W || !H) return
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
    svg.replaceChildren()
    fin = Date.now()
    const inicio = fin - minutos * 60e3
    const x = (t) => m.i + ((t - inicio) / (fin - inicio)) * (W - m.i - m.d)
    const y = (v) => m.a + (1 - Math.max(0, Math.min(1023, v)) / 1023) * (H - m.a - m.b)
    const u = umbralVivo ?? puntos.at(-1)?.umbral

    // franjas azules: cuándo estuvo encendida la lámpara
    let desde = null
    puntos.forEach((p, i) => {
      const on = p.estado === 'ON'
      const sig = puntos[i + 1]
      const corta = !sig || sig.t - p.t > HUECO_MS
      if (on && desde === null) desde = p.t
      if (desde !== null && (!on || corta)) {
        const x0 = x(desde), x1 = x(on ? p.t : p.t)
        el('rect', { class: 'franja', x: x0, y: m.a, width: Math.max(1, x1 - x0), height: H - m.a - m.b }, svg)
        el('rect', { class: 'franja-base', x: x0, y: H - m.b + 6, width: Math.max(2, x1 - x0), height: 3, rx: 1.5 }, svg)
        desde = null
      }
    })

    for (const v of [0, 256, 512, 768, 1023]) {
      el('line', { class: 'rejilla', x1: m.i, x2: W - m.d, y1: y(v), y2: y(v) }, svg)
      el('text', { class: 'eje', x: m.i - 10, y: y(v) + 3.5, 'text-anchor': 'end' }, svg).textContent = v
    }
    const marcas = W < 520 ? 3 : 6
    for (let k = 0; k <= marcas; k++) {
      const t = inicio + (k / marcas) * (fin - inicio)
      el('line', { class: 'rejilla', x1: x(t), x2: x(t), y1: H - m.b, y2: H - m.b + 4 }, svg)
      el('text', { class: 'eje', x: x(t), y: H - m.b + 24, 'text-anchor': k === 0 ? 'start' : k === marcas ? 'end' : 'middle' }, svg)
        .textContent = k === marcas ? 'AHORA' : hhmm(t)
    }

    // tramos continuos (se cortan en los huecos en vez de inventar datos)
    const tramos = []
    puntos.forEach((p, i) => {
      if (p.luz == null) return
      if (i === 0 || p.t - puntos[i - 1].t > HUECO_MS || !tramos.length) tramos.push([])
      tramos.at(-1).push(p)
    })
    const defs = el('defs', {}, svg)
    const grad = el('linearGradient', { id: 'rk-relleno', x1: 0, x2: 0, y1: 0, y2: 1 }, defs)
    el('stop', { offset: 0, 'stop-color': '#f3f2ee', 'stop-opacity': 0.16 }, grad)
    el('stop', { offset: 1, 'stop-color': '#f3f2ee', 'stop-opacity': 0 }, grad)
    for (const tr of tramos) {
      const camino = tr.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.luz).toFixed(1)}`).join('')
      el('path', { d: `${camino}L${x(tr.at(-1).t)},${H - m.b}L${x(tr[0].t)},${H - m.b}Z`, fill: 'url(#rk-relleno)' }, svg)
      el('path', { class: 'linea', d: camino }, svg)
    }

    if (u != null) {
      el('line', { class: 'umbral', x1: m.i, x2: W - m.d, y1: y(u), y2: y(u) }, svg)
      el('text', { class: 'nar', x: W - m.d + 8, y: y(u) + 3.5 }, svg).textContent = 'UMBRAL'
      el('text', { class: 'nar', x: W - m.d + 8, y: y(u) + 16 }, svg).textContent = u
    }

    const ult = puntos.at(-1)
    if (ult?.luz != null) {
      el('circle', { cx: x(ult.t), cy: y(ult.luz), r: 3.5, fill: '#f3f2ee' }, svg)
      el('text', { x: W - m.d + 8, y: y(ult.luz) + (u != null && Math.abs(y(ult.luz) - y(u)) < 26 ? 30 : 3.5) }, svg).textContent = ult.luz
    }
    if (!puntos.length) {
      el('text', { class: 'eje', x: (W - m.d + m.i) / 2, y: (H - m.b + m.a) / 2, 'text-anchor': 'middle' }, svg).textContent = 'SIN LECTURAS EN ESTE RANGO'
    }

    el('text', { class: 'azul-t', x: m.i - 10, y: H - m.b + 10.5, 'text-anchor': 'end' }, svg).textContent = 'ON'

    cursor = el('g', { style: 'display:none' }, svg)
    el('line', { class: 'cursor', y1: m.a, y2: H - m.b }, cursor)
    el('circle', { r: 4, fill: '#0b0b0b', stroke: '#f3f2ee', 'stroke-width': 1.5 }, cursor)
    el('text', { 'text-anchor': 'middle', y: m.a - 6 }, cursor)
    medidas = { x, y, inicio }
  }

  svg.addEventListener('pointermove', (e) => {
    if (!medidas || !puntos.length) return
    const r = svg.getBoundingClientRect()
    const px = e.clientX - r.left
    if (px < m.i || px > W - m.d) { cursor.style.display = 'none'; return }
    const t = medidas.inicio + ((px - m.i) / (W - m.i - m.d)) * (fin - medidas.inicio)
    let p = puntos[0]
    for (const q of puntos) if (Math.abs(q.t - t) < Math.abs(p.t - t)) p = q
    if (p.luz == null || Math.abs(p.t - t) > HUECO_MS) { cursor.style.display = 'none'; return }
    const cx = medidas.x(p.t), cy = medidas.y(p.luz)
    cursor.style.display = ''
    const [linea, punto, texto] = cursor.children
    linea.setAttribute('x1', cx); linea.setAttribute('x2', cx)
    punto.setAttribute('cx', cx); punto.setAttribute('cy', cy)
    texto.setAttribute('x', Math.max(m.i + 50, Math.min(W - m.d - 50, cx)))
    texto.textContent = `${hhmm(p.t)}  ·  ${p.luz}  ·  ${p.estado === 'ON' ? 'ENCENDIDA' : 'APAGADA'}`
  })
  svg.addEventListener('pointerleave', () => cursor && (cursor.style.display = 'none'))

  new ResizeObserver(pinta).observe(contenedor)
  contenedor._rk = {
    pinta,
    poner(lista, min) { puntos = lista; minutos = min; pinta() },
    umbral(v) { umbralVivo = v; pinta() },
  }
  return contenedor._rk
}
