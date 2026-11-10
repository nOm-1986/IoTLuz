import { useCallback, useEffect, useRef, useState } from 'react'
import { enviarModo, enviarTiempo, enviarUmbral, obtenerEventos, obtenerLecturas } from '../api.js'
import { useTema } from '../tema/tema.js'
import { useEnVivo } from '../useEnVivo.js'
import { usePendiente } from '../usePendiente.js'
import { grafica } from './panel/grafica.js'
import { crearLampara } from './panel/lampara.js'
import { crearLuna } from './panel/luna.js'
import { fader, perilla, pinta, sonarTecla } from './panel/modulos.js'
import './panel/rack.css'

const LOG_MAX = Math.log(3600)
const aP = (s) => Math.log(Math.max(1, s)) / LOG_MAX
const aSegundos = (p) => Math.max(1, Math.min(3600, Math.round(Math.exp(p * LOG_MAX))))

function formatoTiempo(s) {
  if (s < 60) return [String(s), 'S']
  if (s < 3600) return [String(Math.round(s / 60)), 'MIN']
  return ['1', 'H']
}
const hhmm = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

/** Ancho del svg de píxeles según su caja: 1 unidad ≥ 1,6 px para que se lea en móvil. */
function useAnchoPixeles(ref, max, min = 200) {
  const [w, setW] = useState(max)
  useEffect(() => {
    const ob = new ResizeObserver(([e]) => setW(Math.round(Math.min(max, Math.max(min, e.contentRect.width / 1.6)))))
    ob.observe(ref.current.parentElement)
    return () => ob.disconnect()
  }, [ref, max, min])
  return w
}

const Tornillos = () => (
  <>
    <i className="rk-tornillo ai" />
    <i className="rk-tornillo ad" />
    <i className="rk-tornillo bi" />
    <i className="rk-tornillo bd" />
  </>
)

function Modulo({ num, titulo, nota, clase = '', extra, children }) {
  return (
    <section className={`modulo ${clase}`}>
      <Tornillos />
      <div className="cabeza">
        <span className="serigrafia">
          <span className="num">{num}</span>
          {titulo}
        </span>
        {extra ?? (nota && <span className="serigrafia suave">{nota}</span>)}
      </div>
      {children}
    </section>
  )
}

function Tecla({ valor, activo, clase = '', chica, className = '', children, ...resto }) {
  return (
    <button
      type="button"
      className={`rk-tecla ${clase} ${chica ? 'chica' : ''} ${className}`}
      aria-pressed={activo}
      onPointerDown={sonarTecla}
      data-v={valor}
      {...resto}
    >
      {!chica && <i className="led" />}
      <span className="tapa">{children}</span>
    </button>
  )
}

