import { Moon, Sun, Timer, TimerReset } from 'lucide-react'
import { useEffect, useState } from 'react'
import { enviarTiempo, enviarUmbral } from '../api.js'
import { formatoSegundos } from '../formato.js'
import { usePendiente } from '../usePendiente.js'
import { Deslizador, Tarjeta } from '../ui/componentes.jsx'

/** Deslizador que envía la orden al soltarlo y muestra lo que confirma el Arduino. */
function DeslizadorOrden({ etiqueta, min, max, confirmado, deshabilitado, enviar, formato, iconoMin, iconoMax, pie }) {
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
    <div className="ajuste">
      <Deslizador
        etiqueta={etiqueta}
        valor={valor}
        min={min}
        max={max}
        formato={formato}
        iconoMin={iconoMin}
        iconoMax={iconoMax}
        disabled={deshabilitado}
        alCambiar={(v) => {
          setArrastrando(true)
          setValor(v)
        }}
        alSoltar={soltar}
        alPerderFoco={() => arrastrando && soltar()}
      />
      {pie && <p className="ajuste-pie texto-3">{pie}</p>}
      <p className="ajuste-estado" aria-live="polite">
        {pendiente != null ? (
          <span className="esperando">Enviado {formato(pendiente)}. Esperando confirmación del Arduino…</span>
        ) : aviso ? (
          <span className="texto-error">{aviso}</span>
        ) : (
          <span className="texto-3">Confirmado por el Arduino: {confirmado == null ? '—' : formato(confirmado)}</span>
        )}
      </p>
    </div>
  )
}

export default function Ajustes({ token, s, deshabilitado }) {
  return (
    <Tarjeta className="ajustes" aria-labelledby="ajustes-titulo">
      <h2 id="ajustes-titulo" className="tarjeta-titulo">
        Ajustes del modo automático
      </h2>
      <DeslizadorOrden
        etiqueta="Umbral de oscuridad"
        min={1}
        max={1023}
        confirmado={s?.umbral}
        deshabilitado={deshabilitado}
        enviar={(v) => enviarUmbral(token, v)}
        formato={(v) => String(v)}
        iconoMin={Moon}
        iconoMax={Sun}
        pie={`Por debajo de este valor, la sala cuenta como oscura. Luz ahora: ${s?.luz ?? '—'}.`}
      />
      <DeslizadorOrden
        etiqueta="Apagar tras el último movimiento"
        min={1}
        max={3600}
        confirmado={s?.tiempo_s}
        deshabilitado={deshabilitado}
        enviar={(v) => enviarTiempo(token, v)}
        formato={formatoSegundos}
        iconoMin={Timer}
        iconoMax={TimerReset}
      />
    </Tarjeta>
  )
}
