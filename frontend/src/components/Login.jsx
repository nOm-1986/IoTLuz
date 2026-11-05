import { useState } from 'react'
import { iniciarSesion } from '../api.js'

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
    <main className="login">
      <form className="tarjeta login-caja" onSubmit={enviar}>
        <div className="marca">
          <img src="/favicon.svg" alt="" width="32" height="32" />
          <div>
            <h1>IoTLuz</h1>
            <p className="tenue">Panel de la sala</p>
          </div>
        </div>
        {aviso && <p className="mensaje aviso" role="status">{aviso}</p>}
        <label>
          Usuario
          <input
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>
        <label>
          Clave
          <input
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="mensaje error" role="alert">{error}</p>}
        <button className="boton primario" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
