// Escena 3D de la bombilla del login (three.js). Se carga bajo demanda: no entra en el panel.
// Modelo hecho por código: vidrio (torno), filamento en espiral, varillas, cuello, rosca y contacto.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

const AMBAR = 0xffb547
const LUZ_MAX = 14 // intensidad de la luz interior encendida
const FILAMENTO_MAX = 7 // brillo del filamento encendido
const VIDRIO_MAX = 0.55 // tinte cálido del vidrio encendido

const limitar = (v, min, max) => Math.min(max, Math.max(min, v))

/** Perfil del vidrio (radio, altura) suavizado, para girarlo con LatheGeometry. */
function perfilVidrio() {
  const puntos = [
    [0.4, -1.12],
    [0.42, -1.0],
    [0.48, -0.82],
    [0.62, -0.6],
    [0.79, -0.4],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  for (let i = 0; i <= 40; i++) {
    const a = THREE.MathUtils.lerp(-0.6, Math.PI / 2, i / 40)
    puntos.push(new THREE.Vector2(Math.max(0, Math.cos(a)), 0.35 + Math.sin(a)))
  }
  return new THREE.SplineCurve(puntos).getPoints(90)
}

/** Rosca: radio que ondula a lo largo de la altura. */
function perfilRosca() {
  const puntos = []
  const desde = -1.25
  const hasta = -1.78
  const pasos = 140
  for (let i = 0; i <= pasos; i++) {
    const y = THREE.MathUtils.lerp(desde, hasta, i / pasos)
    const r = 0.425 + 0.032 * Math.sin(((y - desde) / 0.118) * Math.PI * 2)
    puntos.push(new THREE.Vector2(r, y))
  }
  return puntos
}

/** Filamento: una espiral enrollada sobre un arco entre las dos varillas. */
function curvaFilamento() {
  const arco = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.3, 0.02, 0),
    new THREE.Vector3(0, 0.42, 0),
    new THREE.Vector3(0.3, 0.02, 0),
  )
  const puntos = []
  const n = 520
  const vueltas = 26
  const radio = 0.03
  const z = new THREE.Vector3(0, 0, 1)
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const p = arco.getPoint(t)
    const tangente = arco.getTangent(t)
    const normal = new THREE.Vector3().crossVectors(tangente, z).normalize()
    const a = t * vueltas * Math.PI * 2
    p.addScaledVector(normal, Math.cos(a) * radio).addScaledVector(z, Math.sin(a) * radio)
    puntos.push(p)
  }
  return new THREE.CatmullRomCurve3(puntos)
}

function tubo(desde, hasta, radio, material) {
  const curva = new THREE.LineCurve3(new THREE.Vector3(...desde), new THREE.Vector3(...hasta))
  return new THREE.Mesh(new THREE.TubeGeometry(curva, 1, radio, 8), material)
}

