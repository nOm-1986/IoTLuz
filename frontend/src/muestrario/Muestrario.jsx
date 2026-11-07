import {
  Download,
  Lightbulb,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Sun,
  SunDim,
  Timer,
  TimerReset,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTema } from '../tema/tema.js'
import { Boton, Chip, Deslizador, Disco, Interruptor, Marca, Segmentado, Tarjeta } from '../ui/componentes.jsx'

/* ---------------------------------------------------------------- datos */
const COLORES = [
  {
    grupo: 'Superficies',
    nota: 'Oscuridad con un tinte violeta. Cada nivel se separa por luz, no por bordes.',
    tokens: ['fondo', 'superficie', 'superficie-2', 'superficie-3', 'borde', 'borde-control'],
  },
  { grupo: 'Texto', nota: 'Tres niveles; todos ≥ 4,5:1 sobre las superficies.', tokens: ['texto', 'texto-2', 'texto-3'] },
  {
    grupo: 'Violeta · interfaz',
    nota: 'Controles, selección y foco. Nunca significa “encendido”.',
    tokens: ['violeta', 'violeta-boton', 'violeta-texto', 'violeta-suave'],
  },
  {
    grupo: 'Ámbar · luz',
    nota: 'Solo para la luz encendida y la luz medida. Si algo es ámbar, hay luz.',
    tokens: ['ambar', 'ambar-texto', 'ambar-suave'],
  },
  { grupo: 'Estados', nota: 'Conexión y errores; discretos para no competir con la luz.', tokens: ['ok', 'mal', 'aviso'] },
]

const ESCALA = [
  ['--t-4xl', 'La sala', 'Titulares y estado principal'],
  ['--t-3xl', '731', 'Cifras protagonistas (tabulares)'],
  ['--t-2xl', 'Encendida', 'Estado en tarjetas'],
  ['--t-xl', 'Luz ambiente en el tiempo', 'Títulos de sección'],
  ['--t-lg', 'Umbral de oscuridad', 'Títulos de tarjeta, valores de control'],
  ['--t-md', 'Automático · encendida por movimiento', 'Subtítulos'],
  ['--t-base', 'Se apaga 2 min después del último movimiento.', 'Texto'],
  ['--t-sm', 'Confirmado por el Arduino hace 4 s', 'Ayudas y metadatos'],
  ['--t-xs', '7/11 · 21:03:12', 'Marcas de tiempo'],
]

const RADIOS = ['--radio-xs', '--radio-sm', '--radio-md', '--radio-lg', '--radio-pildora']
const ESPACIOS = ['--esp-1', '--esp-2', '--esp-3', '--esp-4', '--esp-6', '--esp-7', '--esp-9', '--esp-10']
const DURACIONES = [
  ['--dur-rapida', 'Hover y color'],
  ['--dur-media', 'Interruptores y segmentos'],
  ['--dur-lenta', 'Entradas de contenido'],
  ['--dur-encendido', 'La luz “calienta” al encender'],
]

const MODOS = [
  { valor: 'ON', texto: 'ON', luz: true, titulo: 'Encender siempre' },
  { valor: 'OFF', texto: 'OFF', titulo: 'Apagar siempre' },
  { valor: 'AUTO', texto: 'AUTO', titulo: 'Según luz y movimiento' },
]

