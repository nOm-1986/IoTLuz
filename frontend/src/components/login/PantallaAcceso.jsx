import { useLayoutEffect, useRef, useState } from 'react'
import { anchoTexto, celdas, icono, trazado } from './pixeles.js'

// Pantalla OLED del acceso: la misma pantalla de píxeles que la consola, con dos filas (usuario y
// contraseña) y una fila de estado. Lo que escribes se dibuja en píxeles; debajo hay dos <input>
// de verdad, invisibles, encima de su fila: el teclado, el lector de pantalla, el autocompletado y
// el gestor de contraseñas siguen funcionando como en cualquier formulario.

const P = 2 // px CSS por píxel de la pantalla (entero: píxeles nítidos)
const E = 2 // escala de lo que escribes (la etiqueta y el estado van a escala 1)
const AVANCE = 6 * E
const MARGEN = 5
const ALTO_FILA = 36
const Y_ESTADO = ALTO_FILA * 2 + 5
const ALTO = Y_ESTADO + 12
const FILAS = [
  { campo: 'usuario', etiqueta: 'USUARIO', numero: '01' },
  { campo: 'clave', etiqueta: 'CONTRASEÑA', numero: '02' },
]

/** Primer carácter visible de la fila: el cursor siempre queda dentro de la ventana. */
const inicioVisible = (cursor, visibles) => Math.max(0, cursor - visibles + 1)

