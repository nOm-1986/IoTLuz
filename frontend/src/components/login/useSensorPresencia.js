import { useCallback, useEffect, useState } from 'react'

/**
 * Sensor de presencia simulado, como el PIR de la sala: `activar()` cuenta como movimiento (lo
 * llaman las piezas al moverse y los mandos al tocarlos). La luz se enciende y se apaga
 * `duracionMs` después del último movimiento. Con `encendidaAlInicio`, arranca encendida.
 */
export function useSensorPresencia(duracionMs, { encendidaAlInicio = false } = {}) {
  const [ahora, setAhora] = useState(() => Date.now())
  const [hasta, setHasta] = useState(() => (encendidaAlInicio ? Date.now() + duracionMs : 0))

  const activar = useCallback(() => {
    const t = Date.now()
    setAhora(t)
    setHasta(t + duracionMs)
  }, [duracionMs])

  const restanteMs = Math.min(duracionMs, Math.max(0, hasta - ahora))
  const encendida = restanteMs > 0

  // Mientras está encendida, un reloj de 100 ms mueve la cuenta atrás y apaga al llegar a 0.
  useEffect(() => {
    if (!encendida) return undefined
    const id = setInterval(() => setAhora(Date.now()), 100)
    return () => clearInterval(id)
  }, [encendida])

  return { encendida, restanteMs, activar }
}
