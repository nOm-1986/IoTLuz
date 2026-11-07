import { Clock, PersonStanding, SunDim, Zap } from 'lucide-react'
import { formatoDecimal, formatoMinutos, formatoSegundos } from '../formato.js'
import { Disco, Tarjeta } from '../ui/componentes.jsx'

const pct = (v) => `${(Math.min(1023, Math.max(0, v)) / 1023) * 100}%`

/** Luz ambiente medida por el LDR, con la marca del umbral de oscuridad sobre la misma escala. */
function LuzAmbiente({ luz, umbral }) {
  const oscuro = luz != null && umbral != null && luz < umbral
  return (
    <Tarjeta as="article" className="sensor sensor-luz" aria-labelledby="sensor-luz">
      <div className="sensor-cabecera">
        <Disco icono={SunDim} tamano="sm" className="disco-luz" />
        <h3 id="sensor-luz" className="sensor-titulo">
          Luz ambiente
        </h3>
      </div>
      <p className="sensor-valor cifra">
        {luz ?? '—'}
        <span className="sensor-unidad"> / 1023</span>
      </p>
      {luz != null && (
        <div
          className="medidor"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={1023}
          aria-valuenow={luz}
          aria-label={`Luz ${luz}, umbral ${umbral ?? 'desconocido'}`}
        >
          <div className="medidor-relleno" style={{ width: pct(luz) }} />
          {umbral != null && <div className="medidor-umbral" style={{ left: pct(umbral) }} />}
        </div>
      )}
      <p className="sensor-pie">
        <span className="leyenda-umbral" aria-hidden="true" />
        Umbral {umbral ?? '—'}
        {luz != null && umbral != null && <> · {oscuro ? 'está más oscuro que el umbral' : 'hay suficiente luz'}</>}
      </p>
    </Tarjeta>
  )
}

function Sensor({ id, icono, titulo, valor, unidad, pie, activo }) {
  return (
    <Tarjeta as="article" className="sensor" aria-labelledby={id}>
      <div className="sensor-cabecera">
        <Disco icono={icono} tamano="sm" tono={activo ? 'acento' : undefined} className={activo ? 'disco-activo' : ''} />
        <h3 id={id} className="sensor-titulo">
          {titulo}
        </h3>
      </div>
      <p className="sensor-valor cifra">
        {valor}
        {unidad && <span className="sensor-unidad"> {unidad}</span>}
      </p>
      <p className="sensor-pie">{pie}</p>
    </Tarjeta>
  )
}

export default function Sensores({ s }) {
  return (
    <section className="sensores" aria-label="Sensores y consumo">
      <LuzAmbiente luz={s?.luz} umbral={s?.umbral} />
      <Sensor
        id="sensor-mov"
        icono={PersonStanding}
        titulo="Movimiento"
        valor={s?.pir == null ? '—' : s.pir ? 'Detectado' : 'Sin movimiento'}
        pie={`Apaga tras ${formatoSegundos(s?.tiempo_s)}`}
        activo={!!s?.pir}
      />
      <Sensor
        id="sensor-tiempo"
        icono={Clock}
        titulo="Tiempo encendida"
        valor={formatoMinutos(s?.minutos)}
        pie="Acumulado"
      />
      <Sensor
        id="sensor-energia"
        icono={Zap}
        titulo="Energía"
        valor={formatoDecimal(s?.energia_wh, 2)}
        unidad="Wh"
        pie="Estimada"
      />
    </section>
  )
}