// ── 01 · pantalla de estado ──
function PantallaEstado({ s, umbral, pendiente, ultimoCambio }) {
  const ref = useRef(null)
  const W = useAnchoPixeles(ref, 320)
  useEffect(() => {
    const H = 118
    const estrecha = W < 300
    const modo = s?.modo ?? '—'
    const encendida = s?.estado === 'ON'
    const luz = s?.luz ?? 0
    const motivo =
      s?.modo === 'AUTO'
        ? encendida
          ? estrecha ? 'MOVIMIENTO + OSCURO' : 'HAY MOVIMIENTO Y ESTA OSCURO'
          : luz < umbral ? 'OSCURO, SIN MOVIMIENTO' : 'HAY SUFICIENTE LUZ'
        : s?.modo ? 'A MANO DESDE EL PANEL' : 'ESPERANDO AL ARDUINO'
    const capas = [
      { icono: 'bombilla', x: 6, y: 6, color: encendida ? 'nar' : 'tenue' },
      { t: 'LA SALA', x: 17, y: 6, color: 'tenue' },
      { t: pendiente ? `ENVIADO ${pendiente}` : `MODO ${modo}`, x: 6, y: 6, derecha: true, color: pendiente ? 'azul' : modo === 'AUTO' ? 'nar' : 'luz' },
      { t: s?.estado == null ? '---' : encendida ? 'ENCENDIDA' : 'APAGADA', x: 6, y: 22, e: estrecha ? 2 : 3 },
      { t: motivo, x: 6, y: estrecha ? 44 : 50, color: 'azul' },
      { seg: s?.luz == null ? '---' : String(s.luz), x: 6, y: 21, alto: estrecha ? 20 : 30, derecha: true },
      { t: estrecha ? 'LUZ' : 'LUZ AHORA', x: 6, y: estrecha ? 46 : 56, derecha: true, color: 'tenue' },
    ]
    // medidor: 52 celdas de luz ambiente con la marca del umbral en naranja
    const n = 52, x0 = 6, paso = (W - 12) / n
    const lleno = Math.round((luz / 1023) * n)
    const marca = Math.round((umbral / 1023) * n)
    const lu = [], te = [], na = []
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + i * paso)
      const destino = i === marca ? na : i < lleno ? lu : te
      for (let k = 0; k < (i === marca ? 4 : 3); k++) destino.push([x, 72 + k * 3 - (i === marca ? 3 : 0), 3])
    }
    capas.push({ celdas: lu }, { celdas: te, color: 'tenue' }, { celdas: na, color: 'nar' })
    capas.push({ t: 'OSCURO', x: 6, y: 86, color: 'tenue' }, { t: 'CLARO', x: 6, y: 86, derecha: true, color: 'tenue' })
    capas.push({ t: `UMBRAL ${umbral}`, x: Math.max(44, Math.min(W - 112, x0 + marca * paso - 30)), y: 86, color: 'nar' })
    if (s?.modo === 'AUTO' && s?.pir) {
      capas.push({ t: 'MOVIMIENTO AHORA', x: 6, y: 104, color: 'azul' })
    } else if (ultimoCambio) {
      capas.push({ t: `${encendida ? 'ENCENDIDA' : 'APAGADA'} DESDE LAS ${hhmm(ultimoCambio)}`, x: 6, y: 104, color: 'tenue' })
    }
    pinta(ref.current, W, H, capas)
  }, [W, s, umbral, pendiente, ultimoCambio])
  return (
    <div className="rk-pantalla" aria-hidden="true">
      <svg ref={ref} />
    </div>
  )
}

/** Perilla del umbral: muestra lo que confirma el Arduino y envía al soltar. */
function Umbral({ confirmado, deshabilitado, alMover, enviar }) {
  const zona = useRef(null)
  const ctl = useRef(null)
  const op = useRef({}).current
  op.alCambiar = alMover
  op.alSoltar = enviar
  useEffect(() => {
    ctl.current = perilla(zona.current, Object.assign(op, { min: 1, max: 1023, valor: confirmado ?? 512 }))
  }, [op])
  useEffect(() => {
    if (confirmado != null) ctl.current?.poner(confirmado)
  }, [confirmado])
  return (
    <div className={`perilla-zona ${deshabilitado ? 'bloqueado' : ''}`} ref={zona} aria-label="Umbral de oscuridad">
      <svg className="marcas" />
      <div className="perilla" />
    </div>
  )
}

function Tiempo({ confirmado, deshabilitado, enviar }) {
  const zona = useRef(null)
  const lectura = useRef(null)
  const ctl = useRef(null)
  const op = useRef({}).current
  op.alCambiar = (p) => {
    const [n, u] = formatoTiempo(aSegundos(p))
    pinta(lectura.current, 96, 34, [{ seg: n, x: 4, y: 5, alto: 24, color: 'nar' }, { t: u, x: 4, y: 17, e: 2, derecha: true }])
  }
  op.alSoltar = (p) => enviar(aSegundos(p))
  useEffect(() => {
    ctl.current = fader(zona.current, Object.assign(op, { p: aP(confirmado ?? 30), pasos: 40 }))
  }, [op])
  useEffect(() => {
    if (confirmado != null) ctl.current?.poner(aP(confirmado))
  }, [confirmado])
  return (
    <div className="lectura">
      <div className={`fader ${deshabilitado ? 'bloqueado' : ''}`} ref={zona} aria-label="Tiempo hasta apagar" />
      <div className="rk-pantalla">
        <svg ref={lectura} width="96" />
      </div>
    </div>
  )
}

