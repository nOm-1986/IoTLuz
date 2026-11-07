import { useCallback, useEffect, useState } from 'react'

// Misma clave y valores que public/tema-inicial.js.
const CLAVE = 'iotluz_tema'
export const PREFERENCIAS = ['sistema', 'claro', 'oscuro']

const consulta = () => window.matchMedia?.('(prefers-color-scheme: light)')

function leer() {
  try {
    const v = localStorage.getItem(CLAVE)
    return PREFERENCIAS.includes(v) ? v : 'sistema'
  } catch {
    return 'sistema'
  }
}

function resolver(pref) {
  if (pref === 'claro' || pref === 'oscuro') return pref
  return consulta()?.matches ? 'claro' : 'oscuro'
}

function aplicar(tema) {
  document.documentElement.dataset.tema = tema
}

/**
 * Preferencia de tema del usuario: 'sistema' (sigue al sistema operativo), 'claro' u 'oscuro'.
 * Se guarda en este navegador; si el almacenamiento falla, vale solo para la sesión.
 */
export function useTema() {
  const [preferencia, setPreferencia] = useState(leer)
  const [tema, setTema] = useState(() => resolver(leer()))

  useEffect(() => {
    const t = resolver(preferencia)
    setTema(t)
    aplicar(t)
    if (preferencia !== 'sistema') return undefined
    const mq = consulta()
    if (!mq) return undefined
    const cambiar = () => {
      const nuevo = resolver('sistema')
      setTema(nuevo)
      aplicar(nuevo)
    }
    mq.addEventListener('change', cambiar)
    return () => mq.removeEventListener('change', cambiar)
  }, [preferencia])

  const elegir = useCallback((pref) => {
    if (!PREFERENCIAS.includes(pref)) return
    try {
      if (pref === 'sistema') localStorage.removeItem(CLAVE)
      else localStorage.setItem(CLAVE, pref)
    } catch {
      /* sin almacenamiento */
    }
    setPreferencia(pref)
  }, [])

  return { preferencia, tema, elegir }
}
