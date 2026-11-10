// Lámpara del panel: los tres aros de sala.glb con la misma luz que en el login, sin la sala.
//
// - Cada aro tiene su foco con sombra suave (VSM) y un halo. Un suelo invisible recoge solo las
//   sombras reales de aros y cables; el charco de luz se suma encima. Sin caja ni habitación.
// - Los haces volumétricos y los charcos son la geometría horneada en Blender (Haz_*, HazAncho_*,
//   Charco_*) con los mismos shaders que el login (login/luz.js).
// - El lienzo es transparente: lo que no es lámpara, luz o suelo deja ver la página.
// - Solo se pinta cuando algo cambia.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { LUZ_LED, materialCharco, materialHaz } from '../login/luz.js'

const AROS = { Grande: 0.62, Media: 0.46, Peque: 0.31 } // radio en metros

// Con la lámpara encendida al 100 %. Los mismos órdenes de magnitud que en el login.
const EMISION = 4.2
const FOCO = 42 // aro grande; los demás, en proporción a su área
const HALO = 0.6
const CHARCO = { oscuro: 0.09, claro: 0.018 }
const CONO = { oscuro: 0.1, claro: 0.012 } // en una sala clara el haz apenas se ve, como en la realidad

// Luz nocturna: fría, entra por la esquina superior derecha de la página y está siempre (también
// con la lámpara apagada). El haz y el polvo los pinta la página (luna.js); aquí, el foco real
// que proyecta las sombras de aros y cables, y que se apaga un poco cuando pasan nubes.
const LUNA_COLOR = new THREE.Color(0.68, 0.8, 1.0)
const LUNA = { oscuro: 70, claro: 26 }

const SOMBRA = { claro: 0.22, oscuro: 0.5 }
const AMBIENTE = { claro: 1.1, oscuro: 0.18 }

/**
 * @param {HTMLElement} contenedor
 * @param {{ margen?: number, paralaje?: boolean, tema?: 'claro' | 'oscuro' }} opciones
 */