// ── 05 · gráfica ──
const RANGOS = [
  { v: 30, t: '30M', limite: 400 },
  { v: 120, t: '2H', limite: 1000 },
  { v: 1440, t: '24H', limite: 5000 },
]
function Grafica({ token, umbral }) {
  const ref = useRef(null)
  const ctl = useRef(null)
  const [rango, setRango] = useState(RANGOS[1])
  const [error, setError] = useState('')
  useEffect(() => {
    ctl.current = grafica(ref.current)
  }, [])
  useEffect(() => {
    let vigente = true
    const cargar = () =>
      obtenerLecturas(token, rango.v, rango.limite)
        .then((filas) => {
          if (!vigente) return
          ctl.current.poner(filas.map((f) => ({ ...f, t: new Date(f.ts).getTime() })), rango.v)
          setError('')
        })
        .catch((e) => vigente && setError(e.message))
    cargar()
    const id = setInterval(cargar, 30000)
    return () => {
      vigente = false
      clearInterval(id)
    }
  }, [token, rango])
  useEffect(() => {
    ctl.current?.umbral(umbral)
  }, [umbral])
  return (
    <Modulo
      num="05"
      titulo="Luz ambiente"
      clase="s12"
      extra={
        <div className="teclas" style={{ width: 220 }}>
          {RANGOS.map((r) => (
            <Tecla key={r.v} chica activo={r === rango} onClick={() => setRango(r)}>
              {r.t}
            </Tecla>
          ))}
        </div>
      }
    >
      {error && <p className="aviso error">No se pudieron cargar las lecturas: {error}</p>}
      <div className="rk-pantalla" id="grafica" ref={ref} />
    </Modulo>
  )
}

const NOMBRE_EVENTO = {
  estado: { ON: ['ON', 'verde', 'LAMPARA ENCENDIDA'], OFF: ['OFF', 'luz', 'LAMPARA APAGADA'] },
  modo: { AUTO: ['AUTO', 'nar', 'MODO AUTOMATICO'], ON: ['ON', 'luz', 'MODO MANUAL'], OFF: ['OFF', 'luz', 'MODO MANUAL'] },
  conexion: { en_linea: ['RED', 'verde', 'ARDUINO EN LINEA'], fuera_de_linea: ['RED', 'roja', 'ARDUINO SIN SENAL'] },
}
function PantallaEventos({ eventos }) {
  const ref = useRef(null)
  useEffect(() => {
    const capas = []
    eventos.slice(0, 4).forEach((e, i) => {
      const [corto, color, largo] = NOMBRE_EVENTO[e.tipo]?.[e.valor] ?? [String(e.valor).toUpperCase(), 'luz', String(e.tipo).toUpperCase()]
      const y = 4 + i * 30
      capas.push({ t: hhmm(e.ts), x: 4, y, color: 'tenue' }, { t: corto, x: 40, y, color }, { t: largo, x: 80, y })
    })
    if (!eventos.length) capas.push({ t: 'SIN EVENTOS TODAVIA', x: 4, y: 4, color: 'tenue' })
    pinta(ref.current, 300, 130, capas)
  }, [eventos])
  return (
    <div className="rk-pantalla">
      <svg ref={ref} />
    </div>
  )
}

function PantallaHoy({ s }) {
  const ref = useRef(null)
  useEffect(() => {
    const coma = (n, d) => (n == null ? '-' : n.toFixed(d).replace('.', ','))
    pinta(ref.current, 140, 130, [
      { seg: coma(s?.energia_wh, 2), x: 4, y: 8, alto: 26 },
      { t: 'WH', x: 4, y: 40, color: 'tenue' },
      { seg: coma(s?.minutos, 1), x: 4, y: 64, alto: 26, color: 'nar' },
      { t: 'MIN ENCENDIDA', x: 4, y: 96, color: 'tenue' },
      { t: 'ACUMULADO', x: 4, y: 116, color: 'tenue' },
    ])
  }, [s?.energia_wh, s?.minutos])
  return (
    <div className="rk-pantalla">
      <svg ref={ref} />
    </div>
  )
}

