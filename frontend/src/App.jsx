import { useCallback, useEffect, useState } from 'react'
import { configurarNoAutorizado, guardarToken, leerToken } from './api.js'
import Login from './components/Login.jsx'
import Panel from './components/Panel.jsx'

export default function App() {
  const [token, setToken] = useState(() => leerToken())
  const [aviso, setAviso] = useState('')

  const cerrarSesion = useCallback((mensaje = '') => {
    guardarToken(null)
    setToken(null)
    setAviso(mensaje)
  }, [])

  const expirar = useCallback(
    () => cerrarSesion('Tu sesión ha expirado. Vuelve a iniciar sesión.'),
    [cerrarSesion],
  )

  useEffect(() => configurarNoAutorizado(expirar), [expirar])

  const entrar = (nuevo) => {
    guardarToken(nuevo)
    setAviso('')
    setToken(nuevo)
  }

  if (!token) return <Login alEntrar={entrar} aviso={aviso} />
  return <Panel token={token} alSalir={() => cerrarSesion()} alExpirar={expirar} />
}
