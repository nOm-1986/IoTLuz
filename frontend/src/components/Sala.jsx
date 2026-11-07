import { Lightbulb } from 'lucide-react'
import { enviarModo } from '../api.js'
import { NOMBRE_MODO } from '../formato.js'
import { usePendiente } from '../usePendiente.js'
import { Chip, Disco, Segmentado, Tarjeta } from '../ui/componentes.jsx'

const MODOS = [
  { valor: 'ON', texto: 'ON', luz: true, titulo: 'Encender siempre' },
  { valor: 'OFF', texto: 'OFF', titulo: 'Apagar siempre' },
  { valor: 'AUTO', texto: 'AUTO', titulo: 'Según luz y movimiento' },
]

function explicar(s) {
  if (s?.modo === 'ON') return 'Encendida a mano: no depende de la luz ni del movimiento.'
  if (s?.modo === 'OFF') return 'Apagada a mano: no depende de la luz ni del movimiento.'
  if (s?.modo === 'AUTO') {
    const ahora =
      s.luz == null || s.umbral == null ? '' : s.luz < s.umbral ? ' Ahora está más oscuro que el umbral.' : ' Ahora hay suficiente luz.'
    return `Se enciende con movimiento cuando está más oscuro que el umbral.${ahora}`
  }
  return 'Esperando el primer dato del Arduino.'
}

/** Bloque principal: si la luz está encendida, por qué, y el modo (con confirmación del Arduino). */
export default function Sala({ token, s, deshabilitado }) {
  const encendida = s?.estado === 'ON'
  const modo = usePendiente(s?.modo)

  const pedirModo = (valor) => {
    if (valor === s?.modo || valor === modo.pendiente) return
    modo.iniciar(valor)
    enviarModo(token, valor).catch((e) => modo.fallar(e.message))
  }

  return (
    <Tarjeta encendida={encendida} destacada className="sala" aria-labelledby="sala-titulo">
      <div className="sala-cabecera">
        <Disco icono={Lightbulb} encendido={encendida} />
        {s?.modo && (
          <Chip tono={s.modo === 'AUTO' ? 'violeta' : 'neutro'}>{NOMBRE_MODO[s.modo]}</Chip>
        )}
      </div>

      <h2 id="sala-titulo" className="sala-titulo">
        La sala
      </h2>
      <p className={`sala-estado ${encendida ? 'on' : ''}`} aria-live="polite">
        {s?.estado == null ? '—' : encendida ? 'Encendida' : 'Apagada'}
      </p>
      <p className="sala-razon texto-2">{explicar(s)}</p>

      <div className="sala-modo">
        <p className="sala-modo-etiqueta" aria-hidden="true">
          Modo de la luz
        </p>
        <Segmentado
          etiqueta="Modo de la luz"
          opciones={MODOS}
          valor={s?.modo}
          pendiente={modo.pendiente}
          alCambiar={pedirModo}
          disabled={deshabilitado}
          ancho
        />
        <p className="sala-ayuda" aria-live="polite">
          {modo.pendiente ? (
            <span className="esperando">Enviado {modo.pendiente}. Esperando confirmación del Arduino…</span>
          ) : modo.aviso ? (
            <span className="texto-error">{modo.aviso}</span>
          ) : (
            <span className="texto-3">Resaltado: el modo que confirma el Arduino.</span>
          )}
        </p>
      </div>
    </Tarjeta>
  )
}