function Lampara({ encendida, tema }) {
  const ref = useRef(null)
  const ctl = useRef(null)
  useEffect(() => {
    ctl.current = crearLampara(ref.current, { paralaje: true, tema })
    return () => ctl.current.destruir()
  }, [])
  useEffect(() => ctl.current?.setNivel(encendida ? 1 : 0), [encendida])
  useEffect(() => ctl.current?.setTema(tema), [tema])

  // Luz nocturna de la página: apunta al suelo bajo la lámpara y le pasa las nubes a la escena 3D.
  const lienzoLuna = useRef(null)
  const luna = useRef(null)
  useEffect(() => {
    luna.current = crearLuna(lienzoLuna.current, {
      tema,
      objetivo: () => {
        const r = ref.current?.getBoundingClientRect()
        return r ? { x: r.left + r.width * 0.42, y: r.top + r.height * 0.82 } : null
      },
      alNube: (g) => ctl.current?.setNube(g),
    })
    return () => luna.current.destruir()
  }, [])
  useEffect(() => luna.current?.setTema(tema), [tema])

  return (
    <>
      <canvas className="rk-luna" ref={lienzoLuna} aria-hidden="true" />
      <div className="rk-lampara" ref={ref} aria-hidden="true" />
    </>
  )
}

const Led = ({ ok, desconocido, children }) => (
  <div>
    <i className={`estado-led ${desconocido ? 'neutro' : ok ? 'ok' : 'mal'}`} />
    <span className="serigrafia">{children}</span>
  </div>
)

function aviso({ conectado, intentos, estado, mqtt, enLinea }) {
  if (!conectado && (estado || intentos > 0)) return ['aviso', 'Se perdió la conexión en vivo. Reintentando… los mandos vuelven al reconectar.']
  if (!estado) return ['aviso', 'Conectando con el servidor…']
  if (!mqtt) return ['error', 'Sin conexión con el broker MQTT: no se pueden enviar órdenes.']
  if (!enLinea) return ['aviso', 'El Arduino está fuera de línea: las órdenes podrían no aplicarse.']
  return null
}

