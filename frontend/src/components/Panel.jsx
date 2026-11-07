import { LogOut } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { obtenerEventos } from '../api.js'
import { haceCuanto } from '../formato.js'
import SelectorTema from '../tema/SelectorTema.jsx'
import { Boton, Chip, Marca, Mensaje } from '../ui/componentes.jsx'
import { useEnVivo } from '../useEnVivo.js'
import Ajustes from './Ajustes.jsx'
import Eventos from './Eventos.jsx'
import Grafica from './Grafica.jsx'
import Sala from './Sala.jsx'
import Sensores from './Sensores.jsx'

function Indicador({ activo, si, no, desconocido, textoDesconocido }) {
  const tono = desconocido ? 'neutro' : activo ? 'ok' : 'mal'
  return (
    <Chip tono={tono} vivo={!desconocido && activo}>
      {desconocido ? textoDesconocido : activo ? si : no}
    </Chip>
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

/** Solo este texto se vuelve a dibujar cada segundo, no todo el panel (ni la gráfica). */
function Actualizado({ iso }) {
  const ahora = useAhora()
  return <p className="panel-actualizado texto-3">Actualizado {haceCuanto(iso, ahora)}</p>
}

/** Por qué no se pueden enviar órdenes (o por qué podrían no aplicarse). */
function AvisoControles({ enVivo, mqtt, enLinea }) {
  if (!enVivo) return null // ya lo explica la banda de reconexión
  if (!mqtt) return <Mensaje tono="error">Sin conexión con el broker MQTT: no se pueden enviar órdenes.</Mensaje>
  if (!enLinea) return <Mensaje tono="aviso">El Arduino está fuera de línea: las órdenes podrían no aplicarse.</Mensaje>
  return null
}

export default function Panel({ token, alSalir, alExpirar }) {
  const { estado, conectado, intentos } = useEnVivo(token, alExpirar)
  const s = estado?.snapshot
  const mqtt = !!estado?.mqtt_conectado
  const enLinea = !!estado?.arduino_en_linea
  // Sin WebSocket no se puede ver la confirmación del Arduino: se bloquean los controles.
  const deshabilitado = !mqtt || !conectado

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

  // Cuando cambia algo que genera eventos, se recarga la lista.
  const huella = `${s?.estado}|${s?.modo}|${enLinea}`
  useEffect(() => {
    const t = setTimeout(cargarEventos, 600)
    return () => clearTimeout(t)
  }, [huella, cargarEventos])

  return (
    <div className="panel">
      <header className="panel-cabecera">
        <div className="panel-marca">
          <Marca tamano={34} />
          <div>
            <h1 className="panel-nombre">IoTLuz</h1>
            <Actualizado iso={estado?.ultima_actualizacion} />
          </div>
        </div>
        <div className="panel-indicadores" aria-live="polite">
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
        </div>
        <div className="panel-acciones">
          <SelectorTema />
          <Boton variante="fantasma" icono={LogOut} onClick={alSalir}>
            Salir
          </Boton>
        </div>
      </header>

      {!conectado && (estado || intentos > 0) && (
        <Mensaje tono="aviso" className="panel-banda">
          Se perdió la conexión en vivo con el servidor. Reintentando… Los datos mostrados pueden no estar al día y los
          controles se reactivarán al reconectar.
        </Mensaje>
      )}

      <main className="panel-rejilla">
        {!estado ? (
          <p className="panel-cargando tarjeta">Conectando con el servidor…</p>
        ) : (
          <>
            <div className="area-sala">
              <AvisoControles enVivo={conectado} mqtt={mqtt} enLinea={enLinea} />
              <Sala token={token} s={s} deshabilitado={deshabilitado} />
            </div>
            <div className="area-ajustes">
              <Ajustes token={token} s={s} deshabilitado={deshabilitado} />
            </div>
            <div className="area-sensores">
              <Sensores s={s} />
            </div>
          </>
        )}
        <div className="area-grafica">
          <Grafica token={token} />
        </div>
        <div className="area-eventos">
          <Eventos eventos={eventos} error={errorEventos} />
        </div>
      </main>
    </div>
  )
}
