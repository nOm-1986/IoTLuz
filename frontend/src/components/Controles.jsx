import { useEffect, useRef, useState } from 'react'
import { enviarModo, enviarTiempo, enviarUmbral } from '../api.js'
import { formatoSegundos } from '../formato.js'

const ESPERA_CONFIRMACION_MS = 10000
const MODOS = [
  { valor: 'ON', etiqueta: 'ON', ayuda: 'Encender siempre' },
  { valor: 'OFF', etiqueta: 'OFF', ayuda: 'Apagar siempre' },
  { valor: 'AUTO', etiqueta: 'AUTO', ayuda: 'Según luz y movimiento' },
]

/**
 * Orden pendiente de confirmación: se considera aplicada cuando el valor que publica
 * el Arduino (llega por WebSocket) coincide con lo pedido.
 */
function usePendiente(confirmado) {
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

function Deslizador({ id, etiqueta, min, max, confirmado, deshabilitado, enviar, formato }) {
  const [valor, setValor] = useState(confirmado ?? min)
  const [arrastrando, setArrastrando] = useState(false)
  const { pendiente, aviso, iniciar, fallar } = usePendiente(confirmado)

  // Si no se está tocando, el deslizador muestra lo que confirma el Arduino.
  useEffect(() => {
    if (!arrastrando && pendiente == null && confirmado != null) setValor(confirmado)
  }, [confirmado, arrastrando, pendiente])

  const soltar = () => {
    setArrastrando(false)
    if (valor === confirmado || valor === pendiente) return
    iniciar(valor)
    enviar(valor).catch((e) => {
      fallar(e.message)
      if (confirmado != null) setValor(confirmado)
    })
  }

  return (
    <div className="control">
      <div className="control-cabecera">
        <label htmlFor={id}>{etiqueta}</label>
        <output htmlFor={id} className="control-valor">
          {formato(valor)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={valor}
        disabled={deshabilitado}
        onChange={(e) => {
          setArrastrando(true)
          setValor(Number(e.target.value))
        }}
        onPointerUp={soltar}
        onKeyUp={soltar}
        onBlur={() => arrastrando && soltar()}
      />
      <p className="tenue pequeno estado-control" aria-live="polite">
        {pendiente != null ? (
          <span className="esperando">Enviado {formato(pendiente)}. Esperando confirmación del Arduino…</span>
        ) : aviso ? (
          <span className="texto-error">{aviso}</span>
        ) : (
          <>Confirmado por el Arduino: {confirmado == null ? '—' : formato(confirmado)}</>
        )}
      </p>
    </div>
  )
}

export default function Controles({ token, s, mqttConectado, enLinea, enVivo }) {
  const modo = usePendiente(s?.modo)
  // Sin WebSocket no se puede ver la confirmación del Arduino: se bloquean los controles.
  const deshabilitado = !mqttConectado || !enVivo

  const pedirModo = (valor) => {
    if (valor === s?.modo || valor === modo.pendiente) return
    modo.iniciar(valor)
    enviarModo(token, valor).catch((e) => modo.fallar(e.message))
  }

  return (
    <section className="tarjeta" aria-labelledby="titulo-controles">
      <h2 id="titulo-controles" className="titulo-tarjeta">Controles</h2>
      {!enVivo ? (
        <p className="mensaje aviso">Sin conexión en vivo: los controles se reactivarán al reconectar.</p>
      ) : !mqttConectado ? (
        <p className="mensaje error">Sin conexión con el broker MQTT: no se pueden enviar órdenes.</p>
      ) : (
        !enLinea && (
          <p className="mensaje aviso">El Arduino está fuera de línea: las órdenes podrían no aplicarse.</p>
        )
      )}

      <div className="control">
        <span className="control-etiqueta" id="etq-modo">Modo de la lámpara</span>
        <div className="segmentado" role="group" aria-labelledby="etq-modo">
          {MODOS.map((m) => {
            const activo = s?.modo === m.valor
            const enviando = modo.pendiente === m.valor
            return (
              <button
                key={m.valor}
                className={`segmento ${activo ? 'activo' : ''} ${enviando ? 'enviando' : ''}`}
                aria-pressed={activo}
                title={m.ayuda}
                disabled={deshabilitado}
                onClick={() => pedirModo(m.valor)}
              >
                {m.etiqueta}
              </button>
            )
          })}
        </div>
        <p className="tenue pequeno estado-control" aria-live="polite">
          {modo.pendiente ? (
            <span className="esperando">Enviado {modo.pendiente}. Esperando confirmación del Arduino…</span>
          ) : modo.aviso ? (
            <span className="texto-error">{modo.aviso}</span>
          ) : (
            <>Resaltado: el modo que confirma el Arduino.</>
          )}
        </p>
      </div>

      <div className="rejilla-controles">
        <Deslizador
          id="umbral"
          etiqueta="Umbral de oscuridad"
          min={1}
          max={1023}
          confirmado={s?.umbral}
          deshabilitado={deshabilitado}
          enviar={(v) => enviarUmbral(token, v)}
          formato={(v) => String(v)}
        />
        <Deslizador
          id="tiempo"
          etiqueta="Tiempo encendida tras el movimiento"
          min={1}
          max={3600}
          confirmado={s?.tiempo_s}
          deshabilitado={deshabilitado}
          enviar={(v) => enviarTiempo(token, v)}
          formato={formatoSegundos}
        />
      </div>
    </section>
  )
}