const formatoTiempo = (s) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`)

/* ----------------------------------------------------------- utilidades */
function useValoresCss(nombres, tema) {
  const [valores, setValores] = useState({})
  useEffect(() => {
    const css = getComputedStyle(document.documentElement)
    setValores(Object.fromEntries(nombres.map((n) => [n, css.getPropertyValue(n).trim()])))
  }, [nombres, tema])
  return valores
}

/** Simula el viaje de una orden: enviada → (1,2 s) → confirmada por el dispositivo. */
function useOrdenSimulada(inicial) {
  const [confirmado, setConfirmado] = useState(inicial)
  const [pendiente, setPendiente] = useState(null)
  const t = useRef()
  useEffect(() => () => clearTimeout(t.current), [])
  const pedir = (v) => {
    if (v === confirmado) return
    setPendiente(v)
    clearTimeout(t.current)
    t.current = setTimeout(() => {
      setConfirmado(v)
      setPendiente(null)
    }, 1200)
  }
  return { confirmado, pendiente, pedir }
}

function Seccion({ id, titulo, descripcion, children }) {
  return (
    <section className="mu-seccion" aria-labelledby={id}>
      <div className="mu-seccion-cabecera">
        <h2 id={id}>{titulo}</h2>
        {descripcion && <p className="texto-2">{descripcion}</p>}
      </div>
      {children}
    </section>
  )
}

function Ejemplo({ titulo, children, ancho }) {
  return (
    <div className={`mu-ejemplo ${ancho ? 'mu-ejemplo-ancho' : ''}`}>
      <p className="mu-ejemplo-titulo texto-3">{titulo}</p>
      <div className="mu-ejemplo-cuerpo">{children}</div>
    </div>
  )
}

/* ------------------------------------------------- composición de ejemplo */
function DemoSala() {
  const modo = useOrdenSimulada('AUTO')
  const [umbral, setUmbral] = useState(400)
  const [tiempo, setTiempo] = useState(120)
  const luzAmbiente = 312 // dato de ejemplo
  const oscuro = luzAmbiente < umbral
  const encendida = modo.confirmado === 'ON' || (modo.confirmado === 'AUTO' && oscuro)
  const razon =
    modo.confirmado === 'AUTO'
      ? oscuro
        ? 'Automático · está más oscuro que el umbral'
        : 'Automático · hay suficiente luz'
      : modo.confirmado === 'ON'
        ? 'Encendida a mano'
        : 'Apagada a mano'

  return (
    <div className="demo-sala">
      <Tarjeta encendida={encendida} destacada className="demo-principal" aria-labelledby="demo-titulo">
        <div className="demo-cabecera">
          <Disco icono={Lightbulb} encendido={encendida} />
          <div className="demo-chips">
            <Chip tono="ok" vivo>
              Arduino en línea
            </Chip>
          </div>
        </div>
        <h3 id="demo-titulo" className="demo-titulo">
          La sala
        </h3>
        <p className={`demo-estado ${encendida ? 'on' : ''}`} aria-live="polite">
          {encendida ? 'Encendida' : 'Apagada'}
        </p>
        <p className="texto-2 demo-razon">{razon}</p>

        <div className="demo-modo">
          <Segmentado
            etiqueta="Modo de la luz"
            opciones={MODOS}
            valor={modo.confirmado}
            pendiente={modo.pendiente}
            alCambiar={modo.pedir}
            ancho
          />
          <p className="texto-3 demo-ayuda" aria-live="polite">
            {modo.pendiente ? `Enviado ${modo.pendiente}. Esperando al Arduino…` : 'Resaltado: lo que confirma el Arduino.'}
          </p>
        </div>
      </Tarjeta>

      <Tarjeta className="demo-ajustes" aria-label="Ajustes de ejemplo">
        <Deslizador
          etiqueta="Umbral de oscuridad"
          valor={umbral}
          min={1}
          max={1023}
          alCambiar={setUmbral}
          iconoMin={Moon}
          iconoMax={Sun}
          pie={`Luz ahora: ${luzAmbiente} · ${oscuro ? 'por debajo del umbral' : 'por encima del umbral'}`}
        />
        <Deslizador
          etiqueta="Apagar tras el último movimiento"
          valor={tiempo}
          min={10}
          max={600}
          paso={10}
          alCambiar={setTiempo}
          formato={formatoTiempo}
          tono="ambar"
          iconoMin={Timer}
          iconoMax={TimerReset}
        />
        <p className="texto-3 demo-nota">Demostración con datos de ejemplo: no envía nada al Arduino.</p>
      </Tarjeta>
    </div>
  )
}

/* -------------------------------------------------------------- página */
export default function Muestrario() {
  const { preferencia, tema, elegir } = useTema()
  const todos = COLORES.flatMap((g) => g.tokens.map((t) => `--color-${t}`))
  const valores = useValoresCss(todos, tema)

  const [interruptores, setInterruptores] = useState({ a: false, b: true, c: true })
  const pendienteSw = useOrdenSimulada(false)
  const filtro = useState('2h')
  const modoAuto = useState('AUTO')
  const [deslizador, setDeslizador] = useState(640)

  return (
    <div className="mu">
      <header className="mu-cabecera">
        <div className="mu-marca">
          <Marca />
          <div>
            <p className="mu-nombre">IoTLuz</p>
            <p className="texto-3 mu-sub">Sistema visual · paso 1</p>
          </div>
        </div>
        <Segmentado
          variante="filtro"
          etiqueta="Tema"
          valor={preferencia}
          alCambiar={elegir}
          opciones={[
            { valor: 'sistema', texto: 'Sistema' },
            { valor: 'claro', texto: 'Claro' },
            { valor: 'oscuro', texto: 'Oscuro' },
          ]}
        />
      </header>

      <main className="mu-contenido">
        <div className="mu-intro">
          <h1 className="mu-titular">
            Violeta para la interfaz.
            <br />
            <span className="mu-titular-luz">Ámbar para la luz.</span>
          </h1>
          <p className="texto-2 mu-intro-texto">
            Página de prueba con los tokens y los componentes base del rediseño. No forma parte de la app ni cambia su
            comportamiento. Tema activo: <strong>{tema}</strong>
            {preferencia === 'sistema' ? ' (según el sistema)' : ''}.
          </p>
        </div>

        <Seccion
          id="s-demo"
          titulo="Composición de ejemplo"
          descripcion="Los componentes juntos. Cambia el modo o el umbral: en AUTO la luz se enciende cuando la luz ambiente baja del umbral."
        >
          <DemoSala />
        </Seccion>

        <Seccion id="s-color" titulo="Color" descripcion="Valores leídos en vivo del tema activo.">
          <div className="mu-colores">
            {COLORES.map((g) => (
              <div key={g.grupo} className="mu-grupo-color">
                <h3>{g.grupo}</h3>
                <p className="texto-3 mu-nota">{g.nota}</p>
                <ul className="mu-muestras">
                  {g.tokens.map((t) => (
                    <li key={t}>
                      <span className="mu-muestra" style={{ background: `var(--color-${t})` }} />
                      <span className="mu-token">--color-{t}</span>
                      <span className="mu-valor texto-3">{valores[`--color-${t}`]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Seccion>

        <Seccion id="s-tipo" titulo="Tipografía" descripcion="Urbanist (variable, servida desde el propio sitio). Escala de 12 a 80 px.">
          <ol className="mu-escala">
            {ESCALA.map(([token, texto, uso]) => (
              <li key={token}>
                <span className="mu-escala-meta texto-3">
                  <code>{token}</code>
                  <span>{uso}</span>
                </span>
                <span
                  className={`mu-escala-texto ${token === '--t-3xl' ? 'cifra' : ''}`}
                  style={{ fontSize: `var(${token})` }}
                >
                  {texto}
                </span>
              </li>
            ))}
          </ol>
        </Seccion>

        <Seccion id="s-botones" titulo="Botón">
          <div className="mu-rejilla">
            <Ejemplo titulo="Primario · secundario · fantasma">
              <Boton variante="primario">Entrar</Boton>
              <Boton icono={Download}>Descargar CSV</Boton>
              <Boton variante="fantasma" icono={LogOut}>
                Salir
              </Boton>
            </Ejemplo>
            <Ejemplo titulo="Solo icono · pequeño">
              <Boton soloIcono icono={Plus} etiqueta="Añadir" />
              <Boton soloIcono variante="primario" icono={Moon} etiqueta="Modo noche" />
              <Boton tamano="sm" icono={RefreshCw}>
                Reintentar
              </Boton>
            </Ejemplo>
            <Ejemplo titulo="Cargando · deshabilitado">
              <Boton variante="primario" cargando>
                Entrando…
              </Boton>
              <Boton disabled>No disponible</Boton>
            </Ejemplo>
          </div>
        </Seccion>

        <Seccion id="s-interruptor" titulo="Interruptor" descripcion="Violeta para ajustes; ámbar cuando lo que enciende es una luz.">
          <div className="mu-rejilla">
            <Ejemplo titulo="Violeta">
              <Interruptor
                etiqueta="Avisos"
                marcado={interruptores.a}
                alCambiar={(v) => setInterruptores((s) => ({ ...s, a: v }))}
              />
              <Interruptor
                etiqueta="Guardar historial"
                marcado={interruptores.b}
                alCambiar={(v) => setInterruptores((s) => ({ ...s, b: v }))}
              />
            </Ejemplo>
            <Ejemplo titulo="Ámbar · luz">
              <Interruptor
                tono="ambar"
                etiqueta="Luz de la sala"
                marcado={interruptores.c}
                alCambiar={(v) => setInterruptores((s) => ({ ...s, c: v }))}
              />
            </Ejemplo>
            <Ejemplo titulo="Pendiente de confirmar · deshabilitado">
              <Interruptor
                tono="ambar"
                etiqueta={pendienteSw.pendiente != null ? 'Esperando…' : 'Pulsa para enviar'}
                marcado={pendienteSw.pendiente ?? pendienteSw.confirmado}
                pendiente={pendienteSw.pendiente != null}
                alCambiar={pendienteSw.pedir}
              />
              <Interruptor etiqueta="Sin conexión" marcado={false} disabled />
            </Ejemplo>
          </div>
        </Seccion>

        <Seccion
          id="s-segmentado"
          titulo="Control segmentado"
          descripcion="«Orden» manda al dispositivo y pesa más; «filtro» solo cambia la vista."
        >
          <div className="mu-rejilla">
            <Ejemplo titulo="Orden · AUTO activo">
              <Segmentado etiqueta="Modo" opciones={MODOS} valor={modoAuto[0]} alCambiar={modoAuto[1]} />
            </Ejemplo>
            <Ejemplo titulo="Orden · ON activo (luz)">
              <Segmentado etiqueta="Modo encendido" opciones={MODOS} valor="ON" />
            </Ejemplo>
            <Ejemplo titulo="Orden · OFF enviado, esperando">
              <Segmentado etiqueta="Modo pendiente" opciones={MODOS} valor="AUTO" pendiente="OFF" />
            </Ejemplo>
            <Ejemplo titulo="Filtro">
              <Segmentado
                variante="filtro"
                etiqueta="Ventana de tiempo"
                valor={filtro[0]}
                alCambiar={filtro[1]}
                opciones={[
                  { valor: '30m', texto: '30 min' },
                  { valor: '2h', texto: '2 h' },
                  { valor: '24h', texto: '24 h' },
                ]}
              />
            </Ejemplo>
            <Ejemplo titulo="Deshabilitado">
              <Segmentado etiqueta="Modo sin conexión" opciones={MODOS} valor="AUTO" disabled />
            </Ejemplo>
          </div>
        </Seccion>

        <Seccion id="s-deslizador" titulo="Deslizador" descripcion="Relleno luminoso hasta el valor. Zona táctil de 44 px.">
          <div className="mu-rejilla mu-rejilla-2">
            <Ejemplo titulo="Violeta · con iconos" ancho>
              <Deslizador
                etiqueta="Umbral de oscuridad"
                valor={deslizador}
                min={1}
                max={1023}
                alCambiar={setDeslizador}
                iconoMin={SunDim}
                iconoMax={Sun}
                pie="Confirmado por el Arduino: 400"
              />
            </Ejemplo>
            <Ejemplo titulo="Deshabilitado" ancho>
              <Deslizador etiqueta="Umbral de oscuridad" valor={400} min={1} max={1023} disabled pie="Sin conexión en vivo" />
            </Ejemplo>
          </div>
        </Seccion>

        <Seccion id="s-chip" titulo="Chip de estado" descripcion="El estado «mal» usa un punto cuadrado: no depende solo del color.">
          <div className="mu-rejilla">
            <Ejemplo titulo="Conexión">
              <Chip tono="ok" vivo>
                Arduino en línea
              </Chip>
              <Chip tono="mal">Arduino fuera de línea</Chip>
              <Chip tono="aviso" icono={WifiOff}>
                Reconectando…
              </Chip>
              <Chip icono={Wifi}>Broker: sin datos</Chip>
            </Ejemplo>
            <Ejemplo titulo="Luz e interfaz">
              <Chip tono="ambar">Encendida</Chip>
              <Chip tono="violeta">Automático</Chip>
              <Chip>Apagada</Chip>
            </Ejemplo>
          </div>
        </Seccion>

        <Seccion id="s-tarjeta" titulo="Tarjeta" descripcion="Superficie en relieve: luz desde arriba a la izquierda, sombra abajo a la derecha. Los discos de icono sobresalen; encendida = resplandor ámbar.">
          <div className="mu-tarjetas">
            <Tarjeta as="div">
              <Disco icono={Wifi} tamano="sm" tono="violeta" />
              <h3>Normal</h3>
              <p className="texto-2">Sobresale del fondo, con un filo de luz arriba.</p>
            </Tarjeta>
            <Tarjeta as="div" destacada>
              <Disco icono={SunDim} tamano="sm" tono="violeta" />
              <h3>Destacada</h3>
              <p className="texto-2">Resplandor violeta: el bloque principal.</p>
            </Tarjeta>
            <Tarjeta as="div" encendida>
              <Disco icono={Lightbulb} tamano="sm" encendido />
              <h3>Encendida</h3>
              <p className="texto-2">La luz está encendida.</p>
            </Tarjeta>
            <Tarjeta as="div" elevada compacta>
              <Disco icono={Timer} tamano="sm" tono="violeta" />
              <h3>Elevada · compacta</h3>
              <p className="texto-2">Para elementos flotantes.</p>
            </Tarjeta>
          </div>
        </Seccion>

        <Seccion id="s-forma" titulo="Forma, espacio y movimiento">
          <div className="mu-rejilla mu-rejilla-3">
            <Ejemplo titulo="Radios">
              <div className="mu-radios">
                {RADIOS.map((r) => (
                  <div key={r} className="mu-radio" style={{ borderRadius: `var(${r})` }}>
                    <code>{r.replace('--radio-', '')}</code>
                  </div>
                ))}
              </div>
            </Ejemplo>
            <Ejemplo titulo="Espaciado (base 4 px)">
              <ul className="mu-espacios">
                {ESPACIOS.map((e) => (
                  <li key={e}>
                    <code>{e}</code>
                    <span style={{ width: `var(${e})` }} />
                  </li>
                ))}
              </ul>
            </Ejemplo>
            <Ejemplo titulo="Duraciones (pasa el ratón)">
              <ul className="mu-duraciones">
                {DURACIONES.map(([d, uso]) => (
                  <li key={d} style={{ '--d': `var(${d})` }}>
                    <span className="mu-pista">
                      <span />
                    </span>
                    <code>{d}</code>
                    <span className="texto-3">{uso}</span>
                  </li>
                ))}
              </ul>
            </Ejemplo>
          </div>
        </Seccion>
      </main>
    </div>
  )
}
