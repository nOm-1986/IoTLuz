// Componentes base de IoTLuz. Solo presentación: el estado y la lógica los pone quien los usa.
import { CircleAlert, Info, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useId } from 'react'
import './ui.css'

const clases = (...c) => c.filter(Boolean).join(' ')

/** Superficie suave. `encendida` la ilumina en ámbar (luz encendida); `destacada`, en violeta. */
export function Tarjeta({ as: Etiqueta = 'section', encendida, destacada, elevada, compacta, className, children, ...resto }) {
  return (
    <Etiqueta
      className={clases(
        'tarjeta',
        encendida && 'tarjeta-encendida',
        destacada && !encendida && 'tarjeta-destacada',
        elevada && 'tarjeta-elevada',
        compacta && 'tarjeta-compacta',
        className,
      )}
      {...resto}
    >
      {children}
    </Etiqueta>
  )
}

/** Disco de icono en relieve. `encendido` lo ilumina en ámbar; `tono="violeta"` para iconos de interfaz. */
export function Disco({ icono: Icono, encendido, tono, tamano, className, ...resto }) {
  return (
    <div
      className={clases(
        'disco',
        tamano === 'sm' && 'disco-sm',
        tono === 'violeta' && 'disco-violeta',
        encendido && 'disco-encendido',
        className,
      )}
      aria-hidden="true"
      {...resto}
    >
      {Icono && <Icono size={tamano === 'sm' ? 20 : 26} strokeWidth={1.6} />}
    </div>
  )
}

/**
 * Botón. variante: 'primario' | 'secundario' | 'fantasma'. Con `icono` y sin texto visible
 * es un botón redondo: entonces `etiqueta` es obligatoria (nombre accesible).
 */
export function Boton({
  variante = 'secundario',
  tamano,
  icono: Icono,
  soloIcono,
  etiqueta,
  ancho,
  cargando,
  className,
  children,
  type = 'button',
  disabled,
  ...resto
}) {
  const IconoFinal = cargando ? LoaderCircle : Icono
  return (
    <button
      type={type}
      className={clases(
        'boton',
        `boton-${variante}`,
        tamano === 'sm' && 'boton-sm',
        soloIcono && 'boton-icono',
        ancho && 'boton-ancho',
        cargando && 'boton-cargando',
        className,
      )}
      aria-label={soloIcono ? etiqueta : undefined}
      aria-busy={cargando || undefined}
      disabled={disabled || cargando}
      {...resto}
    >
      {IconoFinal && <IconoFinal size={tamano === 'sm' ? 16 : 18} strokeWidth={1.75} aria-hidden="true" />}
      {!soloIcono && children}
    </button>
  )
}

/**
 * Interruptor (role="switch"). `tono="ambar"` para lo que enciende una luz.
 * `pendiente`: la orden se envió y aún no está confirmada.
 */
export function Interruptor({ marcado, alCambiar, etiqueta, ocultarEtiqueta, tono, pendiente, disabled, className, ...resto }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!marcado}
      aria-label={ocultarEtiqueta ? etiqueta : undefined}
      data-pendiente={pendiente || undefined}
      disabled={disabled}
      onClick={() => alCambiar?.(!marcado)}
      className={clases('interruptor', tono === 'ambar' && 'interruptor-ambar', className)}
      {...resto}
    >
      {!ocultarEtiqueta && <span className="interruptor-etiqueta">{etiqueta}</span>}
      <span className="interruptor-pista" aria-hidden="true">
        <span className="interruptor-perilla" />
      </span>
    </button>
  )
}

/**
 * Control segmentado (botones con aria-pressed dentro de un grupo).
 * opciones: [{ valor, texto, luz?, titulo? }]. `luz: true` pinta el segmento activo en ámbar.
 * variante 'orden' (manda al dispositivo) o 'filtro' (solo cambia la vista: más ligera).
 */
