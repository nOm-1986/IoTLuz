// Tacto de los mandos de la consola: una vibración corta donde se puede (navigator.vibrate, en
// Android) y, siempre, un clic mecánico muy suave sintetizado con Web Audio. En escritorio no hay
// vibración desde el navegador (ni siquiera con el trackpad Force Touch), así que el sonido hace
// de háptico: suena en el mismo fotograma en que la pieza pasa por una marca.
//
// Dos clases de golpe: "marca" (cada 10 % de la perilla, cada segundo del deslizador) y "tope"
// (al llegar a un extremo), más grave y algo más largo, como el fin de recorrido de un mando real.

let audio = null
let ultimo = 0

/** El contexto de audio solo se crea tras un gesto del usuario (los navegadores lo exigen). */
function contexto() {
  if (!audio) {
    const Ctx = window.AudioContext || window['webkitAudioContext'] // Safari antiguo
    if (!Ctx) return null
    audio = new Ctx()
  }
  if (audio.state === 'suspended') audio.resume()
  return audio
}

/** Clic: un soplo de ruido muy corto, filtrado, con caída exponencial. */
function clic(frecuencia, duracion, volumen) {
  const ctx = contexto()
  if (!ctx) return
  const muestras = Math.ceil(ctx.sampleRate * duracion)
  const buffer = ctx.createBuffer(1, muestras, ctx.sampleRate)
  const datos = buffer.getChannelData(0)
  for (let i = 0; i < muestras; i++) {
    datos[i] = (Math.random() * 2 - 1) * Math.exp(-i / (muestras * 0.18))
  }
  const fuente = ctx.createBufferSource()
  fuente.buffer = buffer
  const filtro = ctx.createBiquadFilter()
  filtro.type = 'bandpass'
  filtro.frequency.value = frecuencia
  filtro.Q.value = 1.4
  const ganancia = ctx.createGain()
  ganancia.gain.value = volumen
  fuente.connect(filtro).connect(ganancia).connect(ctx.destination)
  fuente.start()
}

/** Golpe de tacto. `tipo`: 'marca' | 'tope'. Limita a uno cada 28 ms (giros muy rápidos). */
export function tocar(tipo = 'marca') {
  const ahora = performance.now()
  if (ahora - ultimo < 28) return
  ultimo = ahora
  const tope = tipo === 'tope'
  navigator.vibrate?.(tope ? 16 : 6)
  clic(tope ? 1400 : 3200, tope ? 0.012 : 0.006, tope ? 0.09 : 0.05)
}

/** Llamar en el primer gesto (pointerdown/keydown) para que el primer clic suene a tiempo. */
export function prepararTacto() {
  contexto()
}
