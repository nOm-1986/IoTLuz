import { useEffect, useRef, useState } from 'react'

const reducido = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * Sala 3D del login: el lienzo ocupa toda la sala (`sala`), que es también donde se arrastran las
 * piezas. Coloca encima de la rueda y el fader los controles HTML accesibles (`perilla`,
 * `deslizador`), que son invisibles y llevan la interacción real; la escena 3D solo los dibuja.
 * `alMovimiento` se llama cuando alguna pieza se mueve (el sensor de presencia de la sala).
 */
export default function Lampara({ sala, perilla, deslizador, encendida, intensidad, duracionS, pantalla, pulsado, alEstarLista, alMovimiento }) {
  const avisoLista = useRef(alEstarLista)
  avisoLista.current = alEstarLista
  const avisoMovimiento = useRef(alMovimiento)
  avisoMovimiento.current = alMovimiento
  const lienzo = useRef(null)
  const control = useRef(null)
  const [estado, setEstado] = useState('cargando') // 'cargando' | 'lista' | 'sin-3d'

  useEffect(() => {
    let vigente = true
    let limpiar = () => {}
    import('./escena3d.js')
      .then(({ crearEscena }) => {
        const cont = lienzo.current
        const s = sala.current
        if (!vigente || !cont || !s) return

        const recolocar = () => {
          c.colocar({ ancho: s.clientWidth, alto: s.clientHeight })
          const p = c.posiciones()
          if (!p) return
          if (perilla.current) {
            const d = p.perilla.radio * 2.3
            Object.assign(perilla.current.style, {
              left: `${p.perilla.x - d / 2}px`,
              top: `${p.perilla.y - d / 2}px`,
              width: `${d}px`,
              height: `${d}px`,
            })
          }
          if (deslizador.current) {
            // El rango nativo pone el centro del pulgar a medio pulgar de cada extremo: se alarga
            // en un pulgar para que el valor caiga justo bajo el tirador 3D.
            const { x0, y0, x1, y1 } = p.deslizador
            const largo = Math.hypot(x1 - x0, y1 - y0)
            const pulgar = Math.max(24, largo * 0.08)
            Object.assign(deslizador.current.style, {
              left: `${(x0 + x1) / 2 - (largo + pulgar) / 2}px`,
              top: `${(y0 + y1) / 2 - 18}px`,
              width: `${largo + pulgar}px`,
              height: '36px',
              transform: `rotate(${Math.atan2(y1 - y0, x1 - x0)}rad)`,
            })
            deslizador.current.style.setProperty('--pulgar', `${pulgar}px`)
          }
        }

        const c = crearEscena(cont, {
          reducido: reducido(),
          dom: s,
          alMover: () => avisoMovimiento.current?.(),
          alCargar: () => {
            if (!vigente) return
            recolocar()
            avisoLista.current?.() // la sala ya se ve
          },
        })
        control.current = c
        recolocar()
        const observador = new ResizeObserver(recolocar)
        observador.observe(s)
        limpiar = () => {
          observador.disconnect()
          c.destruir()
        }
        setEstado('lista')
      })
      .catch(() => vigente && setEstado('sin-3d'))
    return () => {
      vigente = false
      limpiar()
      control.current = null
    }
  }, [sala, perilla, deslizador])

  useEffect(() => {
    control.current?.setEncendida(encendida)
  }, [encendida, estado])

  useEffect(() => {
    control.current?.setIntensidad(intensidad)
  }, [intensidad, estado])

  useEffect(() => {
    control.current?.setDuracion(duracionS)
  }, [duracionS, estado])

  useEffect(() => {
    control.current?.setPantalla(pantalla)
  }, [pantalla, estado])

  useEffect(() => {
    control.current?.setPulsado(pulsado)
  }, [pulsado, estado])

  return <div ref={lienzo} className="lampara" data-estado={estado} aria-hidden="true" />
}
