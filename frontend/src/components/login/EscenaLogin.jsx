import { useMemo, useRef, useState } from 'react'
import Lampara from './Lampara.jsx'
import { prepararTacto, tocar } from './tacto.js'
import { useSensorPresencia } from './useSensorPresencia.js'

const RECORRIDO_GRADOS = 270 // la perilla recorre 270°: de abajo a la izquierda (0) a abajo a la derecha (100 %)
const limitar = (v) => Math.max(0, Math.min(1, v))

/** Proyección de impulso de Apple: hasta dónde llega un giro soltado con velocidad `v` (por s). */
const proyectar = (v, deceleracion = 0.99) => ((v / 1000) * deceleracion) / (1 - deceleracion)

/** Marca de la perilla (cada 10 %) en la que cae un valor; los extremos tienen la suya. */
const marcaDe = (v) => (v <= 0 ? 'min' : v >= 1 ? 'max' : Math.floor(v * 10 + 1e-6))

/**
 * Parte izquierda del login: la sala 3D (lámparas de aro, piezas y la consola de mandos en primer
 * plano). La perilla (intensidad) y el deslizador (duración) se dibujan en 3D; encima van
 * controles HTML invisibles que llevan la interacción real, también con teclado y lector de
 * pantalla. Es un componente aparte para que su cuenta atrás (10 veces por segundo mientras hay
 * luz) no vuelva a dibujar el formulario.
 */
export default function EscenaLogin() {
  const sala = useRef(null)
  const perilla = useRef(null)
  const deslizador = useRef(null)
  const arrastre = useRef(null)
  const [intensidad, setIntensidad] = useState(0.7)
  const [duracionS, setDuracionS] = useState(15)
  const [pulsado, setPulsado] = useState({ perilla: false, deslizador: false })
  const marcaPerilla = useRef(marcaDe(0.7))
  const duracionMs = duracionS * 1000
  // La sala empieza a oscuras: al cargar entra una esfera rodando y su movimiento la enciende.
  const { encendida, restanteMs, activar } = useSensorPresencia(duracionMs)
  const pantalla = useMemo(() => ({ encendida, restanteMs, duracionMs }), [encendida, restanteMs, duracionMs])

  const fijarIntensidad = (v) => {
    const nuevo = limitar(Math.round(v * 100) / 100)
    // Tacto al pasar por una marca de la escala; más marcado en los topes.
    const marca = marcaDe(nuevo)
    if (marca !== marcaPerilla.current) {
      tocar(typeof marca === 'string' ? 'tope' : 'marca')
      marcaPerilla.current = marca
    }
    setIntensidad(nuevo)
    activar()
  }
  // Giro circular, como una perilla real: el ángulo del puntero alrededor del centro de la
  // perilla. Hacia la derecha (sentido horario) sube, como cualquier regulador.
  const anguloPuntero = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2))
  }
  const perillaBajar = (e) => {
    prepararTacto()
    e.currentTarget.setPointerCapture(e.pointerId)
    arrastre.current = { angulo: anguloPuntero(e), v: intensidad, historial: [{ t: e.timeStamp, v: intensidad }] }
    e.currentTarget.dataset.agarrada = ''
    setPulsado((p) => ({ ...p, perilla: true })) // la pieza responde al pulsar, no al soltar
    activar()
  }
  const perillaMover = (e) => {
    const a = arrastre.current
    if (!a) return
    const ang = anguloPuntero(e)
    let delta = ang - a.angulo
    if (delta > Math.PI) delta -= 2 * Math.PI
    if (delta < -Math.PI) delta += 2 * Math.PI
    a.angulo = ang
    a.v = limitar(a.v + (delta * 180) / Math.PI / RECORRIDO_GRADOS) // en pantalla el ángulo crece en sentido horario
    a.historial.push({ t: e.timeStamp, v: a.v })
    if (a.historial.length > 6) a.historial.shift()
    fijarIntensidad(a.v)
  }
  const perillaSoltar = (e) => {
    const a = arrastre.current
    arrastre.current = null
    delete e.currentTarget.dataset.agarrada
    setPulsado((p) => ({ ...p, perilla: false }))
    // Inercia: si se suelta girando, sigue hasta donde la lleva su velocidad y frena ahí.
    if (a && a.historial.length > 1) {
      const h0 = a.historial[0]
      const h1 = a.historial[a.historial.length - 1]
      const dt = (h1.t - h0.t) / 1000
      const vel = dt > 0 && h1.t - h0.t < 120 ? (h1.v - h0.v) / dt : 0
      if (Math.abs(vel) > 0.35) fijarIntensidad(a.v + proyectar(vel))
    }
  }
  const perillaTecla = (e) => {
    prepararTacto()
    const pasos = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, PageUp: 0.2, PageDown: -0.2 }
    if (e.key in pasos) fijarIntensidad(intensidad + pasos[e.key])
    else if (e.key === 'Home') fijarIntensidad(0)
    else if (e.key === 'End') fijarIntensidad(1)
    else return
    e.preventDefault()
  }

  return (
    <section ref={sala} className="login-escena" data-encendida={encendida || undefined} aria-label="Sala">
      <h1 className="solo-lectores">IoTLuz</h1>

      <Lampara
        sala={sala}
        perilla={perilla}
        deslizador={deslizador}
        encendida={encendida}
        intensidad={intensidad}
        duracionS={duracionS}
        pantalla={pantalla}
        pulsado={pulsado}
        alMovimiento={activar} // mover una pieza es lo que ve el sensor de la sala
      />

      {/* Mandos accesibles: invisibles, encima de la perilla y el deslizador 3D. */}
      <div
        ref={perilla}
        className="mando-3d mando-perilla"
        role="slider"
        tabIndex={0}
        aria-label="Intensidad de la luz"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(intensidad * 100)}
        aria-valuetext={`${Math.round(intensidad * 100)} %`}
        onPointerDown={perillaBajar}
        onPointerMove={perillaMover}
        onPointerUp={perillaSoltar}
        onPointerCancel={perillaSoltar}
        onKeyDown={perillaTecla}
      />
      <input
        ref={deslizador}
        className="mando-3d mando-deslizador"
        type="range"
        min={1}
        max={20}
        step={1}
        value={duracionS}
        aria-label="Duración de la luz"
        aria-valuetext={`${duracionS} segundos`}
        onChange={(e) => {
          const s = Number(e.target.value)
          if (s !== duracionS) tocar(s === 1 || s === 20 ? 'tope' : 'marca') // un golpe por segundo
          setDuracionS(s)
          activar()
        }}
        onPointerDown={() => {
          prepararTacto()
          setPulsado((p) => ({ ...p, deslizador: true }))
        }}
        onPointerUp={() => setPulsado((p) => ({ ...p, deslizador: false }))}
        onPointerCancel={() => setPulsado((p) => ({ ...p, deslizador: false }))}
        onKeyDown={(e) => {
          prepararTacto()
          if (e.key.startsWith('Arrow')) setPulsado((p) => ({ ...p, deslizador: true }))
        }}
        onKeyUp={() => setPulsado((p) => ({ ...p, deslizador: false }))}
      />
    </section>
  )
}
