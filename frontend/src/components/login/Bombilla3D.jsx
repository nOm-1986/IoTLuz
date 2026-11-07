import { useEffect, useRef, useState } from 'react'

/** Bombilla plana (SVG): se ve mientras carga la escena 3D y si el navegador no tiene WebGL. */
function BombillaPlana() {
  return (
    <svg className="bombilla-plana" viewBox="0 0 200 290" aria-hidden="true">
      <defs>
        <radialGradient id="bp-vidrio" cx="50%" cy="42%" r="62%">
          <stop offset="0%" stopColor="#fff6e2" />
          <stop offset="38%" stopColor="#ffd88f" />
          <stop offset="78%" stopColor="#ffb547" />
          <stop offset="100%" stopColor="#e88f12" />
        </radialGradient>
        <linearGradient id="bp-casquillo" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#2a2439" />
          <stop offset="45%" stopColor="#5d5478" />
          <stop offset="100%" stopColor="#1a1624" />
        </linearGradient>
      </defs>
      <path
        className="bombilla-plana-vidrio"
        d="M100 18c46 0 80 34 80 82 0 33-16 52-30 70-9 12-14 22-14 38H64c0-16-5-26-14-38-14-18-30-37-30-70 0-48 34-82 80-82Z"
        fill="url(#bp-vidrio)"
      />
      <rect x="62" y="214" width="76" height="16" rx="8" fill="url(#bp-casquillo)" />
      <rect x="66" y="234" width="68" height="14" rx="7" fill="url(#bp-casquillo)" />
      <rect x="70" y="252" width="60" height="14" rx="7" fill="url(#bp-casquillo)" />
      <path d="M86 270h28l-6 14h-16Z" fill="url(#bp-casquillo)" />
    </svg>
  )
}

const reducido = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * Bombilla 3D (three.js, cargado bajo demanda). `encendida` enciende la luz;
 * `apunte` es una ref con {x, y} en [-1, 1] hacia donde se inclina.
 */
export default function Bombilla3D({ encendida, apunte }) {
  const contenedor = useRef(null)
  const escena = useRef(null)
  const [estado, setEstado] = useState('cargando') // 'cargando' | 'lista' | 'sin-3d'

  useEffect(() => {
    let vigente = true
    import('./escena3d.js')
      .then(({ crearEscena }) => {
        if (!vigente || !contenedor.current) return
        escena.current = crearEscena(contenedor.current, {
          reducido: reducido(),
          leerApunte: () => apunte.current, // se lee en cada cuadro, sin pasar por React
        })
        setEstado('lista')
      })
      .catch(() => vigente && setEstado('sin-3d'))
    return () => {
      vigente = false
      escena.current?.destruir()
      escena.current = null
    }
  }, [apunte])

  useEffect(() => {
    escena.current?.setEncendida(encendida)
  }, [encendida, estado])

  return (
    <div className="bombilla-3d" data-estado={estado} data-encendida={encendida || undefined}>
      {estado !== 'lista' && <BombillaPlana />}
      <div ref={contenedor} className="bombilla-3d-lienzo" />
    </div>
  )
}
