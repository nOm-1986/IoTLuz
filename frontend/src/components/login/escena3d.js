// Sala del login (three.js, cargado bajo demanda: no entra en el panel).
//
// Todo lo que tiene forma viene de Blender (public/modelos/sala.glb), tal cual se aprobó allí:
// sala de paneles con tiras LED, tres aros orgánicos, busto, taburete, escultura apilada, los haces
// y los charcos de luz (horneados desde el contorno real de cada aro) y la consola de cabina al
// estilo Teenage Engineering (rueda, fader y ventana OLED). Aquí solo se monta lo que cambia o lo
// que glTF no lleva: la luz, los shaders de haces/charcos/LED, las texturas de pared y suelo, la
// pantalla OLED (en HTML, sobre su ventana) y el estado de la rueda y el fader.
//
// Cómo se consigue que parezca una foto:
// - Antialiasing: el composer pinta en un buffer con MSAA (4 muestras) y de medio flotante (HDR).
// - Los difusores de los aros emiten en HDR; UnrealBloomPass con umbral ~1 hace florecer solo lo
//   que emite. Tono AgX y sRGB al final (OutputPass).
// - Cada aro tiene su foco con sombra suave (VSM) y un halo; los haces y los charcos leen la altura
//   o el radio horneados en el color de vértice. Los haces se pintan después del AO (en su propia
//   escena) y la consola los tapa (se pinta antes en profundidad).
// - Ambient occlusion (GTAO) para contactos, rincones y juntas.
// - La cabina tiene su propia luz, neutra y fría, distinta de la cálida de la sala, y un entorno
//   de estudio solo en sus metales.
// - Solo se pinta cuando algo cambia; en reposo, nada.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { crearFisica } from './fisica.js'
import { materialCharco, materialHaz } from './luz.js'
import { OLED, crearOled } from './oled.js'

const COLOR_SALA = 0x0d0d0f // = fondo CSS de la sala mientras carga
const LUZ_LED = new THREE.Color(1, 0.86, 0.68) // blanco cálido, ~3000 K
const LUZ_CABINA = new THREE.Color(0.9, 0.95, 1.0) // neutra y fría, de estudio

// Aros (nombre del nodo en el GLB → radio en metros).
const AROS = { Ola_Grande: 0.62, Ola_Media: 0.46, Ola_Peque: 0.31 }

// Brillo de la lámpara con la rueda al 100 % (regula de ~8 % a este máximo), por aro.
const EMISION = 4.2 // por encima del umbral del bloom: solo los difusores florecen
const FOCO = 42 // para el aro grande; los demás, en proporción a su área
const HALO = 0.6
const CHARCO = 0.02 // el círculo de luz en el suelo: se intuye, no tapa las sombras
const CONO = 0.1 // los haces: atmósfera, por debajo de lo que iluminan
const BLOOM = 0.28
const LED_ALTO = 5.2
const LED_BARRIDO_S = 2.4 // toda la secuencia: las tiras se encienden en fila, del centro a los lados

// Cámara: la misma que CAM_Login en Blender (960 × 1080, 30° en vertical).
const CAMARA_POS = new THREE.Vector3(0, 1.744, 8.6)
const CAMARA_OBJETIVO = new THREE.Vector3(0, 1.4, 0)
const ASPECTO_BLENDER = 960 / 1080
const FOV_BLENDER = 30

// Consola (coordenadas de Blender, locales a su placa): rueda y fader.
// Entrada de la esfera: cuadros fluidos seguidos que pide, pausa de cortesía, tope de espera y
// cuánto tarda el sensor en reaccionar tras el lanzamiento.
const ESTABLE_CUADROS = 45
const ESTABLE_PAUSA_MS = 600
const ESTABLE_MAX_MS = 8000
const ENTRADA_SENSOR_MS = 900
const RUEDA_RADIO = 0.062
const FADER = { x: 0.3, y0: -0.075, y1: 0.075, min: 1, max: 20 } // recorrido de 15 cm; y de Blender = -z en el GLB

