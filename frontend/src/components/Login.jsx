import { CornerDownLeft, Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { iniciarSesion } from '../api.js'
import { useTema } from '../tema/tema.js'
import EscenaLogin from './login/EscenaLogin.jsx'
import PantallaAcceso from './login/PantallaAcceso.jsx'
import { prepararTacto, tocar } from './login/tacto.js'

/** Estado de la sala para los LED de abajo: consulta /api/salud (pública, sin datos privados). */
function useEstadoSala() {
  const [estado, setEstado] = useState('comprobando') // 'comprobando' | 'en-linea' | 'sin-arduino' | 'sin-conexion'
  useEffect(() => {
    let vigente = true
    const comprobar = () =>
      fetch('/api/salud')
        .then((r) => r.json())
        .then((d) => vigente && setEstado(d.api === 'ok' && d.mqtt_conectado ? 'en-linea' : 'sin-arduino'))
        .catch(() => vigente && setEstado('sin-conexion'))
    comprobar()
    const id = setInterval(comprobar, 30000)
    return () => {
      vigente = false
      clearInterval(id)
    }
  }, [])
  return estado
}

const TEXTO_ESTADO = {
  comprobando: 'Comprobando la sala…',
  'en-linea': 'Servidor y sala en línea',
  'sin-arduino': 'El servidor responde, pero la sala no',
  'sin-conexion': 'Sin conexión con el servidor',
}
// Cada LED: servidor y sala. 'ok' verde, 'mal' rojo, 'espera' late, nada = apagado.
const LEDS = {
  comprobando: { servidor: 'espera', sala: 'espera' },
  'en-linea': { servidor: 'ok', sala: 'ok' },
  'sin-arduino': { servidor: 'ok', sala: 'mal' },
  'sin-conexion': { servidor: 'mal', sala: null },
}

/** Tornillo Torx de la placa: no hace nada, pero dice que esto es una pieza atornillada. */
function Tornillo({ esquina, giro }) {
  return (
    <span className={`tornillo tornillo-${esquina}`} style={{ '--giro': `${giro}deg` }} aria-hidden="true">
      <svg viewBox="-10 -10 20 20">
        <path d="M0-5.2 1.6-2.6 4.5-2.6 3.1 0 4.5 2.6 1.6 2.6 0 5.2-1.6 2.6-4.5 2.6-3.1 0-4.5-2.6-1.6-2.6Z" />
      </svg>
    </span>
  )
}

const POSICIONES_TEMA = [
  { valor: 'claro', icono: Sun, texto: 'Claro' },
  { valor: 'sistema', icono: Monitor, texto: 'Como el sistema' },
  { valor: 'oscuro', icono: Moon, texto: 'Oscuro' },
]

/** Interruptor deslizante de tres posiciones para el tema, con su serigrafía encima. */
function InterruptorTema() {
  const { preferencia, elegir } = useTema()
  const posicion = Math.max(0, POSICIONES_TEMA.findIndex((p) => p.valor === preferencia))
  return (
    <fieldset className="interruptor" style={{ '--posicion': posicion }}>
      <legend className="solo-lector">Tema</legend>
      <div className="interruptor-rotulos" aria-hidden="true">
        {POSICIONES_TEMA.map(({ valor, icono: Icono }) => (
          <Icono key={valor} size={11} strokeWidth={2} />
        ))}
      </div>
      <div className="interruptor-guia">
        {POSICIONES_TEMA.map(({ valor, texto }) => (
          <label key={valor} className="interruptor-posicion">
            <input
              type="radio"
              name="tema"
              className="solo-lector"
              checked={preferencia === valor}
              onChange={() => {
                tocar('marca')
                elegir(valor)
              }}
              onPointerDown={prepararTacto}
            />
            <span className="solo-lector">{texto}</span>
          </label>
        ))}
        <span className="interruptor-mando" aria-hidden="true" />
      </div>
    </fieldset>
  )
}

export default function Login({ alEntrar, aviso }) {
  const estadoSala = useEstadoSala()
  const [valores, setValores] = useState({ usuario: '', clave: '' })
  const [guardados, setGuardados] = useState({ usuario: false, clave: false })
  const [error, setError] = useState(null) // { corto, largo }
  const [enviando, setEnviando] = useState(false)
  const refs = { usuario: useRef(null), clave: useRef(null) }

  const cambiar = (campo, valor, autorrelleno = false) => {
    setValores((v) => ({ ...v, [campo]: valor }))
    if (autorrelleno) setGuardados((g) => ({ ...g, [campo]: true }))
    if (!autorrelleno) setError(null)
  }

  const enviar = async (e) => {
    e.preventDefault()
    // Se lee del propio campo: el autocompletado del navegador no siempre avisa con un cambio.
    const usuario = refs.usuario.current.value.trim()
    const clave = refs.clave.current.value
    if (!usuario || !clave) {
      const falta = !usuario ? 'usuario' : 'clave'
      setError(
        falta === 'usuario'
          ? { corto: 'FALTA USUARIO', largo: 'Escribe tu usuario.' }
          : { corto: 'FALTA CONTRASEÑA', largo: 'Escribe tu contraseña.' },
      )
      refs[falta].current.focus()
      return
    }
    setError(null)
    setEnviando(true)
    try {
      alEntrar(await iniciarSesion(usuario, clave))
    } catch (err) {
      if (err.estado === 401) {
        setError({ corto: 'NO COINCIDEN', largo: 'El usuario o la contraseña no coinciden.' })
        refs.clave.current.select()
      } else if (err.estado === 429) {
        const min = Math.ceil((Number(err.cabeceras?.get('Retry-After')) || 60) / 60)
        setError({ corto: `ESPERA ${min} MIN`, largo: `Has fallado demasiadas veces. Prueba otra vez dentro de ${min} min.` })
      } else setError({ corto: 'SIN RESPUESTA', largo: err.message })
    } finally {
      setEnviando(false)
    }
  }

  const leds = LEDS[estadoSala]
  const estadoPantalla = enviando
    ? { tipo: 'enviando' }
    : error
      ? { tipo: 'error', texto: error.corto }
      : { tipo: 'listo' }

  return (
    <div className="login">
      <main className="login-chasis">
        <EscenaLogin />

        <section className="acceso" aria-labelledby="acceso-titulo">
          <Tornillo esquina="ai" giro={12} />
          <Tornillo esquina="ad" giro={-28} />
          <Tornillo esquina="bi" giro={41} />
          <Tornillo esquina="bd" giro={-7} />

          <div className="acceso-cabecera">
            <InterruptorTema />
          </div>

          <form className="acceso-form" onSubmit={enviar} noValidate>
            <div className="acceso-titulos">
              <h2 id="acceso-titulo">Hola de nuevo</h2>
              <p>Este panel es solo tuyo.</p>
            </div>

            <div className="acceso-ventana">
              <PantallaAcceso
                valores={valores}
                alCambiar={cambiar}
                guardados={guardados}
                estado={estadoPantalla}
                refs={refs}
                autoFocus
              />
            </div>

            <p className="acceso-mensaje" role="alert" data-tono={error ? 'error' : aviso ? 'aviso' : undefined}>
              {error?.largo ?? aviso ?? ''}
            </p>

            <div className="acceso-teclas">
              <p className="acceso-pista" aria-hidden="true">
                <kbd>TAB</kbd> cambia de campo
              </p>
              <div className="tecla">
                <button
                  type="submit"
                  className="tecla-entrar"
                  disabled={enviando}
                  aria-label={enviando ? 'Entrando…' : 'Entrar'}
                  onPointerDown={() => {
                    prepararTacto()
                    tocar('tope')
                  }}
                >
                  <CornerDownLeft size={22} strokeWidth={2.25} aria-hidden="true" />
                </button>
                <span className="tecla-rotulo" aria-hidden="true">
                  Entrar
                </span>
              </div>
            </div>
          </form>

          <footer className="acceso-pie">
            <ul className="acceso-leds" role="status" aria-label={TEXTO_ESTADO[estadoSala]}>
              <li>
                <span className="acceso-led" data-led={leds.servidor ?? undefined} />
                <span aria-hidden="true">01 Servidor</span>
              </li>
              <li>
                <span className="acceso-led" data-led={leds.sala ?? undefined} />
                <span aria-hidden="true">02 Sala</span>
              </li>
            </ul>
            <span className="rejilla" aria-hidden="true" />
          </footer>
        </section>
      </main>
    </div>
  )
}
