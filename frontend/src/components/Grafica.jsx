import { Download } from 'lucide-react'
import { memo, useEffect, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { descargarCsv, obtenerLecturas } from '../api.js'
import { formatoFechaHora, formatoHora, formatoHoraSeg } from '../formato.js'
import { Boton, Mensaje, Segmentado, Tarjeta } from '../ui/componentes.jsx'

const VENTANAS = [
  { id: '30m', etiqueta: '30 min', minutos: 30, limite: 400 },
  { id: '2h', etiqueta: '2 h', minutos: 120, limite: 1000 },
  { id: '24h', etiqueta: '24 h', minutos: 1440, limite: 5000 },
]
const RECARGA_MS = 30000
// Se guarda una lectura cada ~30 s; un salto mayor es un periodo sin datos (Arduino fuera de línea).
const HUECO_MS = 90000

/** Inserta un punto vacío en cada hueco para que la línea se corte en vez de inventar datos. */
function conHuecos(puntos) {
  const salida = []
  puntos.forEach((p, i) => {
    if (i > 0 && p.t - puntos[i - 1].t > HUECO_MS) {
      salida.push({ id: `hueco-${p.id}`, t: puntos[i - 1].t + 1, luz: null, umbral: null, hueco: true })
    }
    salida.push(p)
  })
  return salida
}

/**
 * Colores de la gráfica leídos de los tokens. La luz medida es ámbar; el umbral (un ajuste) es acento.
 * Se vuelven a leer cuando cambia el tema (atributo data-tema de <html>).
 */
function useColores() {
  const leer = () => {
    const css = getComputedStyle(document.documentElement)
    const v = (n) => css.getPropertyValue(n).trim()
    return {
      luz: v('--color-ambar'),
      umbral: v('--color-acento-texto'),
      rejilla: v('--color-borde'),
      eje: v('--color-texto-3'),
      cursor: v('--color-texto-3'),
      superficie: v('--color-superficie'),
    }
  }
  const [colores, setColores] = useState(leer)
  useEffect(() => {
    const obs = new MutationObserver(() => setColores(leer()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] })
    return () => obs.disconnect()
  }, [])
  return colores
}

function InfoPunto({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  if (p.hueco) return null
  return (
    <div className="tooltip">
      <p className="tooltip-hora">{formatoHoraSeg(p.t)}</p>
      <p>
        <span className="muestra muestra-luz" /> Luz <strong>{p.luz}</strong>
      </p>
      <p>
        <span className="muestra muestra-umbral" /> Umbral <strong>{p.umbral}</strong>
      </p>
      <p className="texto-3">Lámpara {p.estado === 'ON' ? 'encendida' : 'apagada'}</p>
    </div>
  )
}

// memo: el panel se redibuja con cada mensaje del WebSocket; la gráfica solo depende del token.
export default memo(function Grafica({ token }) {
  const [ventana, setVentana] = useState(VENTANAS[0])
  const [datos, setDatos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [descargando, setDescargando] = useState(false)
  const colores = useColores()

  useEffect(() => {
    // Una respuesta que llega después de cambiar de ventana (o desmontar) se descarta.
    let vigente = true
    const cargar = () => {
      obtenerLecturas(token, ventana.minutos, ventana.limite)
        .then((filas) => {
          if (!vigente) return
          setDatos(conHuecos(filas.map((f) => ({ ...f, t: new Date(f.ts).getTime() }))))
          setError('')
        })
        .catch((e) => vigente && setError(e.message))
        .finally(() => vigente && setCargando(false))
    }
    setDatos([]) // no mostrar los datos de la ventana anterior con la etiqueta de la nueva
    setCargando(true)
    cargar()
    const id = setInterval(cargar, RECARGA_MS)
    return () => {
      vigente = false
      clearInterval(id)
    }
  }, [token, ventana])

  const descargar = async () => {
    setDescargando(true)
    try {
      await descargarCsv(token)
    } catch (e) {
      setError(`No se pudo descargar el CSV: ${e.message}`)
    } finally {
      setDescargando(false)
    }
  }

  return (
    <Tarjeta className="grafica-tarjeta" aria-labelledby="titulo-grafica">
      <div className="grafica-cabecera">
        <div>
          <h2 id="titulo-grafica" className="tarjeta-titulo">
            Luz ambiente en el tiempo
          </h2>
          <ul className="leyenda" aria-label="Leyenda">
            <li>
              <span className="muestra muestra-luz" /> Luz medida
            </li>
            <li>
              <span className="muestra muestra-umbral" /> Umbral
            </li>
          </ul>
        </div>
        <div className="grafica-acciones">
          <Segmentado
            variante="filtro"
            etiqueta="Ventana de tiempo"
            valor={ventana.id}
            alCambiar={(id) => setVentana(VENTANAS.find((v) => v.id === id))}
            opciones={VENTANAS.map((v) => ({ valor: v.id, texto: v.etiqueta }))}
          />
          <Boton variante="secundario" tamano="sm" icono={Download} cargando={descargando} onClick={descargar}>
            {descargando ? 'Descargando…' : 'Descargar CSV'}
          </Boton>
        </div>
      </div>

      {error && <Mensaje tono="error">{error}</Mensaje>}

      <div className="grafica">
        {datos.length === 0 ? (
          <p className="grafica-vacia texto-3">
            {cargando ? 'Cargando lecturas…' : 'No hay lecturas en esta ventana. Se guarda una cada 30 s mientras el Arduino está en línea.'}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={datos} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="relleno-luz" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={colores.luz} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={colores.luz} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={colores.rejilla} vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={formatoHora}
                stroke={colores.eje}
                tick={{ fill: colores.eje, fontSize: 12 }}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                domain={[0, 1023]}
                ticks={[0, 256, 512, 768, 1023]}
                stroke={colores.eje}
                tick={{ fill: colores.eje, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip content={<InfoPunto />} cursor={{ stroke: colores.cursor, strokeWidth: 1 }} isAnimationActive={false} />
              <Line
                type="stepAfter"
                dataKey="umbral"
                name="Umbral"
                stroke={colores.umbral}
                strokeWidth={1.5}
                strokeDasharray="6 4"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="luz"
                name="Luz"
                stroke={colores.luz}
                strokeWidth={2.25}
                fill="url(#relleno-luz)"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: colores.superficie, fill: colores.luz }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {datos.length > 0 && (
        <details className="tabla-datos">
          <summary>Ver las últimas lecturas en tabla</summary>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Fecha y hora</th>
                  <th scope="col">Luz</th>
                  <th scope="col">Umbral</th>
                  <th scope="col">Movimiento</th>
                  <th scope="col">Lámpara</th>
                </tr>
              </thead>
              <tbody>
                {datos.filter((d) => !d.hueco).slice(-20).reverse().map((d) => (
                  <tr key={d.id}>
                    <td>{formatoFechaHora(d.ts)}</td>
                    <td className="num">{d.luz}</td>
                    <td className="num">{d.umbral}</td>
                    <td>{d.pir ? 'Sí' : 'No'}</td>
                    <td>{d.estado === 'ON' ? 'Encendida' : 'Apagada'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Tarjeta>
  )
})
