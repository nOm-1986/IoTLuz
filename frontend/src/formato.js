/** Texto de cada modo de la lámpara (estado actual y tabla de eventos). */
export const NOMBRE_MODO = { AUTO: 'Automático', ON: 'Manual: encendida', OFF: 'Manual: apagada' }

const fechaHora = new Intl.DateTimeFormat('es', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})
const hora = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })
const horaSeg = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const numero1 = new Intl.NumberFormat('es', { maximumFractionDigits: 1 })
const numero2 = new Intl.NumberFormat('es', { maximumFractionDigits: 2 })

export const formatoFechaHora = (iso) => fechaHora.format(new Date(iso))
export const formatoHora = (ms) => hora.format(new Date(ms))
export const formatoHoraSeg = (ms) => horaSeg.format(new Date(ms))
export const formatoDecimal = (n, dec = 1) => (n == null ? '—' : (dec === 2 ? numero2 : numero1).format(n))

export function formatoSegundos(s) {
  if (s == null) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const seg = s % 60
  const partes = []
  if (h) partes.push(`${h} h`)
  if (m) partes.push(`${m} min`)
  if (seg || partes.length === 0) partes.push(`${seg} s`)
  return partes.join(' ')
}

export function formatoMinutos(min) {
  if (min == null) return '—'
  if (min < 60) return `${formatoDecimal(min)} min`
  const h = Math.floor(min / 60)
  return `${h} h ${Math.round(min - h * 60)} min`
}

export function haceCuanto(iso, ahora = Date.now()) {
  if (!iso) return 'sin datos en vivo'
  const s = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 1000))
  if (s < 5) return 'ahora mismo'
  if (s < 60) return `hace ${s} s`
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  return `el ${formatoFechaHora(iso)}`
}