/** Tiras LED de las juntas: se encienden en fila (del centro a los lados) y de arriba abajo. */
function materialLed() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: LUZ_LED.clone() },
      uFuerza: { value: 0 },
      uBarrido: { value: 0 },
      uAlto: { value: LED_ALTO },
    },
    vertexShader: /* glsl */ `
      varying float vY;
      varying float vX;
      void main() {
        vec4 mundo = modelMatrix * vec4(position, 1.0);
        vY = mundo.y;
        vX = mundo.x;
        gl_Position = projectionMatrix * viewMatrix * mundo;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uFuerza;
      uniform float uBarrido;
      uniform float uAlto;
      varying float vY;
      varying float vX;
      void main() {
        const float RETRASO = 0.9;
        float turno = clamp(abs(vX) / 4.2, 0.0, 1.0) * RETRASO;
        float propio = clamp(uBarrido * (1.0 + RETRASO) - turno, 0.0, 1.0);
        float frente = uAlto * (1.0 - propio);
        float encendida = smoothstep(frente - 0.25, frente + 0.25, vY);
        gl_FragColor = vec4(uColor * uFuerza * encendida, 1.0);
      }
    `,
  })
}

/**
 * Muelle críticamente amortiguado (sin rebote), resuelto de forma exacta: estable con cualquier
 * paso de tiempo. `respuesta` es el tiempo característico en segundos (más corto = más vivo).
 * Parte siempre del valor y la velocidad actuales, así que se puede redirigir en cualquier momento.
 */
function muelle(m, dt) {
  const w = (2 * Math.PI) / m.respuesta
  const x0 = m.valor - m.objetivo
  const e = Math.exp(-w * dt)
  const v = (m.vel - w * (m.vel + w * x0) * dt) * e
  m.valor = m.objetivo + (x0 + (m.vel + w * x0) * dt) * e
  m.vel = v
  const quieto = Math.abs(m.valor - m.objetivo) < 1e-4 && Math.abs(m.vel) < 1e-3
  if (quieto) {
    m.valor = m.objetivo
    m.vel = 0
  }
  return !quieto
}
const nuevoMuelle = (valor, respuesta) => ({ valor, objetivo: valor, vel: 0, respuesta })

/** UV planas a partir de la posición en el mundo (los paneles y el suelo vienen sin UV). */
function uvDelMundo(malla, ejes, escala) {
  malla.updateWorldMatrix(true, false)
  const pos = malla.geometry.attributes.position
  const v = new THREE.Vector3()
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(malla.matrixWorld)
    uv[i * 2] = v[ejes[0]] / escala
    uv[i * 2 + 1] = v[ejes[1]] / escala
  }
  malla.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

/**
 * Crea la sala dentro de `contenedor` (toda la mitad izquierda). Devuelve controles para encender
 * la luz, regularla, mover los mandos, actualizar la pantalla, recolocar y destruir.
 * Lanza un error si no hay WebGL.
 */
