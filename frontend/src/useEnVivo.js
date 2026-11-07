import { useEffect, useRef, useState } from 'react'
import { urlWebSocket } from './api.js'

// Códigos de cierre que usa el backend cuando el token no sirve.
const CIERRES_DE_SESION = new Set([4401, 4402])

/**
 * Conexión WebSocket con reconexión automática (espera creciente hasta 15 s).
 * Devuelve el último estado recibido y si la conexión en vivo está activa.
 */
export function useEnVivo(token, alExpirar) {
  const [estado, setEstado] = useState(null)
  const [conectado, setConectado] = useState(false)
  const [intentos, setIntentos] = useState(0)
  const alExpirarRef = useRef(alExpirar)
  alExpirarRef.current = alExpirar

  useEffect(() => {
    if (!token) return undefined
    let ws
    let temporizador
    let cerradoAProposito = false
    let espera = 1000

    const conectar = () => {
      let autenticado = false
      ws = new WebSocket(urlWebSocket())
      // Primer mensaje: el token. El servidor responde con el estado o cierra con 4401/4402.
      ws.onopen = () => ws.send(JSON.stringify({ token }))
      ws.onmessage = (ev) => {
        if (!autenticado) {
          autenticado = true
          espera = 1000
          setConectado(true)
          setIntentos(0)
        }
        try {
          setEstado(JSON.parse(ev.data))
        } catch {
          /* mensaje no válido: se ignora */
        }
      }
      ws.onclose = (ev) => {
        setConectado(false)
        if (cerradoAProposito) return
        if (CIERRES_DE_SESION.has(ev.code)) {
          alExpirarRef.current?.()
          return
        }
        setIntentos((n) => n + 1)
        temporizador = setTimeout(conectar, espera)
        espera = Math.min(espera * 2, 15000)
      }
    }

    conectar()
    return () => {
      cerradoAProposito = true
      clearTimeout(temporizador)
      ws?.close()
    }
  }, [token])

  return { estado, conectado, intentos }
}
