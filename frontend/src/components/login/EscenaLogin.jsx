import { useRef } from 'react'
import { Marca } from '../../ui/componentes.jsx'
import Bombilla3D from './Bombilla3D.jsx'
import { useSensorPresencia } from './useSensorPresencia.js'

const DURACION_LUZ_MS = 5000
const MARCAS = 60

/** Dial alrededor de la bombilla: el arco ámbar se vacía mientras dura la luz (5 s). */
function Dial({ fraccion }) {
  const r = 46
  const largo = 2 * Math.PI * r
  return (
    <svg className="dial" viewBox="0 0 100 100" aria-hidden="true">
      <g className="dial-marcas">
        {Array.from({ length: MARCAS }, (_, i) => (
          <line
            key={i}
            x1="50"
            y1={i % 5 === 0 ? 1.2 : 1.8}
            x2="50"
            y2="3.4"
            transform={`rotate(${(i * 360) / MARCAS} 50 50)`}
            className={i % 5 === 0 ? 'dial-marca-mayor' : undefined}
          />
        ))}
      </g>
      <circle className="dial-pista" cx="50" cy="50" r={r} />
      <circle
        className="dial-arco"
        cx="50"
        cy="50"
        r={r}
        strokeDasharray={largo}
        strokeDashoffset={largo * (1 - fraccion)}
        transform="rotate(-90 50 50)"
      />
    </svg>
  )
}

/**
 * Pantalla de la izquierda del login: la sala de noche con la bombilla 3D y el sensor de
 * presencia. Es un componente aparte para que su cuenta atrás (10 veces por segundo mientras
 * hay luz) no vuelva a dibujar el formulario.
 */
export default function EscenaLogin() {
  const zonaLuz = useRef(null)
  const { encendida, restanteMs, apunte } = useSensorPresencia(zonaLuz, DURACION_LUZ_MS)
  const segundos = Math.ceil(restanteMs / 1000)

  return (
    <section className="login-escena" data-encendida={encendida || undefined} aria-labelledby="login-titular">
      <div className="escena-barra">
        <div className="login-marca">
          <Marca tamano={28} />
          <span>IoTLuz</span>
        </div>
        <div className="sensor-tira" aria-hidden="true">
          <span className="sensor-led" />
          <span className="sensor-nombre">PIR</span>
          <span className="sensor-estado">{encendida ? `Movimiento · ${segundos} s` : 'En espera'}</span>
        </div>
      </div>

      <div className="escena-luz" ref={zonaLuz}>
        <div className="escena-halo" aria-hidden="true" />
        <Dial fraccion={restanteMs / DURACION_LUZ_MS} />
        <Bombilla3D encendida={encendida} apunte={apunte} />
      </div>

      <div className="login-texto">
        <h1 id="login-titular" className="login-titular">
          La luz de la sala, <span className="login-titular-luz">en tus manos.</span>
        </h1>
        <p className="login-bajada">Mira si está encendida, cuánta luz hay y cambia el modo en segundos.</p>
        <p className="login-pista" aria-hidden="true">
          <span className="pista-cursor">Acerca el cursor a la bombilla:</span>
          <span className="pista-tactil">Toca la bombilla:</span> el sensor la enciende 5 s, como en la sala.
        </p>
      </div>
    </section>
  )
}
