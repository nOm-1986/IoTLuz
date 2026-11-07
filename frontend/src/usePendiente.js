import { useEffect, useRef, useState } from 'react'

const ESPERA_CONFIRMACION_MS = 10000

/**
 * Orden pendiente de confirmación: se considera aplicada cuando el valor que publica
 * el Arduino (llega por WebSocket) coincide con lo pedido.
 */
export function usePendiente(confirmado) {
  const [pendiente, setPendiente] = useState(null)
  const [aviso, setAviso] = useState('')
  const temporizador = useRef()

  useEffect(() => {
    if (pendiente != null && confirmado === pendiente) {
      clearTimeout(temporizador.current)
      setPendiente(null)
      setAviso('')
    }
  }, [confirmado, pendiente])

  useEffect(() => () => clearTimeout(temporizador.current), [])

  const iniciar = (valor) => {
    setAviso('')
    setPendiente(valor)
    clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => {
      setPendiente(null)
      setAviso('El Arduino no confirmó el cambio.')
    }, ESPERA_CONFIRMACION_MS)
  }
  const fallar = (mensaje) => {
    clearTimeout(temporizador.current)
    setPendiente(null)
    setAviso(mensaje)
  }
  return { pendiente, aviso, iniciar, fallar }
}
