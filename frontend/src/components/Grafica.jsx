import { useCallback, useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { descargarCsv, obtenerLecturas } from '../api.js'
import { formatoFechaHora, formatoHora, formatoHoraSeg } from '../formato.js'

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

/** Colores de la gráfica leídos de las variables CSS (cambian con el modo claro/oscuro). */
function useColores() {
  const leer = () => {
    const css = getComputedStyle(document.documentElement)
    const v = (n) => css.getPropertyValue(n).trim()
    return {
      luz: v('--serie-1'),
      umbral: v('--texto-secundario'),
      rejilla: v('--rejilla'),
      eje: v('--texto-tenue'),
      cursor: v('--texto-tenue'),
    }
  }
  const [colores, setColores] = useState(leer)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const cambiar = () => setColores(leer())
    mq.addEventListener('change', cambiar)
    return () => mq.removeEventListener('change', cambiar)
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
      <p className="tenue">Lámpara {p.estado === 'ON' ? 'encendida' : 'apagada'}</p>
    </div>
  )
}

export default function Grafica({ token }) {
  const [ventana, setVentana] = useState(VENTANAS[0])
  const [datos, setDatos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [descargando, setDescargando] = useState(false)
  const colores = useColores()

  const cargar = useCallback(() => {
    obtenerLecturas(token, ventana.minutos, ventana.limite)
      .then((filas) => {
        setDatos(conHuecos(filas.map((f) => ({ ...f, t: new Date(f.ts).getTime() }))))
        setError('')
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false))
  }, [token, ventana])

  useEffect(() => {
    setCargando(true)
    cargar()
    const id = setInterval(cargar, RECARGA_MS)
    return () => clearInterval(id)
  }, [cargar])

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
    <section className="tarjeta" aria-labelledby="titulo-grafica">
      <div className="tarjeta-cabecera">
        <h2 id="titulo-grafica" className="titulo-tarjeta">Luz ambiente en el tiempo</h2>
        <div className="acciones">
          <div className="segmentado pequeno" role="group" aria-label="Ventana de tiempo">
            {VENTANAS.map((v) => (
              <button
                key={v.id}
                className={`segmento ${v.id === ventana.id ? 'activo' : ''}`}
                aria-pressed={v.id === ventana.id}
                onClick={() => setVentana(v)}
              >
                {v.etiqueta}
              </button>
            ))}
          </div>
          <button className="boton secundario" onClick={descargar} disabled={descargando}>
            {descargando ? 'Descargando…' : 'Descargar CSV'}
          </button>
        </div>
      </div>

      <ul className="leyenda" aria-label="Leyenda">
        <li>
          <span className="muestra muestra-luz" /> Luz (LDR)
        </li>
        <li>
          <span className="muestra muestra-umbral" /> Umbral
        </li>
      </ul>

      {error && <p className="mensaje error">{error}</p>}

      <div className="grafica">
        {datos.length === 0 ? (
          <p className="grafica-vacia tenue">
            {cargando ? 'Cargando lecturas…' : 'No hay lecturas en esta ventana. Se guarda una cada 30 s mientras el Arduino está en línea.'}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={datos} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
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
              <Line
                type="monotone"
                dataKey="luz"
                name="Luz"
                stroke={colores.luz}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--superficie)' }}
                isAnimationActive={false}
              />
            </LineChart>
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
    </section>
  )
}