function modeloBombilla() {
  const grupo = new THREE.Group()

  const vidrio = new THREE.MeshPhysicalMaterial({
    color: 0xbdbcc2, // apagado: vidrio humo; al encender lo tiñe la emisión ámbar
    roughness: 0.1,
    transmission: 1,
    thickness: 0.18,
    ior: 1.45,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    emissive: AMBAR,
    emissiveIntensity: 0,
  })
  grupo.add(new THREE.Mesh(new THREE.LatheGeometry(perfilVidrio(), 96), vidrio))

  // Soporte interior de vidrio y varillas.
  const soporte = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, transmission: 0.85, thickness: 0.1 })
  const tallo = new THREE.LatheGeometry(
    [
      [0.16, -1.12],
      [0.1, -0.9],
      [0.07, -0.45],
      [0.05, -0.36],
      [0, -0.35],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    32,
  )
  grupo.add(new THREE.Mesh(tallo, soporte))
  const varilla = new THREE.MeshStandardMaterial({ color: 0x8c8b92, metalness: 1, roughness: 0.35 })
  grupo.add(tubo([-0.04, -0.4, 0], [-0.3, 0.02, 0], 0.008, varilla))
  grupo.add(tubo([0.04, -0.4, 0], [0.3, 0.02, 0], 0.008, varilla))

  const filamento = new THREE.MeshStandardMaterial({
    color: 0x3a2a1a,
    roughness: 0.6,
    emissive: 0xffa53a,
    emissiveIntensity: 0,
  })
  grupo.add(new THREE.Mesh(new THREE.TubeGeometry(curvaFilamento(), 700, 0.0065, 6), filamento))

  // Casquillo: cuello de grafito, rosca metálica, aislante negro y contacto de latón.
  const grafito = new THREE.MeshStandardMaterial({ color: 0x2b2b2f, metalness: 0.6, roughness: 0.35 })
  const cuello = new THREE.LatheGeometry(
    [
      [0.4, -1.1],
      [0.455, -1.13],
      [0.46, -1.25],
      [0.43, -1.26],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    64,
  )
  grupo.add(new THREE.Mesh(cuello, grafito))
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9c8cd, metalness: 1, roughness: 0.28 })
  grupo.add(new THREE.Mesh(new THREE.LatheGeometry(perfilRosca(), 64), metal))
  const aislante = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.25 })
  const piezaAislante = new THREE.LatheGeometry(
    [
      [0.4, -1.78],
      [0.3, -1.8],
      [0.26, -1.88],
      [0.15, -1.89],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    48,
  )
  grupo.add(new THREE.Mesh(piezaAislante, aislante))
  const laton = new THREE.MeshStandardMaterial({ color: 0xc8a060, metalness: 1, roughness: 0.3 })
  const contacto = new THREE.LatheGeometry(
    [
      [0.15, -1.885],
      [0.13, -1.93],
      [0.06, -1.96],
      [0, -1.965],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    32,
  )
  grupo.add(new THREE.Mesh(contacto, laton))

  return { grupo, vidrio, filamento }
}

/**
 * Crea la escena dentro de `contenedor`. `leerApunte()` devuelve {x, y} en [-1, 1] (hacia dónde
 * mirar); se lee en cada cuadro. Devuelve controles para encender la luz y destruir todo.
 * Con `reducido` (prefers-reduced-motion): sin giro, sin inclinación y sin parpadeo; la luz
 * solo hace un fundido corto. Lanza un error si no hay WebGL.
 */
export function crearEscena(contenedor, { reducido = false, leerApunte = () => ({ x: 0, y: 0 }) } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.setClearColor(0x000000, 0)
  renderer.domElement.setAttribute('aria-hidden', 'true')
  contenedor.appendChild(renderer.domElement)

  const escena = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const entorno = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  escena.environment = entorno
  escena.environmentIntensity = 0.28

  const camara = new THREE.PerspectiveCamera(26, 1, 0.1, 50)

  // Luz del sistema: arriba a la izquierda; contraluz neutro detrás a la derecha.
  escena.add(new THREE.HemisphereLight(0xd9d8de, 0x0e0e10, 0.45))
  const clave = new THREE.DirectionalLight(0xffffff, 1.4)
  clave.position.set(-4, 5, 5)
  escena.add(clave)
  const contraluz = new THREE.DirectionalLight(0xc9c8d0, 1.4)
  contraluz.position.set(4, -1, -4)
  escena.add(contraluz)

  const { grupo, vidrio, filamento } = modeloBombilla()
  const pivote = new THREE.Group()
  pivote.position.y = 0.3
  pivote.add(grupo)
  escena.add(pivote)

  const luz = new THREE.PointLight(AMBAR, 0, 8, 2)
  luz.position.set(0, 0.25, 0)
  grupo.add(luz)

  // Encuadre: la bombilla (unas 3,4 unidades de alto) cabe siempre, también en vertical.
  const ajustar = () => {
    const ancho = contenedor.clientWidth || 1
    const alto = contenedor.clientHeight || 1
    renderer.setSize(ancho, alto, false)
    camara.aspect = ancho / alto
    const tan = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2))
    const distancia = Math.max(2.15 / tan, 1.35 / (tan * camara.aspect))
    camara.position.set(0, 0, distancia)
    camara.lookAt(0, 0, 0)
    camara.updateProjectionMatrix()
    sucio = true
  }
  let sucio = true
  ajustar()
  const observador = new ResizeObserver(ajustar)
  observador.observe(contenedor)

  // Estado animado.
  let objetivo = 0
  let nivel = 0
  let encendidoEn = 0
  let reloj = performance.now()
  let cuadro = 0
  let visible = true

  const pintar = (ahora) => {
    const dt = Math.min(0.05, (ahora - reloj) / 1000)
    reloj = ahora

    // Movimiento reducido: sin nada que cambie, no se vuelve a pintar (ahorra GPU).
    if (reducido && !sucio && Math.abs(objetivo - nivel) < 0.001) return
    sucio = false

    // Se parte siempre del nivel actual: encender a medio apagado no da saltos.
    // Reducido: fundido corto y simétrico (~300 ms), sin cambios bruscos de brillo.
    const velocidad = reducido ? 10 : objetivo > nivel ? 7 : 2.4
    nivel += (objetivo - nivel) * Math.min(1, dt * velocidad)
    if (Math.abs(objetivo - nivel) < 0.001) nivel = objetivo

    // Parpadeo de arranque: el filamento "duda" un instante al encender.
    let parpadeo = 1
    const desdeEncendido = ahora - encendidoEn
    if (!reducido && objetivo === 1 && desdeEncendido < 380) {
      parpadeo = desdeEncendido < 90 ? 0.55 : desdeEncendido < 170 ? 0.2 : desdeEncendido < 260 ? 0.85 : 0.6
    }
    const n = nivel * parpadeo
    luz.intensity = n * LUZ_MAX
    filamento.emissiveIntensity = n * FILAMENTO_MAX
    vidrio.emissiveIntensity = n * VIDRIO_MAX
    renderer.toneMappingExposure = 1 + n * 0.15

    // Inclinación suave hacia el puntero (vuelve al centro si el puntero se va) y giro lento.
    if (!reducido) {
      const apunte = leerApunte()
      const k = Math.min(1, dt * 3)
      pivote.rotation.x += (limitar(apunte.y, -1, 1) * 0.16 - pivote.rotation.x) * k
      pivote.rotation.z += (-limitar(apunte.x, -1, 1) * 0.16 - pivote.rotation.z) * k
      grupo.rotation.y += dt * 0.3
    }

    renderer.render(escena, camara)
  }

  const bucle = (ahora) => {
    pintar(ahora)
    cuadro = visible ? requestAnimationFrame(bucle) : 0
  }
  cuadro = requestAnimationFrame(bucle)

  // Sin animar cuando la escena no se ve (ahorra batería en el móvil).
  const vigia = new IntersectionObserver(([entrada]) => {
    visible = entrada.isIntersecting
    if (visible && !cuadro) {
      reloj = performance.now()
      cuadro = requestAnimationFrame(bucle)
    }
  })
  vigia.observe(contenedor)

  return {
    setEncendida(valor) {
      const nuevo = valor ? 1 : 0
      if (nuevo === 1 && objetivo === 0) encendidoEn = performance.now()
      objetivo = nuevo
    },
    destruir() {
      cancelAnimationFrame(cuadro)
      observador.disconnect()
      vigia.disconnect()
      escena.traverse((o) => {
        o.geometry?.dispose()
        o.material?.dispose()
      })
      entorno.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