export default function Panel({ token, alSalir, alExpirar }) {
  const { estado, conectado, intentos } = useEnVivo(token, alExpirar)
  const { tema, elegir } = useTema()
  const s = estado?.snapshot
  const mqtt = !!estado?.mqtt_conectado
  const enLinea = !!estado?.arduino_en_linea
  const deshabilitado = !mqtt || !conectado

  // umbral mientras se gira la perilla (antes de que el Arduino lo confirme)
  const [umbralVivo, setUmbralVivo] = useState(null)
  const umbral = umbralVivo ?? s?.umbral ?? 512

  const modo = usePendiente(s?.modo)
  const umb = usePendiente(s?.umbral)
  const tie = usePendiente(s?.tiempo_s)
  const [fallo, setFallo] = useState('')

  useEffect(() => {
    if (umb.pendiente == null && s?.umbral != null) setUmbralVivo(null)
  }, [s?.umbral, umb.pendiente])

  const pedirModo = (v) => {
    if (v === s?.modo || v === modo.pendiente) return
    modo.iniciar(v)
    enviarModo(token, v).catch((e) => modo.fallar(e.message))
  }
  const pedirUmbral = (v) => {
    if (v === s?.umbral) return
    umb.iniciar(v)
    enviarUmbral(token, v).catch((e) => {
      umb.fallar(e.message)
      setUmbralVivo(null)
    })
  }
  const pedirTiempo = (v) => {
    if (v === s?.tiempo_s) return
    tie.iniciar(v)
    enviarTiempo(token, v).catch((e) => tie.fallar(e.message))
  }
  const avisoOrden = modo.aviso || umb.aviso || tie.aviso
  useEffect(() => setFallo(avisoOrden), [avisoOrden])

  const [eventos, setEventos] = useState([])
  const cargarEventos = useCallback(() => {
    obtenerEventos(token, 20).then(setEventos).catch(() => {})
  }, [token])
  useEffect(() => {
    cargarEventos()
    const id = setInterval(cargarEventos, 60000)
    return () => clearInterval(id)
  }, [cargarEventos])
  const huella = `${s?.estado}|${s?.modo}|${enLinea}`
  useEffect(() => {
    const t = setTimeout(cargarEventos, 600)
    return () => clearTimeout(t)
  }, [huella, cargarEventos])
  const ultimoCambio = eventos.find((e) => e.tipo === 'estado')?.ts

  const banda = aviso({ conectado, intentos, estado, mqtt, enLinea }) ?? (fallo ? ['error', fallo] : null)

  return (
    <div className="rp">
      <div className={`pagina ${banda ? 'con-aviso' : ''}`}>
        <header>
          <div className="marca">
            IoTLuz<span>La sala</span>
          </div>
          <div className="derecha">
            <div className="red" aria-live="polite">
              <Led ok={mqtt} desconocido={!conectado}>MQTT</Led>
              <Led ok={enLinea} desconocido={!conectado}>
                Arduino
              </Led>
            </div>
            <div className="teclas">
              <Tecla chica aria-label="Cambiar tema" onClick={() => elegir(tema === 'oscuro' ? 'claro' : 'oscuro')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              </Tecla>
              <Tecla chica aria-label="Salir" onClick={alSalir}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 3v8" />
                  <path d="M6.3 7a8 8 0 1 0 11.4 0" />
                </svg>
              </Tecla>
            </div>
          </div>
        </header>

        {banda && (
          <p className={`aviso ${banda[0] === 'error' ? 'error' : ''}`} role="status">
            {banda[1]}
          </p>
        )}

        <div className="pliegue">
          <Lampara encendida={s?.estado === 'ON'} tema={tema} />
          <div className="rack principal">
            <Modulo num="01" titulo="Estado" nota="en vivo" clase="s12">
              <PantallaEstado s={s} umbral={umbral} pendiente={modo.pendiente} ultimoCambio={ultimoCambio} />
              <p className="visualmente-oculto" aria-live="polite">
                La sala está {s?.estado === 'ON' ? 'encendida' : 'apagada'}, modo {s?.modo ?? 'desconocido'}, luz {s?.luz ?? '—'}.
              </p>
            </Modulo>
            <Modulo num="02" titulo="Modo" clase="s6 llena">
              <div className="teclas" id="modo" role="group" aria-label="Modo de la luz">
                {['ON', 'OFF', 'AUTO'].map((v) => (
                  <Tecla
                    key={v}
                    valor={v}
                    clase={v === 'AUTO' ? 'naranja' : 'clara'}
                    activo={(modo.pendiente ?? s?.modo) === v}
                    disabled={deshabilitado}
                    className={modo.pendiente === v ? 'esperando' : ''}
                    onClick={() => pedirModo(v)}
                  >
                    {v}
                  </Tecla>
                ))}
              </div>
            </Modulo>
            <Modulo num="03" titulo="Umbral" nota={umb.pendiente != null ? 'enviando…' : 'oscuridad'} clase="s6 llena">
              <Umbral confirmado={s?.umbral} deshabilitado={deshabilitado} alMover={setUmbralVivo} enviar={pedirUmbral} />
            </Modulo>
            <Modulo num="04" titulo="Apagar tras el movimiento" nota={tie.pendiente != null ? 'enviando…' : '1 s — 1 h'} clase="s12">
              <Tiempo confirmado={s?.tiempo_s} deshabilitado={deshabilitado} enviar={pedirTiempo} />
            </Modulo>
          </div>
        </div>
        <div className="bajar" aria-hidden="true">
          <span className="serigrafia suave">Historial</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>

        <div className="historial">
          <div className="rack">
            <Grafica token={token} umbral={umbral} />
            <Modulo num="06" titulo="Eventos" clase="s8">
              <PantallaEventos eventos={eventos} />
            </Modulo>
            <Modulo num="07" titulo="Consumo" clase="naranja s4">
              <PantallaHoy s={s} />
            </Modulo>
          </div>
        </div>
      </div>
    </div>
  )
}
