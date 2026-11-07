import { NOMBRE_MODO, formatoFechaHora } from '../formato.js'

const TIPO = { estado: 'Lámpara', modo: 'Modo', conexion: 'Arduino' }
const VALOR = {
  estado: { ON: 'Encendida', OFF: 'Apagada' },
  modo: NOMBRE_MODO,
  conexion: { en_linea: 'En línea', fuera_de_linea: 'Fuera de línea' },
}

export default function Eventos({ eventos, error }) {
  return (
    <section className="tarjeta" aria-labelledby="titulo-eventos">
      <h2 id="titulo-eventos" className="titulo-tarjeta">Últimos eventos</h2>
      {error && <p className="mensaje error">No se pudieron cargar los eventos: {error}</p>}
      {eventos.length === 0 ? (
        <p className="tenue">Todavía no hay eventos registrados.</p>
      ) : (
        <div className="tabla-scroll alta">
          <table>
            <thead>
              <tr>
                <th scope="col">Fecha y hora</th>
                <th scope="col">Qué cambió</th>
                <th scope="col">Nuevo valor</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.id}>
                  <td>{formatoFechaHora(e.ts)}</td>
                  <td>{TIPO[e.tipo] ?? e.tipo}</td>
                  <td>
                    <span className={`etiqueta etiqueta-${e.tipo}-${e.valor}`}>{VALOR[e.tipo]?.[e.valor] ?? e.valor}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
