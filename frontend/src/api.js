// Cliente de la API. Rutas relativas: en desarrollo las reenvía Vite y en producción Caddy.

const CLAVE_TOKEN = 'iotluz_token'

export function leerToken() {
  try {
    return sessionStorage.getItem(CLAVE_TOKEN)
  } catch {
    return null
  }
}

export function guardarToken(token) {
  try {
    if (token) sessionStorage.setItem(CLAVE_TOKEN, token)
    else sessionStorage.removeItem(CLAVE_TOKEN)
  } catch {
    /* sin sessionStorage: el token vive solo en memoria */
  }
}

export class ErrorApi extends Error {
  constructor(mensaje, estado, cabeceras) {
    super(mensaje)
    this.estado = estado
    this.cabeceras = cabeceras
  }
}

let alNoAutorizado = () => {}
export function configurarNoAutorizado(fn) {
  alNoAutorizado = fn
}

async function mensajeDeError(r) {
  try {
    const cuerpo = await r.json()
    if (typeof cuerpo.detail === 'string') return cuerpo.detail
    if (Array.isArray(cuerpo.detail)) return 'Valor no válido'
  } catch {
    /* respuesta sin JSON */
  }
  return `Error ${r.status}`
}

async function pedir(ruta, { token, metodo = 'GET', cuerpo } = {}) {
  const cabeceras = {}
  if (token) cabeceras.Authorization = `Bearer ${token}`
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json'
  let r
  try {
    r = await fetch(`/api${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    })
  } catch {
    throw new ErrorApi('No se pudo contactar con el servidor', 0)
  }
  if (r.status === 401 && token) {
    alNoAutorizado()
    throw new ErrorApi('La sesión ha expirado', 401)
  }
  if (!r.ok) throw new ErrorApi(await mensajeDeError(r), r.status, r.headers)
  return r
}

export async function iniciarSesion(usuario, clave) {
  const r = await pedir('/login', { metodo: 'POST', cuerpo: { usuario, clave } })
  return (await r.json()).token
}

export const obtenerEstado = (token) => pedir('/estado', { token }).then((r) => r.json())

export const obtenerLecturas = (token, minutos, limite) =>
  pedir(`/lecturas?minutos=${minutos}&limite=${limite}`, { token }).then((r) => r.json())

export const obtenerEventos = (token, limite = 50) =>
  pedir(`/eventos?limite=${limite}`, { token }).then((r) => r.json())

export const enviarModo = (token, modo) =>
  pedir('/orden', { token, metodo: 'POST', cuerpo: { modo } }).then((r) => r.json())

export const enviarUmbral = (token, valor) =>
  pedir('/umbral', { token, metodo: 'POST', cuerpo: { valor } }).then((r) => r.json())

export const enviarTiempo = (token, segundos) =>
  pedir('/tiempo', { token, metodo: 'POST', cuerpo: { segundos } }).then((r) => r.json())

/** Descarga el CSV con el token en la cabecera (un enlace normal no puede enviarlo). */
export async function descargarCsv(token) {
  const r = await pedir('/lecturas.csv', { token })
  const blob = await r.blob()
  const disp = r.headers.get('Content-Disposition') || ''
  const nombre = /filename="([^"]+)"/.exec(disp)?.[1] || 'lecturas.csv'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** URL del WebSocket. El token NO va aquí (acabaría en los logs): se envía como primer mensaje. */
export function urlWebSocket() {
  const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocolo}//${location.host}/ws`
}
