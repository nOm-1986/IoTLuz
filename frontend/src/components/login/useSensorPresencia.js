import { useEffect, useRef, useState } from 'react'

const MARGEN_PX = 56 // "cerca": dentro de la zona o a menos de esta distancia de su borde

/**
 * Sensor de presencia simulado, como el PIR de la sala: si el puntero pasa cerca de `zona`
 * (o se toca), la luz se enciende y se apaga `duracionMs` después del último movimiento.
 * También devuelve `apunte` (ref con {x, y} en [-1, 1]) para que la bombilla mire al puntero;
 * vuelve a {0, 0} cuando el puntero sale de la ventana o termina un toque.
 */
export function useSensorPresencia(zona, duracionMs) {
  const [hasta, setHasta] = useState(0)
  const [ahora, setAhora] = useState(() => Date.now())
  const ultimoAviso = useRef(0)
  const apunte = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const detectar = (e) => {
      const el = zona.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      apunte.current = {
        x: Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width / 2 + MARGEN_PX))),
        y: Math.max(-1, Math.min(1, (e.clientY - cy) / (r.height / 2 + MARGEN_PX))),
      }
      const cerca =
        e.clientX > r.left - MARGEN_PX &&
        e.clientX < r.right + MARGEN_PX &&
        e.clientY > r.top - MARGEN_PX &&
        e.clientY < r.bottom + MARGEN_PX
      if (!cerca) return
      const t = Date.now()
      // Solo se avisa a React cada 200 ms como mucho (no en cada píxel de movimiento).
      // "ahora" y "hasta" se fijan juntos: la cuenta atrás nunca pasa de la duración.
      if (t - ultimoAviso.current > 200) {
        ultimoAviso.current = t
        setAhora(t)
        setHasta(t + duracionMs)
      }
    }
    const centrar = () => {
      apunte.current = { x: 0, y: 0 }
    }
    const soltar = (e) => {
      if (e.pointerType !== 'mouse') centrar()
    }
    const salir = (e) => {
      if (!e.relatedTarget) centrar()
    }
    window.addEventListener('pointermove', detectar, { passive: true })
    window.addEventListener('pointerdown', detectar, { passive: true })
    window.addEventListener('pointerup', soltar, { passive: true })
    window.addEventListener('pointercancel', centrar, { passive: true })
    document.addEventListener('pointerout', salir, { passive: true })
    window.addEventListener('blur', centrar)
    return () => {
      window.removeEventListener('pointermove', detectar)
      window.removeEventListener('pointerdown', detectar)
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', centrar)
      document.removeEventListener('pointerout', salir)
      window.removeEventListener('blur', centrar)
    }
  }, [zona, duracionMs])

  const restanteMs = Math.min(duracionMs, Math.max(0, hasta - ahora))
  const encendida = restanteMs > 0

  // Mientras está encendida, un reloj de 100 ms mueve la cuenta atrás y apaga al llegar a 0.
  useEffect(() => {
    if (!encendida) return undefined
    const id = setInterval(() => setAhora(Date.now()), 100)
    return () => clearInterval(id)
  }, [encendida])

  return { encendida, restanteMs, apunte }
}