export default function PantallaAcceso({ valores, alCambiar, guardados, estado, refs, autoFocus }) {
  const marco = useRef(null)
  const [columnas, setColumnas] = useState(120)
  const [foco, setFoco] = useState(null)
  const [seleccion, setSeleccion] = useState({ usuario: [0, 0], clave: [0, 0] })
  const [mayusculas, setMayusculas] = useState(false)
  const inicios = useRef({ usuario: 0, clave: 0 })

  useLayoutEffect(() => {
    const medir = () => setColumnas(Math.max(120, Math.floor(marco.current.clientWidth / P)))
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(marco.current)
    return () => observador.disconnect()
  }, [])

  const leerSeleccion = (campo) => {
    const el = refs[campo].current
    if (!el) return
    const s = el.selectionStart ?? el.value.length
    const f = el.selectionEnd ?? s
    setSeleccion((anterior) =>
      anterior[campo][0] === s && anterior[campo][1] === f ? anterior : { ...anterior, [campo]: [s, f] },
    )
  }
  const leerMayusculas = (e) => setMayusculas(e.getModifierState?.('CapsLock') ?? false)

  // Pulsar en la fila pone el cursor justo en el carácter pulsado (el <input> es invisible y sus
  // propias medidas no coinciden con los píxeles dibujados).
  const pulsarFila = (campo) => (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = refs[campo].current
    const caja = el.getBoundingClientRect()
    const x = (e.clientX - caja.left) / P - MARGEN
    const indice = Math.min(el.value.length, Math.max(0, inicios.current[campo] + Math.round(x / AVANCE)))
    el.focus()
    el.setSelectionRange(indice, indice)
    leerSeleccion(campo)
  }

  // ---- Dibujo ------------------------------------------------------------------------------
  const tenue = []
  const luz = []
  const hueco = [] // píxeles apagados sobre un fondo encendido (texto seleccionado)
  const cursores = []
  const visibles = Math.floor((columnas - MARGEN * 2 + E) / AVANCE)

  FILAS.forEach(({ campo, etiqueta, numero }, i) => {
    const y0 = i * ALTO_FILA
    const activa = foco === campo
    const valor = valores[campo]
    const texto = Array.from(campo === 'clave' ? '•'.repeat(valor.length) : valor)
    ;(activa ? luz : tenue).push(...celdas(etiqueta, MARGEN, y0 + 5))
    tenue.push(...celdas(numero, columnas - MARGEN - anchoTexto(numero), y0 + 5))

    const [s, f] = activa ? seleccion[campo] : [texto.length, texto.length]
    const inicio = inicioVisible(activa ? f : texto.length, visibles)
    inicios.current[campo] = inicio
    const yTexto = y0 + 15
    texto.slice(inicio, inicio + visibles).forEach((ch, c) => {
      const indice = inicio + c
      const elegido = activa && s !== f && indice >= s && indice < f
      ;(elegido ? hueco : luz).push(...celdas(ch, MARGEN + c * AVANCE, yTexto, E))
    })
    if (activa && s !== f) {
      const a = Math.max(s, inicio) - inicio
      const b = Math.min(f, inicio + visibles) - inicio
      for (let c = a; c < b; c++) {
        for (let fy = -1; fy < 15; fy++) {
          for (let fx = -1; fx < AVANCE - 1; fx++) luz.push([MARGEN + c * AVANCE + fx, yTexto + fy, 1])
        }
      }
    }
    if (!texto.length && !activa) {
      if (guardados[campo]) tenue.push(...celdas(campo === 'clave' ? '••••••••' : 'guardado', MARGEN, yTexto, E))
      else tenue.push(...celdas('_', MARGEN, yTexto, E))
    }
    if (activa && s === f) {
      const c = f - inicio
      const x = MARGEN + c * AVANCE
      // Al final, cursor de bloque; entre letras, una barra en el aire entre dos glifos.
      if (f >= texto.length) cursores.push([x, yTexto, 5 * E, 7 * E])
      else cursores.push([x - E, yTexto - 1, E, 7 * E + 2])
    }
    for (let x = MARGEN; x < columnas - MARGEN; x += 2) tenue.push([x, y0 + ALTO_FILA - 1, 1])
  })

  // Fila de estado: qué está pasando, y a la derecha la tecla que toca.
  const yE = Y_ESTADO
  const avisoMayus = foco === 'clave' && mayusculas && estado.tipo !== 'enviando'
  const linea = avisoMayus
    ? { icono: 'aviso', texto: 'BLOQ MAYÚS', tono: 'luz' }
    : estado.tipo === 'enviando'
      ? { icono: 'abierto', texto: 'ENTRANDO', tono: 'luz', puntos: true }
      : estado.tipo === 'error'
        ? { icono: 'aviso', texto: estado.texto, tono: 'luz', parpadeo: true }
        : { icono: 'candado', texto: 'LISTO', tono: 'tenue' }
  const iconoEstado = icono(linea.icono, MARGEN, yE)
  ;(linea.parpadeo ? cursores : linea.tono === 'luz' ? luz : tenue).push(
    ...(linea.parpadeo ? iconoEstado.map(([x, y]) => [x, y, 1, 1]) : iconoEstado),
  )
  ;(linea.tono === 'luz' ? luz : tenue).push(...celdas(linea.texto, MARGEN + 11, yE))
  const puntos = linea.puntos
    ? [0, 1, 2].map((n) => trazado(celdas('.', MARGEN + 11 + anchoTexto(linea.texto) + 1 + n * 4, yE)))
    : []
  const listos = (valores.usuario || guardados.usuario) && (valores.clave || guardados.clave)
  const rotulo = 'ENTRAR'
  const xRotulo = columnas - MARGEN - anchoTexto(rotulo)
  if (xRotulo - 10 > MARGEN + 11 + anchoTexto(linea.texto) + 16) {
    ;(listos ? luz : tenue).push(...celdas(rotulo, xRotulo, yE), ...icono('intro', xRotulo - 10, yE))
  }

  const cursor = cursores.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h${-w}z`).join('')
  const claveCursor = `${foco}-${valores[foco] ?? ''}-${foco ? seleccion[foco].join() : ''}-${estado.tipo}`

  return (
    <div className="pantalla" ref={marco} data-foco={foco ?? undefined} data-estado={estado.tipo}>
      <svg
        className="pantalla-pixeles"
        width={columnas * P}
        height={ALTO * P}
        viewBox={`0 0 ${columnas} ${ALTO}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path className="pantalla-tenue" d={trazado(tenue)} />
        <path className="pantalla-luz" d={trazado(luz)} />
        <path className="pantalla-hueco" d={trazado(hueco)} />
        {cursor && <path key={claveCursor} className="pantalla-luz pantalla-cursor" d={cursor} />}
        {puntos.map((d, n) => (
          <path key={n} className="pantalla-luz pantalla-punto" style={{ '--n': n }} d={d} />
        ))}
      </svg>
      {FILAS.map(({ campo }, i) => (
        <div key={campo} className="pantalla-fila" style={{ top: i * ALTO_FILA * P, height: ALTO_FILA * P }}>
          <label className="solo-lector" htmlFor={`acceso-${campo}`}>
            {campo === 'clave' ? 'Contraseña' : 'Usuario'}
          </label>
          <input
            ref={refs[campo]}
            id={`acceso-${campo}`}
            name={campo === 'clave' ? 'password' : 'username'}
            className="pantalla-input"
            type={campo === 'clave' ? 'password' : 'text'}
            autoComplete={campo === 'clave' ? 'current-password' : 'username'}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus={autoFocus && campo === 'usuario'}
            value={valores[campo]}
            onChange={(e) => {
              alCambiar(campo, e.target.value)
              leerSeleccion(campo)
            }}
            onSelect={() => leerSeleccion(campo)}
            onFocus={() => {
              setFoco(campo)
              leerSeleccion(campo)
            }}
            onBlur={() => setFoco((f) => (f === campo ? null : f))}
            onKeyDown={leerMayusculas}
            onKeyUp={leerMayusculas}
            onMouseDown={pulsarFila(campo)}
            onDoubleClick={(e) => {
              e.currentTarget.select()
              leerSeleccion(campo)
            }}
            onAnimationStart={(e) => {
              if (e.animationName === 'autorrelleno') alCambiar(campo, e.currentTarget.value, true)
            }}
          />
        </div>
      ))}
    </div>
  )
}
