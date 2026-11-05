import { useCallback, useEffect, useState } from 'react'
import { obtenerEventos } from '../api.js'
import { haceCuanto } from '../formato.js'
import { useEnVivo } from '../useEnVivo.js'
import Controles from './Controles.jsx'
import EstadoActual from './EstadoActual.jsx'
import Eventos from './Eventos.jsx'
import Grafica from './Grafica.jsx'

function Indicador({ activo, si, no, desconocido, textoDesconocido }) {
  const clase = desconocido ? 'chip-neutro' : activo ? 'chip-ok' : 'chip-mal'
  return (
    <span className={`chip ${clase}`}>
      <span className="chip-punto" aria-hidden="true" />
      {desconocido ? textoDesconocido : activo ? si : no}
    </span>
  )
}

function useAhora(cadaMs = 1000) {
  const [ahora, setAhora] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), cadaMs)
    return () => clearInterval(id)
  }, [cadaMs])
  return ahora
}

export default function Panel({ token, alSalir, alExpirar }) {
  const { estado, conectado, intentos } = useEnVivo(token, alExpirar)
  const ahora = useAhora()
  const s = estado?.snapshot
  const mqtt = !!estado?.mqtt_conectado
  const enLinea = !!estado?.arduino_en_linea

  const [eventos, setEventos] = useState([])
  const [errorEventos, setErrorEventos] = useState('')
  const cargarEventos = useCallback(() => {
    obtenerEventos(token, 50)
      .then((e) => {
        setEventos(e)
        setErrorEventos('')
      })
      .catch((err) => setErrorEventos(err.message))
  }, [token])

  useEffect(() => {
    cargarEventos()
    const id = setInterval(cargarEventos, 60000)
    return () => clearInterval(id)
  }, [cargarEventos])

  // Cuando cambia algo que genera eventos, se recarga la tabla.
  const huella = `${s?.estado}|${s?.modo}|${enLinea}`
  useEffect(() => {
    const t = setTimeout(cargarEventos, 600)
    return () => clearTimeout(t)
  }, [huella, cargarEventos])

  return (
    <div className="pagina">
      <header className="cabecera">
        <div className="marca">
          <img src="/favicon.svg" alt="" width="28" height="28" />
          <div>
            <h1>IoTLuz</h1>
            <p className="tenue pequeno">Actualizado {haceCuanto(estado?.ultima_actualizacion, ahora)}</p>
          </div>
        </div>
        <div className="indicadores" aria-live="polite">
          <Indicador
            activo={mqtt}
            si="Broker conectado"
            no="Broker desconectado"
            desconocido={!conectado}
            textoDesconocido="Broker: sin datos"
          />
          <Indicador
            activo={enLinea}
            si="Arduino en línea"
            no="Arduino fuera de línea"
            desconocido={!conectado}
            textoDesconocido="Arduino: sin datos"
          />
          <button className="boton fantasma" onClick={alSalir}>
            Salir
          </button>
        </div>
        {!conectado && (estado || intentos > 0) && (
          <div className="banda-aviso" role="alert">
            Se perdió la conexión en vivo con el servidor. Reintentando… Los datos mostrados pueden no estar al día.
          </div>
        )}
      </header>

      <main className="contenido">
        {!estado ? (
          <p className="tarjeta cargando">Conectando con el servidor…</p>
        ) : (
          <>
            <EstadoActual s={s} />
            <Controles token={token} s={s} mqttConectado={mqtt} enLinea={enLinea} enVivo={conectado} />
          </>
        )}
        <Grafica token={token} />
        <Eventos eventos={eventos} error={errorEventos} />
      </main>
    </div>
  )
}
