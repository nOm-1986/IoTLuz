// Pantalla OLED de la consola, en HTML (SVG de píxeles), al estilo de las pantallas de Teenage
// Engineering. Va en HTML y no pintada en 3D para que los píxeles salgan nítidos a cualquier tamaño;
// escena3d.js la coloca exactamente sobre la ventana de cristal de la consola (CSS3DRenderer).
// Una OLED emite su propia luz: no necesita la iluminación de la escena; su brillo es un filtro CSS.

import { anchoTexto, celdas as celdasFuente, icono } from './pixeles.js'

// La consola solo escribe en mayúsculas, como su serigrafía.
const celdas = (texto, x, y, e) => celdasFuente(String(texto).toUpperCase(), x, y, e)

// Rejilla de la pantalla: 232 × 66 píxeles OLED (la ventana mide 0,292 × 0,084 m).
export const OLED = { ancho: 232, alto: 66 }

const rects = (lista, clase) =>
  lista.map(([x, y, e]) => `<rect class="${clase}" x="${x}" y="${y}" width="${e}" height="${e}"/>`).join('')

/** Crea el elemento de la pantalla. `actualizar(datos)` lo redibuja (barato: SVG de rectángulos). */
export function crearOled() {
  const el = document.createElement('div')
  el.className = 'oled'
  el.setAttribute('aria-hidden', 'true')
  el.style.width = `${OLED.ancho * 4}px` // 4 px CSS por píxel OLED: nítido al proyectarlo
  el.style.height = `${OLED.alto * 4}px`

  const actualizar = ({ encendida, restanteMs, duracionMs, intensidad, duracionS }) => {
    const W = OLED.ancho
    const tenue = []
    const luz = []
    const fuerte = encendida ? luz : tenue

    // Fila superior: sensor y luz, con sus iconos.
    tenue.push(...icono('sensor', 3, 3))
    tenue.push(...celdas('SENSOR', 13, 3))
    const estado = encendida ? 'MOVIMIENTO' : 'EN REPOSO'
    fuerte.push(...celdas(estado, W - 3 - anchoTexto(estado), 3))

    // Cifra grande: segundos que le quedan a la luz.
    const seg = (Math.ceil(restanteMs / 100) / 10).toFixed(1).replace('.', ',')
    fuerte.push(...celdas(seg, 3, 17, 4))
    tenue.push(...celdas('S', 3 + anchoTexto(seg, 4) + 4, 35, 1))

    // Columna derecha: luz, intensidad y duración.
    tenue.push(...icono('bombilla', W - 3 - anchoTexto('ENCENDIDA') - 11, 17))
    fuerte.push(...celdas(encendida ? 'ENCENDIDA' : 'APAGADA', W - 3 - anchoTexto(encendida ? 'ENCENDIDA' : 'APAGADA'), 17))
    const int = `${Math.round(intensidad * 100)}%`
    tenue.push(...celdas('INT', W - 3 - anchoTexto('ENCENDIDA'), 29))
    luz.push(...celdas(int, W - 3 - anchoTexto(int), 29))
    const dur = `${duracionS}S`
    tenue.push(...celdas('DUR', W - 3 - anchoTexto('ENCENDIDA'), 39))
    luz.push(...celdas(dur, W - 3 - anchoTexto(dur), 39))

    // Barra de bloques: lo que queda de la luz.
    const bloques = 29
    const f = encendida ? Math.max(0, Math.min(1, restanteMs / duracionMs)) : 0
    const llenos = Math.ceil(f * bloques)
    const paso = (W - 6) / bloques
    const barra = []
    const vacia = []
    for (let i = 0; i < bloques; i++) {
      const x = Math.round(3 + i * paso)
      ;(i < llenos ? barra : vacia).push(`<rect x="${x}" y="54" width="${Math.max(1, Math.round(paso) - 2)}" height="8"/>`)
    }

    el.innerHTML = `<svg viewBox="0 0 ${W} ${OLED.alto}" shape-rendering="crispEdges" preserveAspectRatio="none">
      <g class="oled-tenue">${rects(tenue, '')}${vacia.join('')}</g>
      <g class="oled-luz">${rects(luz, '')}${barra.join('')}</g>
    </svg>`
    el.dataset.encendida = encendida ? '1' : '0'
  }
  return { el, actualizar }
}
