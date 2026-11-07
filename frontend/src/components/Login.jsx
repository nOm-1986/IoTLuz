import { LogIn } from 'lucide-react'
import { useState } from 'react'
import { iniciarSesion } from '../api.js'
import SelectorTema from '../tema/SelectorTema.jsx'
import { Boton, Campo, Marca, Mensaje } from '../ui/componentes.jsx'

/** Bombilla grande de la escena: el vidrio brilla en ámbar; el casquillo queda en sombra. */
function BombillaEscena() {
  return (
    <svg className="escena-bombilla" viewBox="0 0 200 290" aria-hidden="true">
      <defs>
        <radialGradient id="vidrio" cx="50%" cy="42%" r="62%">
          <stop offset="0%" stopColor="#fff6e2" />
          <stop offset="38%" stopColor="#ffd88f" />
          <stop offset="78%" stopColor="#ffb547" />
          <stop offset="100%" stopColor="#e88f12" />
        </radialGradient>
        <linearGradient id="casquillo" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#2a2439" />
          <stop offset="45%" stopColor="#5d5478" />
          <stop offset="100%" stopColor="#1a1624" />
        </linearGradient>
      </defs>
      <path
        className="escena-vidrio"
        d="M100 18c46 0 80 34 80 82 0 33-16 52-30 70-9 12-14 22-14 38H64c0-16-5-26-14-38-14-18-30-37-30-70 0-48 34-82 80-82Z"
        fill="url(#vidrio)"
      />
      <path d="M78 206c0-30 4-50 10-66m34 66c0-30-4-50-10-66M88 140c4-10 20-10 24 0" className="escena-filamento" />
      <ellipse cx="74" cy="72" rx="16" ry="26" className="escena-reflejo" transform="rotate(28 74 72)" />
      <rect x="62" y="214" width="76" height="16" rx="8" fill="url(#casquillo)" />
      <rect x="66" y="234" width="68" height="14" rx="7" fill="url(#casquillo)" />
      <rect x="70" y="252" width="60" height="14" rx="7" fill="url(#casquillo)" />
      <path d="M86 270h28l-6 14h-16Z" fill="url(#casquillo)" />
    </svg>
  )
}

export default function Login({ alEntrar, aviso }) {
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      alEntrar(await iniciarSesion(usuario.trim(), clave))
    } catch (err) {
      if (err.estado === 401) setError('Usuario o clave incorrectos.')
      else if (err.estado === 429) {
        const s = Number(err.cabeceras?.get('Retry-After')) || 60
        setError(`Demasiados intentos fallidos. Espera ${Math.ceil(s / 60)} min y vuelve a probar.`)
      } else setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="login">
      <main className="login-marco">
        <section className="login-escena" aria-labelledby="login-titular">
          <div className="login-marca">
            <Marca tamano={30} />
            <span>IoTLuz</span>
          </div>
          <div className="escena-luz" aria-hidden="true">
            <div className="escena-halo" />
            <BombillaEscena />
          </div>
          <div className="login-texto">
            <h1 id="login-titular" className="login-titular">
              La luz de la sala, <span className="login-titular-luz">en tus manos.</span>
            </h1>
            <p className="login-bajada">Mira si está encendida, cuánta luz hay y cambia el modo en segundos.</p>
          </div>
        </section>

        <section className="login-acceso" aria-labelledby="login-form-titulo">
          <div className="login-acceso-cabecera">
            <SelectorTema />
          </div>
          <form className="login-form" onSubmit={enviar}>
            <div className="login-form-titulos">
              <h2 id="login-form-titulo">Inicia sesión</h2>
              <p className="texto-2">Panel privado de la sala.</p>
            </div>
            {aviso && <Mensaje tono="aviso">{aviso}</Mensaje>}
            <Campo
              etiqueta="Usuario"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              required
            />
            <Campo
              etiqueta="Clave"
              type="password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              autoComplete="current-password"
              required
            />
            {error && <Mensaje tono="error">{error}</Mensaje>}
            <Boton type="submit" variante="primario" ancho icono={LogIn} cargando={enviando} className="login-boton">
              {enviando ? 'Entrando…' : 'Entrar'}
            </Boton>
          </form>
          <p className="login-pie texto-3">Acceso privado de un solo administrador.</p>
        </section>
      </main>
    </div>
  )
}
