// Aplica el tema antes del primer pintado (sin destello). Archivo propio, no inline: la CSP lo exige.
// Debe coincidir con src/tema/tema.js (misma clave y mismos valores).
;(function () {
  var pref = 'sistema'
  try {
    pref = localStorage.getItem('iotluz_tema') || 'sistema'
  } catch (e) {
    /* sin almacenamiento: se usa el del sistema */
  }
  var claro =
    pref === 'claro' ||
    (pref !== 'oscuro' && window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches)
  document.documentElement.dataset.tema = claro ? 'claro' : 'oscuro'
})()
