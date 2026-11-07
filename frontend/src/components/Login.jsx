import { LogIn } from 'lucide-react'
import { useState } from 'react'
import { iniciarSesion } from '../api.js'
import SelectorTema from '../tema/SelectorTema.jsx'
import { Boton, Campo, Mensaje } from '../ui/componentes.jsx'
import EscenaLogin from './login/EscenaLogin.jsx'

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
      <main className="login-chasis">
        <EscenaLogin />

        <section className="login-acceso" aria-labelledby="login-form-titulo">
          <div className="login-acceso-cabecera">
            <span className="rotulo">Acceso</span>
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
          <div className="login-pie">
            <span className="rejilla-puntos" aria-hidden="true" />
            <span className="rotulo">Acceso privado · un solo administrador</span>
            <span className="rejilla-puntos" aria-hidden="true" />
          </div>
        </section>
      </main>
    </div>
  )
}