export function crearLampara(contenedor, { margen = 1.02, paralaje = false, tema = 'claro' } = {}) {
  const render = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  render.setPixelRatio(Math.min(devicePixelRatio, 2))
  render.toneMapping = THREE.AgXToneMapping
  render.setClearColor(0x000000, 0)
  render.shadowMap.enabled = true
  render.shadowMap.type = THREE.VSMShadowMap
  contenedor.appendChild(render.domElement)

  const escena = new THREE.Scene()
  const camara = new THREE.PerspectiveCamera(30, 1, 0.05, 60)
  const ambiente = new THREE.HemisphereLight(0xffffff, 0x2a2a2e, AMBIENTE[tema])
  escena.add(ambiente)
  // Luz de estudio suave desde delante: deja leer las carcasas negras de los aros apagados.
  const clave = new THREE.DirectionalLight(0xffffff, 0.5)
  clave.position.set(2, 5, 6)
  escena.add(clave)

  // Suelo invisible: solo pinta las sombras reales de aros y cables (ShadowMaterial). La luz en
  // el suelo la pone el charco horneado, que se suma a la página sin taparla.
  const suelo = new THREE.Mesh(new THREE.CircleGeometry(2.4, 64), new THREE.ShadowMaterial({ opacity: SOMBRA[tema] }))
  suelo.rotation.x = -Math.PI / 2
  suelo.receiveShadow = true
  escena.add(suelo)

  const luna = new THREE.SpotLight(LUNA_COLOR, 0, 0, 0.32, 1, 1.4)
  luna.castShadow = true
  luna.shadow.mapSize.set(1024, 1024)
  luna.shadow.radius = 10
  luna.shadow.blurSamples = 16
  luna.shadow.bias = -0.0005
  escena.add(luna, luna.target)

  const composer = new EffectComposer(render)
  // Sin esto el composer pinta sin MSAA y los cables salen dentados.
  composer.renderTarget1.samples = 4
  composer.renderTarget2.samples = 4
  composer.addPass(new RenderPass(escena, camara))
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.3, 2.5)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  let difusor = null
  const lamparas = [] // { foco, halo, factor }
  const haces = [] // { mat, fuerza }
  const charcos = []
  let nivel = 0
  let objetivo = 0
  let caja = null
  let destruida = false
  const giro = { x: 0, y: 0 }
  const giroObjetivo = { x: 0, y: 0 }

  new GLTFLoader().load('/modelos/sala.glb', (gltf) => {
    if (destruida) return
    const fuente = gltf.scene
    fuente.updateMatrixWorld(true)
    const grupo = new THREE.Group()
    const coger = (nombre) => {
      const o = fuente.getObjectByName(nombre)
      if (!o) return null
      const copia = o.clone(true)
      copia.matrix.copy(o.matrixWorld)
      copia.matrix.decompose(copia.position, copia.quaternion, copia.scale)
      grupo.add(copia)
      return copia
    }
    for (const a of Object.keys(AROS)) {
      coger(`Ola_${a}`)
      for (let i = 0; i < 3; i++) coger(`CableOla_${a}_${i}`)
      coger(`Haz_${a}`)
      coger(`HazAncho_${a}`)
      coger(`Charco_${a}`)
    }
    grupo.traverse((o) => {
      if (!o.isMesh) return
      const m = o.material
      o.castShadow = true
      o.receiveShadow = true
      if (m.name === 'M_DifusorOla') {
        difusor = m
        m.emissive = LUZ_LED.clone()
        m.emissiveIntensity = 0
        o.castShadow = false
      } else if (m.name === 'M_Haz' || m.name === 'M_HazAncho') {
        o.material = materialHaz()
        o.castShadow = o.receiveShadow = false
        o.renderOrder = 2
        haces.push({ mat: o.material, fuerza: m.name === 'M_Haz' ? 1 : 0.3 })
      } else if (m.name === 'M_Charco') {
        o.material = materialCharco()
        o.castShadow = o.receiveShadow = false
        o.renderOrder = 1
        charcos.push(o.material)
      }
    })
    escena.add(grupo)

    // Foco con sombra justo debajo de cada aro (su propia carcasa no le tapa) + halo.
    caja = new THREE.Box3()
    for (const [a, R] of Object.entries(AROS)) {
      const aro = grupo.getObjectByName(`Ola_${a}`)
      if (!aro) continue
      caja.expandByObject(aro)
      const p = aro.getWorldPosition(new THREE.Vector3())
      const foco = new THREE.SpotLight(LUZ_LED, 0, 0, 0.42, 0.7, 2)
      foco.position.set(p.x, p.y - 0.07, p.z)
      foco.target.position.set(p.x, 0, p.z)
      foco.castShadow = true
      foco.shadow.mapSize.set(1024, 1024)
      foco.shadow.radius = 8
      foco.shadow.blurSamples = 16
      foco.shadow.bias = -0.0004
      foco.shadow.camera.near = 0.2
      foco.shadow.camera.far = 6
      const halo = new THREE.PointLight(LUZ_LED, 0, 0, 2)
      halo.position.copy(p)
      escena.add(foco, foco.target, halo)
      lamparas.push({ foco, halo, factor: (R / 0.62) ** 2 })
    }
    // El encuadre baja hasta el suelo: la luz que cae forma parte de la lámpara.
    const centro = caja.getCenter(new THREE.Vector3())
    suelo.position.set(centro.x, 0, centro.z)
    caja.expandByPoint(new THREE.Vector3(centro.x, 0, centro.z))
    encuadrar()
    colocarLuna()
    despertar()
  })

  function encuadrar() {
    if (!caja) return
    const { clientWidth: w, clientHeight: h } = contenedor
    if (!w || !h) return
    render.setSize(w, h, false)
    composer.setSize(w, h)
    camara.aspect = w / h
    colocar()
  }

  function colocar() {
    const centro = caja.getCenter(new THREE.Vector3())
    const radio = caja.getSize(new THREE.Vector3()).length() / 2
    const ajuste = Math.min(1, camara.aspect)
    const distancia = (radio * margen) / Math.sin(THREE.MathUtils.degToRad(camara.fov / 2)) / ajuste
    // Un poco por encima del centro: se ve el charco en el suelo como una elipse, no una raya.
    const base = new THREE.Vector3(0, distancia * 0.16, distancia)
    base.applyAxisAngle(new THREE.Vector3(0, 1, 0), giro.x * 0.22)
    base.applyAxisAngle(new THREE.Vector3(1, 0, 0), giro.y * 0.06)
    camara.position.copy(centro).add(base)
    camara.lookAt(centro)
    camara.updateProjectionMatrix()
  }

  // Desde arriba a la derecha de la pantalla y un poco por delante: la sombra cae abajo a la izquierda.
  let nube = 1
  function colocarLuna() {
    const centro = caja.getCenter(new THREE.Vector3())
    const derecha = new THREE.Vector3().setFromMatrixColumn(camara.matrixWorld, 0)
    const delante = new THREE.Vector3().setFromMatrixColumn(camara.matrixWorld, 2)
    const fuente = centro.clone().addScaledVector(derecha, 4.5).add(new THREE.Vector3(0, 5.5, 0)).addScaledVector(delante, 1.2)
    luna.position.copy(fuente)
    luna.target.position.set(centro.x - 0.4, 0, centro.z)
    luna.angle = 0.5
    luna.shadow.camera.near = 1
    luna.shadow.camera.far = fuente.length() + 10
    aplicarLuna()
  }
  function aplicarLuna() {
    luna.intensity = LUNA[temaActual] * (0.45 + 0.55 * nube)
  }

  let temaActual = tema === 'oscuro' ? 'oscuro' : 'claro'
  let cono = CONO[tema]
  let charco = CHARCO[tema]
  function aplicarNivel() {
    const n = nivel
    if (difusor) difusor.emissiveIntensity = n * EMISION
    for (const { foco, halo, factor } of lamparas) {
      foco.intensity = n * FOCO * factor
      halo.intensity = n * HALO * factor
    }
    for (const h of haces) h.mat.uniforms.uFuerza.value = n * cono * h.fuerza
    for (const c of charcos) c.uniforms.uFuerza.value = n * charco
  }

  let cuadro = 0
  let reloj = 0
  function pintar(ahora = performance.now()) {
    const dt = Math.min(0.05, (ahora - reloj) / 1000 || 0.016)
    reloj = ahora
    nivel += (objetivo - nivel) * Math.min(1, dt * (objetivo > nivel ? 6 : 2.4))
    if (Math.abs(objetivo - nivel) < 0.002) nivel = objetivo
    aplicarNivel()
    giro.x += (giroObjetivo.x - giro.x) * Math.min(1, dt * 3)
    giro.y += (giroObjetivo.y - giro.y) * Math.min(1, dt * 3)
    const quieta = Math.abs(giroObjetivo.x - giro.x) + Math.abs(giroObjetivo.y - giro.y) < 0.001
    if (caja) colocar()
    composer.render()
    cuadro = nivel !== objetivo || !quieta ? requestAnimationFrame(pintar) : 0
  }
  const despertar = () => {
    if (!cuadro && !destruida) cuadro = requestAnimationFrame(pintar)
  }
  const mover = (e) => {
    giroObjetivo.x = (e.clientX / innerWidth) * 2 - 1
    giroObjetivo.y = (e.clientY / innerHeight) * 2 - 1
    despertar()
  }
  if (paralaje && !matchMedia('(prefers-reduced-motion: reduce)').matches) addEventListener('pointermove', mover)
  const observador = new ResizeObserver(() => {
    encuadrar()
    despertar()
  })
  observador.observe(contenedor)

  return {
    destruir() {
      destruida = true
      cancelAnimationFrame(cuadro)
      removeEventListener('pointermove', mover)
      observador.disconnect()
      composer.dispose?.()
      render.dispose()
      render.domElement.remove()
    },
    /** 0 = apagada, 1 = encendida (el paso entre los dos va con la misma curva que la sala). */
    setNivel(v) {
      objetivo = v
      despertar()
    },
    /** Suelo y ambiente siguen al fondo de la página; el bloom, más contenido en claro. */
    /** Cuánto dejan pasar las nubes (0..1); solo se repinta si cambia lo bastante. */
    setNube(g) {
      if (Math.abs(g - nube) < 0.015) return
      nube = g
      aplicarLuna()
      despertar()
    },
    setTema(t) {
      const clave = t === 'oscuro' ? 'oscuro' : 'claro'
      suelo.material.opacity = SOMBRA[clave]
      charco = CHARCO[clave]
      ambiente.intensity = AMBIENTE[clave]
      bloom.strength = clave === 'oscuro' ? 0.22 : 0.05
      cono = CONO[clave]
      temaActual = clave
      aplicarLuna()
      aplicarNivel()
      despertar()
    },
  }
}