export function Segmentado({ opciones, valor, pendiente, alCambiar, etiqueta, variante = 'orden', ancho, disabled, className }) {
  return (
    <div
      role="group"
      aria-label={etiqueta}
      className={clases('segmentado', variante === 'filtro' && 'segmentado-filtro', ancho && 'segmentado-ancho', className)}
    >
      {opciones.map((o) => {
        const activo = o.valor === valor
        const enEspera = pendiente != null && o.valor === pendiente && !activo
        return (
          <button
            key={o.valor}
            type="button"
            className="segmento"
            aria-pressed={activo}
            data-luz={o.luz || undefined}
            data-pendiente={enEspera || undefined}
            title={o.titulo}
            disabled={disabled}
            onClick={() => alCambiar?.(o.valor)}
          >
            {o.texto}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Deslizador con relleno luminoso. Controlado: `valor` + `alCambiar` (mientras se mueve) y
 * `alSoltar` (al terminar: ahí se envía la orden). `textoValor` alimenta aria-valuetext.
 */
export function Deslizador({
  etiqueta,
  valor,
  min = 0,
  max = 100,
  paso = 1,
  alCambiar,
  alSoltar,
  formato = String,
  tono,
  iconoMin: IconoMin,
  iconoMax: IconoMax,
  pie,
  alPerderFoco,
  disabled,
  className,
}) {
  const id = useId()
  const pct = max > min ? ((valor - min) / (max - min)) * 100 : 0
  const soltar = () => alSoltar?.(valor)
  return (
    <div className={clases('deslizador', tono === 'ambar' && 'deslizador-ambar', className)}>
      <div className="deslizador-cabecera">
        <label htmlFor={id} className="deslizador-etiqueta">
          {etiqueta}
        </label>
        <output htmlFor={id} className="deslizador-valor">
          {formato(valor)}
        </output>
      </div>
      <div className="deslizador-fila">
        {IconoMin && <IconoMin size={18} strokeWidth={1.75} aria-hidden="true" />}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={paso}
          value={valor}
          disabled={disabled}
          aria-valuetext={formato(valor)}
          style={{ '--pct': `${pct}%` }}
          onChange={(e) => alCambiar?.(Number(e.target.value))}
          onPointerUp={soltar}
          onBlur={alPerderFoco}
          onKeyUp={(e) => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) soltar()
          }}
        />
        {IconoMax && <IconoMax size={18} strokeWidth={1.75} aria-hidden="true" />}
      </div>
      {pie && <p className="deslizador-pie">{pie}</p>}
    </div>
  )
}

/**
 * Chip de estado. tono: 'ok' | 'mal' | 'aviso' | 'ambar' | 'violeta' | 'neutro'.
 * `vivo` hace latir el punto (dato en directo). `icono` sustituye al punto.
 */
export function Chip({ tono = 'neutro', icono: Icono, vivo, className, children, ...resto }) {
  return (
    <span className={clases('chip', tono !== 'neutro' && `chip-${tono}`, vivo && 'chip-vivo', className)} {...resto}>
      {Icono ? <Icono size={14} strokeWidth={2} aria-hidden="true" /> : <span className="chip-punto" aria-hidden="true" />}
      {children}
    </span>
  )
}

/** Campo de texto con etiqueta visible. El input va hundido en la superficie. */
export function Campo({ etiqueta, className, ...resto }) {
  const id = useId()
  return (
    <div className={clases('campo', className)}>
      <label htmlFor={id} className="campo-etiqueta">
        {etiqueta}
      </label>
      <input id={id} className="campo-input" {...resto} />
    </div>
  )
}

const ICONO_MENSAJE = { error: CircleAlert, aviso: TriangleAlert, info: Info }

/** Mensaje en línea. tono: 'error' | 'aviso' | 'info'. Los errores se anuncian con role="alert". */
export function Mensaje({ tono = 'info', className, children, ...resto }) {
  const Icono = ICONO_MENSAJE[tono] ?? Info
  return (
    <p
      className={clases('mensaje', `mensaje-${tono}`, className)}
      role={tono === 'error' ? 'alert' : 'status'}
      {...resto}
    >
      <Icono size={18} strokeWidth={1.9} aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

/** Marca de IoTLuz: una bombilla encendida (el círculo es luz, el casquillo no). */
export function Marca({ tamano = 36, className }) {
  return (
    <svg className={clases('marca-iotluz', className)} width={tamano} height={tamano} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="13" r="9" className="marca-luz" />
      <rect x="11" y="23" width="10" height="3" rx="1.5" className="marca-casquillo" />
      <rect x="12.5" y="27" width="7" height="2.5" rx="1.25" className="marca-casquillo" />
    </svg>
  )
}
