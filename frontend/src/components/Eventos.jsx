import { Lightbulb, LightbulbOff, SlidersHorizontal, Wifi, WifiOff } from 'lucide-react'
import { NOMBRE_MODO, formatoFechaHora } from '../formato.js'
import { Mensaje, Tarjeta } from '../ui/componentes.jsx'

const TIPO = { estado: 'Lámpara', modo: 'Modo', conexion: 'Arduino' }
const VALOR = {
  estado: { ON: 'Encendida', OFF: 'Apagada' },
  modo: NOMBRE_MODO,
  conexion: { en_linea: 'En línea', fuera_de_linea: 'Fuera de línea' },
}

/** Icono y tono de cada evento: ámbar solo si la luz se encendió. */
function aspecto(e) {
  if (e.tipo === 'estado') return e.valor === 'ON' ? [Lightbulb, 'luz'] : [LightbulbOff, 'neutro']
  if (e.tipo === 'conexion') return e.valor === 'en_linea' ? [Wifi, 'ok'] : [WifiOff, 'mal']
  return [SlidersHorizontal, 'violeta']
}

export default function Eventos({ eventos, error }) {
  return (
    <Tarjeta className="eventos" aria-labelledby="titulo-eventos">
      <h2 id="titulo-eventos" className="tarjeta-titulo">
        Últimos eventos
      </h2>
      {error && <Mensaje tono="error">No se pudieron cargar los eventos: {error}</Mensaje>}
      {eventos.length === 0 ? (
        <p className="texto-3 eventos-vacio">Todavía no hay eventos registrados.</p>
      ) : (
        <ol className="eventos-lista">
          {eventos.map((e) => {
            const [Icono, tono] = aspecto(e)
            return (
              <li key={e.id} className={`evento evento-${tono}`}>
                <span className="evento-icono" aria-hidden="true">
                  <Icono size={16} strokeWidth={1.9} />
                </span>
                <span className="evento-texto">
                  <span className="evento-que">{TIPO[e.tipo] ?? e.tipo}</span>{' '}
                  <span className="evento-valor">{VALOR[e.tipo]?.[e.valor] ?? e.valor}</span>
                </span>
                <time className="evento-hora texto-3 cifra" dateTime={e.ts}>
                  {formatoFechaHora(e.ts)}
                </time>
              </li>
            )
          })}
        </ol>
      )}
    </Tarjeta>
  )
}