export function crearEscena(contenedor, { reducido = false, alCargar = () => {}, dom = contenedor, alMover = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  const ppp = Math.min(window.devicePixelRatio || 1, 2)
  renderer.setPixelRatio(ppp)
  renderer.toneMapping = THREE.AgXToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.VSMShadowMap
  renderer.domElement.setAttribute('aria-hidden', 'true')
  contenedor.appendChild(renderer.domElement)
  const maxAniso = renderer.capabilities.getMaxAnisotropy()

  // Capa HTML con la misma cámara: la pantalla OLED, colocada sobre su ventana de cristal.
  const css = new CSS3DRenderer()
  Object.assign(css.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
  contenedor.appendChild(css.domElement)
  const escenaCss = new THREE.Scene()
  const oled = crearOled()

  const escena = new THREE.Scene()
  escena.background = new THREE.Color(COLOR_SALA)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const estudio = pmrem.fromScene(new RoomEnvironment(), 0.04).texture // solo para los metales de la consola

  // ---- Luz de la sala con la lámpara apagada: penumbra --------------------------------
  escena.add(new THREE.HemisphereLight(0xeef0f4, 0x0e0f10, 0.22))
  const principal = new THREE.DirectionalLight(0xf3f3f6, 0.5) // direccional: sombras laterales
  principal.position.set(3.2, 5.5, 3)
  principal.target.position.set(0, 0, -1)
  principal.castShadow = true
  principal.shadow.mapSize.set(2048, 2048)
  principal.shadow.radius = 6
  principal.shadow.blurSamples = 16
  principal.shadow.bias = -0.0004
  Object.assign(principal.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 16 })
  escena.add(principal, principal.target)
  // Relleno frontal: detrás de la cámara, alto y con el haz cerrado, para que pase por encima de la
  // consola y solo ilumine la pared (la luz de la consola la deciden la cabina y la lámpara).
  const relleno = new THREE.SpotLight(0xf1f2f5, 10, 0, 0.28, 1, 2)
  relleno.position.set(0, 4, 10.5)
  relleno.target.position.set(0, 0.7, -3)
  escena.add(relleno, relleno.target)

  // Cabina: luz neutra y fría de estudio, con un haz estrecho que solo alcanza la consola.
  const cabina = new THREE.SpotLight(LUZ_CABINA, 0.7, 0, 0.45, 1, 2) // ancha y sin borde: sin punto caliente
  const CABINA = 0.7
  const metalesConsola = [] // { m, base }: sus reflejos siguen a la luz de la sala
  const coloresConsola = [] // { m, base }: su tono también
  cabina.position.set(0, 2.2, 7.9)
  cabina.target.position.set(0, 1.06, 6.0)
  escena.add(cabina, cabina.target)

  // ---- Piezas que dependen del estado -----------------------------------------------------
  const ledMat = materialLed()
  const escenaConos = new THREE.Scene()
  const lamparas = [] // { foco, halo, factor }
  const haces = [] // { malla, fuerza } (relativa a CONO)
  const charcos = []
  let difusor = null
  let ruedaGiro = null
  let rueda = null
  let tirador = null
  let consola = null
  let pantallaCss = null
  const anclas = { rueda: null, ruedaBorde: null, fader0: null, fader1: null }

  // ---- Texturas de pared y suelo (Poly Haven, CC0; a 1k, en gris para teñirlas a grafito) ----
  const cargadorTex = new THREE.TextureLoader()
  let texturasPendientes = 0
  const tex = (ruta, color) => {
    texturasPendientes++
    const listo = () => {
      texturasPendientes--
      despertar()
    }
    const t = cargadorTex.load(ruta, listo, undefined, listo)
    if (color) t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = maxAniso
    return t
  }
  const panelMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.11, 0.112, 0.12),
    map: tex('/texturas/concrete_wall_008/concrete_wall_008_diff_1k.jpg', true),
    roughnessMap: tex('/texturas/concrete_wall_008/concrete_wall_008_rough_1k.jpg'),
    normalMap: tex('/texturas/concrete_wall_008/concrete_wall_008_nor_gl_1k.jpg'),
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.85,
    dithering: true,
  })
  const sueloMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.15, 0.152, 0.16),
    map: tex('/texturas/concrete_floor_02/concrete_floor_02_diff_1k.jpg', true),
    roughnessMap: tex('/texturas/concrete_floor_02/concrete_floor_02_rough_1k.jpg'),
    normalMap: tex('/texturas/concrete_floor_02/concrete_floor_02_nor_gl_1k.jpg'),
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.55,
    dithering: true,
  })
  // Reflejo de estudio en los metales de la consola: lo justo para que el aluminio se lea como metal
  // (con más, el aluminio claro se quema y el bloom lo levanta como un velo sobre la sala).
  const METALES_CONSOLA = { M_AluNatural: 0.22, M_AluNaturalRueda: 0.32, M_AluFader: 0.32, M_Torx: 0.3 }

  let destruida = false
  // Espera a que la sala esté de verdad lista: texturas cargadas y ESTABLE_CUADROS cuadros seguidos
  // sin tirones (compilar sombreadores y subir texturas a la GPU los provoca al principio).
  // Si el equipo nunca va fluido, se lanza igual pasado ESTABLE_MAX_MS.
  const cuandoEstable = (hecho) => {
    const inicio = performance.now()
    let previo = inicio
    const recientes = []
    let seguidos = 0
    const medir = (ahora) => {
      if (destruida) return
      const intervalo = ahora - previo
      previo = ahora
      // Referencia: la mediana de los últimos cuadros (la tasa de la pantalla, sea 60, 120 o 144 Hz).
      recientes.push(intervalo)
      if (recientes.length > 30) recientes.shift()
      const mediana = [...recientes].sort((x, y) => x - y)[recientes.length >> 1]
      const fluido = recientes.length >= 10 && intervalo < mediana * 1.35 + 2
      seguidos = texturasPendientes === 0 && fluido ? seguidos + 1 : 0
      if (seguidos >= ESTABLE_CUADROS || ahora - inicio > ESTABLE_MAX_MS) setTimeout(hecho, ESTABLE_PAUSA_MS)
      else requestAnimationFrame(medir)
    }
    requestAnimationFrame(medir)
  }
  new GLTFLoader().load('/modelos/sala.glb', (gltf) => {
    if (destruida) return // la carga terminó después de desmontar (StrictMode monta dos veces)
    const sala = gltf.scene
    escena.add(sala)
    sala.updateMatrixWorld(true)

    const mover = [] // haces: a su propia escena (se pintan tras el AO)
    sala.traverse((o) => {
      if (!o.isMesh) return
      const m = o.material
      o.castShadow = true
      o.receiveShadow = true
      if (m.name === 'WEB_Panel') {
        uvDelMundo(o, ['x', 'y'], 2.4)
        o.material = panelMat
      } else if (m.name === 'WEB_Suelo') {
        uvDelMundo(o, ['x', 'z'], 3)
        o.material = sueloMat
        o.castShadow = false
      } else if (m.name === 'M_LedPared') {
        o.material = ledMat
        o.castShadow = false
      } else if (m.name === 'M_DifusorOla') {
        difusor = m
        m.emissive = LUZ_LED.clone()
        m.emissiveIntensity = 0
        o.castShadow = false
      } else if (m.name === 'M_Haz' || m.name === 'M_HazAncho') {
        o.material = materialHaz()
        o.castShadow = o.receiveShadow = false
        haces.push({ malla: o, fuerza: m.name === 'M_Haz' ? 1 : 0.3 })
        mover.push(o)
      } else if (m.name === 'M_Charco') {
        o.material = materialCharco()
        o.castShadow = o.receiveShadow = false
        charcos.push(o)
      } else if (m.name in METALES_CONSOLA) {
        m.envMap = estudio
        m.envMapIntensity = METALES_CONSOLA[m.name]
        if (!metalesConsola.some((x) => x.m === m)) metalesConsola.push({ m, base: METALES_CONSOLA[m.name] })
        // Los surcos de la rueda son más finos que un píxel: con brillo agudo hacen moiré.
        if (m.name === 'M_AluNaturalRueda') m.roughness = 0.55
      } else if (m.name === 'M_CristalOscuro') {
        // Cristal de la OLED: negro mate, que no refleje la cabina (la pantalla pone la luz).
        o.material = new THREE.MeshStandardMaterial({ color: 0x030304, roughness: 0.6, metalness: 0 })
      } else if (m.name === 'WEB_Pantalla_Oled') {
        o.visible = false // en su lugar va la pantalla HTML
        pantallaCss = o
      }
      if (o.name.startsWith('CableOla')) o.castShadow = false
    })
    for (const o of mover) escenaConos.attach(o)

    ruedaGiro = sala.getObjectByName('Rueda_Giro')
    rueda = sala.getObjectByName('Rueda')
    tirador = sala.getObjectByName('Fader_Tirador')
    consola = sala.getObjectByName('Consola')
    sala.updateMatrixWorld(true)
    // Canto inferior de la placa (y de Blender = -10,5 cm): la cámara deja margen por debajo.
    bordeConsola = consola.localToWorld(new THREE.Vector3(0, 0, 0.105))

    // Materiales de la consola (salvo el cristal de la OLED): su tono sigue a la luz de la sala.
    // three.js no puede excluir una luz de un objeto (Blender sí: light linking), así que en vez
    // de quitarle la luz principal a la consola se regula cuánta devuelve.
    consola.traverse((o) => {
      if (!o.isMesh || !o.material?.color || o.name.startsWith('Oled')) return
      if (!coloresConsola.some((x) => x.m === o.material)) coloresConsola.push({ m: o.material, base: o.material.color.clone() })
    })

    // La consola tapa los haces: se pinta antes que ellos en su escena, solo en profundidad.
    const soloProfundidad = new THREE.MeshBasicMaterial({ colorWrite: false })
    consola.traverse((o) => {
      if (!o.isMesh) return
      const tapa = new THREE.Mesh(o.geometry, soloProfundidad)
      tapa.matrixAutoUpdate = false
      tapa.matrix.copy(o.matrixWorld)
      tapa.renderOrder = -1
      escenaConos.add(tapa)
    })

    // Lámparas: foco con sombra (charco con el borde suave) + halo sobre la pared.
    for (const [nombre, R] of Object.entries(AROS)) {
      const aro = sala.getObjectByName(nombre)
      if (!aro) continue
      const p = aro.getWorldPosition(new THREE.Vector3())
      const factor = (R / 0.62) ** 2
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
      lamparas.push({ foco, halo, factor })
    }

    // Pantalla OLED en HTML, exactamente sobre su ventana. El plano del GLB es horizontal en su
    // espacio local (XZ, mirando a +Y); el elemento CSS es XY mirando a +Z: se gira -90° en X.
    if (pantallaCss) {
      const caja = new THREE.Box3().setFromBufferAttribute(pantallaCss.geometry.attributes.position)
      const anchoM = caja.max.x - caja.min.x
      const obj = new CSS3DObject(oled.el)
      obj.matrixAutoUpdate = false
      const escala = anchoM / (OLED.ancho * 4)
      obj.matrix
        .copy(pantallaCss.matrixWorld)
        .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
        .multiply(new THREE.Matrix4().makeScale(escala, escala, escala))
      escenaCss.add(obj)
    }

    // Anclas de los mandos (para colocar encima los controles HTML accesibles).
    const local = (x, yBlender) => consola.localToWorld(new THREE.Vector3(x, 0, -yBlender))
    if (rueda) {
      anclas.rueda = rueda.getWorldPosition(new THREE.Vector3())
      anclas.ruedaBorde = rueda.localToWorld(new THREE.Vector3(RUEDA_RADIO, 0, 0))
    }
    anclas.fader0 = local(FADER.x, FADER.y0)
    anclas.fader1 = local(FADER.x, FADER.y1)

    colocar(tamano) // ya hay consola: el encuadre deja su margen inferior
    // Las piezas tienen física: se arrastran, caen y vuelcan; su movimiento activa el sensor.
    // El sensor no mira hasta que entra la esfera: el asentamiento inicial de las piezas no cuenta.
    let sensorListo = false
    fisica = crearFisica({ escena, camara, dom, alMover: () => sensorListo && alMover(), despertar })
    // Demostración: cuando la sala ya está cargada y los cuadros van fluidos, una esfera entra rodando
    // desde fuera del encuadre y su movimiento enciende la sala. Con movimiento reducido no rueda.
    cuandoEstable(() => {
      if (destruida) return
      if (!reducido) fisica.lanzarEntrada()
      setTimeout(() => {
        if (destruida) return
        sensorListo = true // el sensor «la ve» un momento después, ya dentro de la sala
        if (reducido) alMover()
      }, ENTRADA_SENSOR_MS)
    })
    medirSentidoRueda()
    piezasRueda = ['Rueda_Disco', 'Rueda_Buje', 'Rueda_Giro']
      .map((n) => sala.getObjectByName(n))
      .filter(Boolean)
      .map((o) => ({ o, y: o.position.y }))
    baseTirador = tirador ? tirador.position.y : null
    aplicarMandos()
    oled.actualizar(estadoPantalla())
    alCargar()
    despertar()
  })

  // ---- Cámara y postproceso -----------------------------------------------------------
  const camara = new THREE.PerspectiveCamera(FOV_BLENDER, ASPECTO_BLENDER, 0.05, 80)
  const buffer = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
  const composer = new EffectComposer(renderer, buffer)
  composer.setPixelRatio(ppp)
  composer.addPass(new RenderPass(escena, camara))
  const ao = new GTAOPass(escena, camara, 1, 1)
  ao.updateGtaoMaterial({ radius: 0.4, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16 })
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 })
  ao.blendIntensity = 0.9
  composer.addPass(ao)
  const pasoConos = new RenderPass(escenaConos, camara)
  pasoConos.clear = false // se suma sobre la imagen…
  pasoConos.clearDepth = true // …con su propia profundidad: la de la consola, que los tapa
  composer.addPass(pasoConos)
  // Umbral alto: solo florece lo que emite (los difusores). Con umbral 1 florecían también el suelo
  // iluminado y el aluminio claro de la consola, y su halo velaba media sala.
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM, 0.55, 2.5)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  const tamano = { ancho: 1, alto: 1 }
  let bordeConsola = null
  const MARGEN_INFERIOR = 0.045 // fracción del alto que queda libre bajo la consola

  /** Encuadre de Blender, con tres ajustes: si el hueco es más estrecho, se abre el ángulo vertical
   *  para conservar el ancho; si la consola queda pegada abajo (pantallas anchas), primero se abre
   *  el ángulo mientras la consola siga saliendo por los dos bordes y, si aún falta margen, se
   *  desplaza el encuadre hacia arriba sin cambiar la perspectiva (como el descentrable de una
   *  cámara de arquitectura). Así el margen sale repartido y no se corta el aro grande. */
  const colocar = ({ ancho, alto }) => {
    if (!(ancho > 0 && alto > 0)) return
    const aspecto = ancho / alto
    const tanH = Math.tan(THREE.MathUtils.degToRad(FOV_BLENDER / 2)) * Math.min(aspecto, ASPECTO_BLENDER)
    camara.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanH / aspecto))
    camara.aspect = aspecto
    camara.position.copy(CAMARA_POS)
    camara.lookAt(CAMARA_OBJETIVO)
    camara.clearViewOffset()
    camara.updateProjectionMatrix()
    if (bordeConsola) {
      camara.updateMatrixWorld()
      const limite = -1 + 2 * MARGEN_INFERIOR // en coordenadas de pantalla (-1 abajo, 1 arriba)
      // Canto lateral de la placa con 6 cm de holgura: mientras quede fuera de cuadro, la consola
      // sigue saliendo por los bordes y se puede abrir el ángulo.
      const lateral = new THREE.Vector3(0.74, bordeConsola.y, bordeConsola.z)
      for (let i = 0; i < 40 && bordeConsola.clone().project(camara).y < limite && lateral.clone().project(camara).x > 1; i++) {
        camara.fov += 0.2
        camara.updateProjectionMatrix()
      }
      const falta = limite - bordeConsola.clone().project(camara).y
      if (falta > 0) {
        const desplazamiento = Math.min(0.12 * alto, (falta / 2) * alto)
        camara.setViewOffset(ancho, alto, 0, desplazamiento, ancho, alto)
      }
    }
    renderer.setSize(ancho, alto, false)
    composer.setSize(ancho, alto)
    css.setSize(ancho, alto)
    Object.assign(tamano, { ancho, alto })
    despertar()
  }

  const aPantalla = (v) => {
    const p = v.clone().project(camara)
    return { x: ((p.x + 1) / 2) * tamano.ancho, y: ((1 - p.y) / 2) * tamano.alto }
  }

  /** Dónde están los mandos en pantalla (px del lienzo) y la caja de los aros (sensor). */
  const posiciones = () => {
    if (!anclas.rueda) return null
    const c = aPantalla(anclas.rueda)
    const b = aPantalla(anclas.ruedaBorde)
    const d0 = aPantalla(anclas.fader0)
    const d1 = aPantalla(anclas.fader1)
    const caja = new THREE.Box3()
    for (const n of Object.keys(AROS)) {
      const o = escena.getObjectByName(n)
      if (o) caja.expandByObject(o)
    }
    const esquinas = []
    for (const x of [caja.min.x, caja.max.x])
      for (const y of [caja.min.y, caja.max.y])
        for (const z of [caja.min.z, caja.max.z]) esquinas.push(aPantalla(new THREE.Vector3(x, y, z)))
    const xs = esquinas.map((e) => e.x)
    const ys = esquinas.map((e) => e.y)
    return {
      perilla: { x: c.x, y: c.y, radio: Math.hypot(b.x - c.x, b.y - c.y) },
      deslizador: { x0: d0.x, y0: d0.y, x1: d1.x, y1: d1.y },
      aros: { x: Math.min(...xs), y: Math.min(...ys), ancho: Math.max(...xs) - Math.min(...xs), alto: Math.max(...ys) - Math.min(...ys) },
    }
  }

  // ---- Estado ---------------------------------------------------------------------------
  let objetivo = 0
  let nivel = 0
  let encendidoEn = -1e9
  let barrido = 0
  let duracionS = 15
  let datosPantalla = { encendida: false, restanteMs: 0, duracionMs: 15000 }
  // Lo que se ve persigue lo pedido con muelles: la rueda, el fader y el hundido al pulsar.
  const mIntensidad = nuevoMuelle(0.7, 0.07)
  const mDuracion = nuevoMuelle(15, 0.2)
  const mRueda = nuevoMuelle(0, 0.08) // 0 suelta, 1 hundida
  const mTirador = nuevoMuelle(0, 0.08)
  let fisica = null
  let piezasRueda = [] // [{ o, y }] lo que se hunde al pulsar (no el pozo: es el borde y debe verse)
  let baseTirador = null
  let cuadro = 0
  let reloj = 0
  let visible = true

  const estadoPantalla = () => ({
    ...datosPantalla,
    intensidad: mIntensidad.objetivo,
    duracionS,
  })

  // Sentido de giro del punto en pantalla: se mide en vez de suponerlo, para que al subir el
  // valor avance en sentido horario tal y como se ve (y así siga al dedo).
  let signoRueda = -1
  function medirSentidoRueda() {
    const punto = escena.getObjectByName('Rueda_Punto')
    if (!ruedaGiro || !punto || !anclas.rueda) return
    const centro = aPantalla(anclas.rueda)
    const anguloPunto = (rot) => {
      ruedaGiro.rotation.y = rot
      ruedaGiro.updateMatrixWorld(true)
      const p = aPantalla(new THREE.Box3().setFromObject(punto).getCenter(new THREE.Vector3()))
      return Math.atan2(p.y - centro.y, p.x - centro.x)
    }
    let d = anguloPunto(0.3) - anguloPunto(0)
    if (d > Math.PI) d -= 2 * Math.PI
    if (d < -Math.PI) d += 2 * Math.PI
    signoRueda = d > 0 ? 1 : -1
  }

  function aplicarMandos() {
    // Hacia la derecha sube: 0 abajo a la izquierda, 100 % abajo a la derecha (sentido horario).
    if (ruedaGiro) ruedaGiro.rotation.y = signoRueda * THREE.MathUtils.degToRad(-135 + mIntensidad.valor * 270)
    for (const p of piezasRueda) p.o.position.y = p.y - 0.0008 * mRueda.valor
    if (tirador) {
      const v = (mDuracion.valor - FADER.min) / (FADER.max - FADER.min)
      tirador.position.z = -(FADER.y0 + (FADER.y1 - FADER.y0) * v)
      if (baseTirador !== null) tirador.position.y = baseTirador - 0.0012 * mTirador.valor
    }
  }

  const pintar = (ahora) => {
    const dt = Math.min(0.033, (ahora - reloj) / 1000 || 0.016)
    reloj = ahora
    const fisicaActiva = fisica ? fisica.paso(dt) : false
    const rapidez = reducido ? 10 : objetivo > nivel ? 9 : 2.6
    nivel += (objetivo - nivel) * Math.min(1, dt * rapidez)
    if (Math.abs(objetivo - nivel) < 0.002) nivel = objetivo
    let parpadeo = 1
    const desde = ahora - encendidoEn
    if (!reducido && objetivo === 1 && desde < 380) {
      parpadeo = desde < 90 ? 0.55 : desde < 170 ? 0.2 : desde < 260 ? 0.85 : 0.6
    }
    const n = nivel * parpadeo

    let mueve = false
    for (const m of [mIntensidad, mDuracion, mRueda, mTirador]) mueve = muelle(m, dt) || mueve
    aplicarMandos()

    const f = 0.08 + mIntensidad.valor * 0.92 // la rueda, como un LED con dimmer (100 % = máximo)
    if (difusor) difusor.emissiveIntensity = n * EMISION * f
    for (const l of lamparas) {
      l.foco.intensity = n * FOCO * l.factor * f
      l.halo.intensity = n * HALO * Math.sqrt(l.factor) * f
    }
    const encendidos = n > 0.001
    for (const h of haces) {
      h.malla.visible = encendidos
      h.malla.material.uniforms.uFuerza.value = n * CONO * h.fuerza * f
    }
    for (const c of charcos) {
      c.visible = encendidos
      c.material.uniforms.uFuerza.value = n * CHARCO * f
    }
    bloom.strength = BLOOM * Math.max(0.4, f)

    // La sala pesa en la cabina: a oscuras la consola se apaga con ella (25 %); con la lámpara
    // vuelve su luz, con un toque cálido de los aros, y a partir de ~70 % ya no sube (no se quema).
    const sala = THREE.MathUtils.smoothstep(n * f, 0, 0.7)
    const peso = 0.25 + 0.75 * sala
    cabina.intensity = CABINA * peso
    cabina.color.copy(LUZ_CABINA).lerp(LUZ_LED, 0.3 * sala)
    for (const x of metalesConsola) x.m.envMapIntensity = x.base * peso
    const tono = 0.45 + 0.55 * sala // a oscuras, la consola devuelve menos luz (como en penumbra)
    for (const x of coloresConsola) x.m.color.copy(x.base).multiplyScalar(tono)
    if (objetivo === 1) barrido = reducido ? 1 : Math.min(1, barrido + dt / LED_BARRIDO_S)
    else if (nivel < 0.01) barrido = 0
    ledMat.uniforms.uBarrido.value = barrido
    ledMat.uniforms.uFuerza.value = nivel * 1.1 * f

    composer.render()
    css.render(escenaCss, camara)
    return fisicaActiva || mueve || !(nivel === objetivo && desde > 400 && (objetivo === 0 || barrido === 1))
  }

  const bucle = (ahora) => {
    const seguir = pintar(ahora)
    cuadro = seguir && visible ? requestAnimationFrame(bucle) : 0
  }
  function despertar() {
    if (cuadro || !visible) return
    reloj = performance.now()
    cuadro = requestAnimationFrame(bucle)
  }

  const vigia = new IntersectionObserver(([entrada]) => {
    visible = entrada.isIntersecting
    if (visible) despertar()
  })
  vigia.observe(contenedor)

  // Solo en desarrollo: acceso a la escena desde la consola del navegador (o un script de pruebas)
  // para afinar la luz sin recompilar.
  if (import.meta.env.DEV) window.__sala = { escena, escenaConos, bloom, cabina, lamparas, haces, charcos, despertar, pintar: () => composer.render() }

  return {
    colocar,
    posiciones,
    /** Mientras se arrastra, casi 1:1 (respuesta corta); en saltos (teclado, giro con inercia)
     *  la pieza viaja con más calma hasta el valor. */
    setIntensidad(v) {
      const nuevo = Math.max(0, Math.min(1, v))
      mIntensidad.respuesta = Math.abs(nuevo - mIntensidad.objetivo) > 0.03 ? 0.3 : 0.07
      mIntensidad.objetivo = nuevo
      oled.actualizar(estadoPantalla())
      despertar()
    },
    setDuracion(s) {
      duracionS = s
      mDuracion.objetivo = s
      oled.actualizar(estadoPantalla())
      despertar()
    },
    setPantalla(datos) {
      datosPantalla = datos
      oled.actualizar(estadoPantalla())
    },
    /** La pieza se hunde al instante al pulsarla y vuelve con calma al soltarla. */
    setPulsado({ perilla, deslizador } = {}) {
      if (perilla !== undefined) {
        mRueda.objetivo = perilla ? 1 : 0
        mRueda.respuesta = perilla ? 0.06 : 0.22
      }
      if (deslizador !== undefined) {
        mTirador.objetivo = deslizador ? 1 : 0
        mTirador.respuesta = deslizador ? 0.06 : 0.22
      }
      despertar()
    },
    setEncendida(valor) {
      const nuevo = valor ? 1 : 0
      if (nuevo === 1 && objetivo === 0) encendidoEn = performance.now()
      objetivo = nuevo
      despertar()
    },
    destruir() {
      destruida = true
      cancelAnimationFrame(cuadro)
      vigia.disconnect()
      fisica?.destruir()
      for (const e of [escena, escenaConos]) {
        e.traverse((o) => {
          o.geometry?.dispose()
          for (const k of ['map', 'normalMap', 'roughnessMap']) o.material?.[k]?.dispose()
          o.material?.dispose?.()
        })
      }
      buffer.dispose()
      estudio.dispose()
      pmrem.dispose()
      ao.dispose()
      composer.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      css.domElement.remove()
    },
  }
}
