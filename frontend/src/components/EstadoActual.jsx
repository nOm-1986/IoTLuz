import { NOMBRE_MODO, formatoDecimal, formatoMinutos, formatoSegundos } from '../formato.js'

function Bombilla({ encendida }) {
  return (
    <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true" className={encendida ? 'bombilla on' : 'bombilla'}>
      <path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2Z" />
      <rect x="9" y="19.5" width="6" height="2.5" rx="1.25" />
    </svg>
  )
}

function MedidorLuz({ luz, umbral }) {
  if (luz == null) return <p className="valor">—</p>
  const pct = (v) => `${(Math.min(1023, Math.max(0, v)) / 1023) * 100}%`
  const oscuro = umbral != null && luz < umbral
  return (
    <>
      <p className="valor">
        {luz}
        <span className="unidad"> / 1023</span>
      </p>
      <div
        className="medidor"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={1023}
        aria-valuenow={luz}
        aria-label={`Luz ${luz}, umbral ${umbral ?? 'desconocido'}`}
      >
        <div className="medidor-relleno" style={{ width: pct(luz) }} />
        {umbral != null && <div className="medidor-umbral" style={{ left: pct(umbral) }} title={`Umbral ${umbral}`} />}
      </div>
      <p className="tenue pequeno">
        Umbral {umbral ?? '—'} · {oscuro ? 'Está más oscuro que el umbral' : 'Hay suficiente luz'}
      </p>
    </>
  )
}

export default function EstadoActual({ s }) {
  const encendida = s?.estado === 'ON'
  return (
    <section aria-labelledby="titulo-ahora">
      <h2 id="titulo-ahora" className="titulo-seccion">Ahora</h2>
      <div className="rejilla-estado">
        <article className={`tarjeta area-lampara ${encendida ? 'lampara-on' : ''}`}>
          <h3>Lámpara</h3>
          <div className="fila">
            <Bombilla encendida={encendida} />
            <p className="valor">{s?.estado == null ? '—' : encendida ? 'Encendida' : 'Apagada'}</p>
          </div>
          <p className="tenue pequeno">Modo {NOMBRE_MODO[s?.modo] ?? '—'}</p>
        </article>

        <article className="tarjeta area-luz">
          <h3>Luz ambiente (LDR)</h3>
          <MedidorLuz luz={s?.luz} umbral={s?.umbral} />
        </article>

        <article className="tarjeta area-mov">
          <h3>Movimiento</h3>
          <p className="valor">{s?.pir == null ? '—' : s.pir ? 'Detectado' : 'Sin movimiento'}</p>
          <p className="tenue pequeno">Apaga tras {formatoSegundos(s?.tiempo_s)}</p>
        </article>

        <article className="tarjeta area-tiempo">
          <h3>Tiempo encendida</h3>
          <p className="valor">{formatoMinutos(s?.minutos)}</p>
          <p className="tenue pequeno">Acumulado</p>
        </article>

        <article className="tarjeta area-energia">
          <h3>Energía</h3>
          <p className="valor">
            {formatoDecimal(s?.energia_wh, 2)}
            <span className="unidad"> Wh</span>
          </p>
          <p className="tenue pequeno">Estimada</p>
        </article>
      </div>
    </section>
  )
}
