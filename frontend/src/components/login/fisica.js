// Física de las piezas de la sala (cannon-es, JavaScript puro: no necesita WebAssembly ni relajar la
// CSP). Se arrastran con el ratón o el dedo en un plano frente a la cámara: se pueden levantar,
// soltar, empujarse entre sí y volcar. Su movimiento es lo que activa el sensor de la sala.
//
// Los cuerpos se generan a partir de la geometría del GLB: cada malla de una pieza aporta una caja
// ajustada a ella (la esfera y el tambor de la escultura, sus formas reales para que rueden).
// Cuando todo queda quieto, los cuerpos se duermen y la escena deja de pintarse.
import * as CANNON from 'cannon-es'
import * as THREE from 'three'

// Piezas que se pueden coger (nombre del nodo raíz en el GLB) y su densidad aparente (kg/m³).
const PIEZAS = {
  Busto: 900,
  Taburete: 260,
  Pila_1_Losa: 700,
  Pila_2_Tambor: 500,
  Pila_3_Dado: 500,
  Pila_4_Esfera: 400,
}
const PARED_Z = -3 // cara de los paneles
const LIMITES = { x: 2.4, zDelante: 4.2 } // vallas invisibles: las piezas no salen de la sala
const UMBRAL_MOVIMIENTO = 0.15 // m/s: por encima, el sensor «ve» movimiento (los asentamientos no)
// Rozamiento alto: las piezas frenan y se asientan enseguida, sin deslizar ni rodar en bucle.
const FRENO = { linearDamping: 0.5, angularDamping: 0.6, sleepSpeedLimit: 0.12, sleepTimeLimit: 0.3 }
// Esfera de entrada: rueda desde la izquierda al cargar, por delante de las piezas.
// Espera fuera de cuadro (más allá de la valla izquierda, que no la toca hasta que entra) y se
// lanza con la velocidad justa para pararse en `hasta` (con FRENO recorre ~1,27 m por cada m/s).
const ENTRADA = { radio: 0.1, y: 0.1, z: 0.42, espera: -8, hasta: -0.15, metrosPorVelocidad: 1.27 }
const VALLA_IZQUIERDA = 2 // grupo de colisión propio: la esfera lo ignora mientras viene de fuera

/**
 * Monta la física. `dom` recibe el puntero (la sala); `camara` y `escena` para apuntar con rayos.
 * `alMover()` se llama (como mucho cada 200 ms) mientras alguna pieza se mueve; `despertar()` pide
 * que la escena vuelva a pintarse. Devuelve `paso(dt)` (true si algo sigue moviéndose) y `destruir`.
 */
export function crearFisica({ escena, camara, dom, alMover, despertar }) {
  const mundo = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) })
  mundo.allowSleep = true
  mundo.broadphase = new CANNON.SAPBroadphase(mundo)
  mundo.defaultContactMaterial.friction = 0.5
  mundo.defaultContactMaterial.restitution = 0.06

  // Suelo, pared y vallas invisibles.
  const plano = (pos, rotX, rotY = 0) => {
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() })
    b.position.set(...pos)
    b.quaternion.setFromEuler(rotX, rotY, 0)
    mundo.addBody(b)
    return b
  }
  plano([0, 0, 0], -Math.PI / 2) // suelo (normal +Y)
  plano([0, 0, PARED_Z], 0) // pared (normal +Z)
  plano([0, 0, LIMITES.zDelante], 0, Math.PI) // valla delantera (normal -Z)
  plano([-LIMITES.x, 0, 0], 0, Math.PI / 2).collisionFilterGroup = VALLA_IZQUIERDA // izquierda (normal +X)
  plano([LIMITES.x, 0, 0], 0, -Math.PI / 2) // derecha (normal -X)

  // ---- Cuerpos de las piezas ------------------------------------------------------------
  const piezas = [] // { raiz, cuerpo }
  const mallas = [] // para apuntar con rayos
  const raizDe = new Map()
  const v = new THREE.Vector3()

  for (const [nombre, densidad] of Object.entries(PIEZAS)) {
    const raiz = escena.getObjectByName(nombre)
    if (!raiz) continue
    raiz.updateMatrixWorld(true)
    // Marco de la pieza: su posición y su giro, sin escala (las formas van en metros).
    const marco = new THREE.Matrix4().compose(
      raiz.getWorldPosition(new THREE.Vector3()),
      raiz.getWorldQuaternion(new THREE.Quaternion()),
      new THREE.Vector3(1, 1, 1),
    )
    const inversa = marco.clone().invert()
    const cuerpo = new CANNON.Body({ mass: 1, ...FRENO })
    const formas = [] // { forma, centro, vol }: se añaden después, respecto al centro de masas
    let volumen = 0
    raiz.traverse((o) => {
      if (!o.isMesh) return
      // Caja de la malla en el marco de la pieza.
      const pos = o.geometry.attributes.position
      const caja = new THREE.Box3()
      for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / 4000))) {
        caja.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(inversa))
      }
      const t = caja.getSize(new THREE.Vector3())
      const c = caja.getCenter(new THREE.Vector3())
      if (t.x < 1e-4 || t.y < 1e-4 || t.z < 1e-4) return
      let forma
      if (nombre.includes('Esfera')) forma = new CANNON.Sphere(Math.max(t.x, t.y, t.z) / 2)
      else if (nombre.includes('Tambor')) forma = new CANNON.Cylinder(t.x / 2, t.x / 2, t.y, 24)
      else forma = new CANNON.Box(new CANNON.Vec3(Math.max(t.x, 0.012) / 2, Math.max(t.y, 0.012) / 2, Math.max(t.z, 0.012) / 2))
      formas.push({ forma, centro: c, vol: t.x * t.y * t.z })
      volumen += t.x * t.y * t.z
      mallas.push(o)
      raizDe.set(o, piezas.length)
    })
    if (!formas.length) continue
    // El cuerpo va en el centro de masas real de la pieza (centro de sus formas, ponderado por
    // volumen). Si se quedara en la base, como el origen del GLB, todo el peso estaría abajo y
    // las piezas se enderezarían solas, como un tentetieso.
    const cm = new THREE.Vector3()
    for (const f of formas) cm.addScaledVector(f.centro, f.vol / volumen)
    for (const f of formas) cuerpo.addShape(f.forma, new CANNON.Vec3(f.centro.x - cm.x, f.centro.y - cm.y, f.centro.z - cm.z))
    cuerpo.mass = Math.max(0.4, volumen * densidad)
    cuerpo.updateMassProperties()
    const q = raiz.getWorldQuaternion(new THREE.Quaternion())
    const p = cm.clone().applyMatrix4(marco) // centro de masas en el mundo
    cuerpo.position.set(p.x, p.y + 0.002, p.z)
    cuerpo.quaternion.set(q.x, q.y, q.z, q.w)
    cuerpo.sleep() // quietas hasta que alguien las toque
    mundo.addBody(cuerpo)
    piezas.push({ raiz, cuerpo, desdeCentro: new CANNON.Vec3(-cm.x, -cm.y, -cm.z) })
  }

  // ---- Esfera de entrada: rueda desde la izquierda al cargar y su movimiento enciende la luz ----
  const esfera = new THREE.Mesh(
    new THREE.SphereGeometry(ENTRADA.radio, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0xd8d3cb, roughness: 0.55, dithering: true }),
  )
  esfera.name = 'Esfera_Entrada'
  esfera.castShadow = esfera.receiveShadow = true
  esfera.position.set(ENTRADA.espera, ENTRADA.y, ENTRADA.z)
  escena.add(esfera)
  const cuerpoEsfera = new CANNON.Body({ mass: 1.2, shape: new CANNON.Sphere(ENTRADA.radio), ...FRENO })
  cuerpoEsfera.position.set(ENTRADA.espera, ENTRADA.y, ENTRADA.z)
  cuerpoEsfera.collisionFilterMask = ~VALLA_IZQUIERDA
  cuerpoEsfera.sleep()
  // Primer x en el que la esfera queda entera fuera del encuadre actual (a su altura y profundidad).
  const fueraDeCuadro = () => {
    const p = new THREE.Vector3()
    for (let x = -1; x > -12; x -= 0.05) {
      if (p.set(x + ENTRADA.radio * 1.5, ENTRADA.y, ENTRADA.z).project(camara).x < -1) return x
    }
    return -12
  }
  mundo.addBody(cuerpoEsfera)
  mallas.push(esfera)
  raizDe.set(esfera, piezas.length)
  piezas.push({ raiz: esfera, cuerpo: cuerpoEsfera, desdeCentro: new CANNON.Vec3(0, 0, 0) })

  // ---- Arrastre: una «mano» sin masa unida a la pieza por una articulación ---------------
  const mano = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC })
  mano.collisionFilterGroup = 0
  mano.collisionFilterMask = 0
  mundo.addBody(mano)
  let agarre = null // { pieza, articulacion, plano }
  const rayo = new THREE.Raycaster()
  const ndc = new THREE.Vector2()

  const apuntar = (e) => {
    const r = dom.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    rayo.setFromCamera(ndc, camara)
    return rayo
  }
  const tocada = (e) => {
    const [hit] = apuntar(e).intersectObjects(mallas, false)
    return hit ? { pieza: piezas[raizDe.get(hit.object)], punto: hit.point } : null
  }
  const esMando = (e) => e.target instanceof Element && e.target.closest('.mando-3d')

  const bajar = (e) => {
    if (esMando(e) || e.button > 0) return
    const t = tocada(e)
    if (!t) return
    e.preventDefault()
    dom.setPointerCapture?.(e.pointerId)
    const { cuerpo } = t.pieza
    cuerpo.wakeUp()
    // Plano vertical frente a la cámara que pasa por el punto agarrado: mover arriba levanta.
    const normal = camara.getWorldDirection(new THREE.Vector3()).setY(0).normalize().negate()
    const planoArrastre = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, t.punto)
    mano.position.set(t.punto.x, t.punto.y, t.punto.z)
    const local = cuerpo.pointToLocalFrame(new CANNON.Vec3(t.punto.x, t.punto.y, t.punto.z))
    const articulacion = new CANNON.PointToPointConstraint(cuerpo, local, mano, new CANNON.Vec3(0, 0, 0), cuerpo.mass * 40)
    mundo.addConstraint(articulacion)
    agarre = { pieza: t.pieza, articulacion, plano: planoArrastre }
    dom.style.cursor = 'grabbing'
    despertar()
  }
  const mover = (e) => {
    if (agarre) {
      const destino = apuntar(e).ray.intersectPlane(agarre.plano, new THREE.Vector3())
      if (destino) {
        destino.y = Math.max(0.03, Math.min(1.8, destino.y))
        destino.x = Math.max(-LIMITES.x + 0.1, Math.min(LIMITES.x - 0.1, destino.x))
        mano.position.set(destino.x, destino.y, destino.z)
        agarre.pieza.cuerpo.wakeUp()
      }
      despertar()
      return
    }
    if (e.pointerType === 'mouse' && !esMando(e)) dom.style.cursor = tocada(e) ? 'grab' : ''
  }
  const soltar = () => {
    if (!agarre) return
    mundo.removeConstraint(agarre.articulacion)
    agarre = null
    dom.style.cursor = ''
    despertar() // sigue con la velocidad que llevaba: cae, rueda o vuelca
  }
  dom.addEventListener('pointerdown', bajar)
  dom.addEventListener('pointermove', mover, { passive: true })
  dom.addEventListener('pointerup', soltar)
  dom.addEventListener('pointercancel', soltar)

  // ---- Paso de simulación ---------------------------------------------------------------
  let ultimoAviso = 0
  const paso = (dt) => {
    mundo.step(1 / 120, dt, 6)
    let activo = !!agarre
    let rapido = false
    if (cuerpoEsfera.collisionFilterMask !== -1 && cuerpoEsfera.position.x > -LIMITES.x + ENTRADA.radio) {
      cuerpoEsfera.collisionFilterMask = -1 // ya está dentro: la valla vuelve a contar para ella
    }
    for (const { raiz, cuerpo, desdeCentro } of piezas) {
      if (cuerpo.sleepState !== CANNON.Body.SLEEPING) activo = true
      // Solo cuenta el desplazamiento: una esfera que aún gira despacio en su sitio no es «movimiento».
      if (cuerpo.velocity.length() > UMBRAL_MOVIMIENTO) rapido = true
      const origen = cuerpo.pointToWorldFrame(desdeCentro) // la pieza se dibuja desde su base
      raiz.position.set(origen.x, origen.y, origen.z)
      raiz.quaternion.set(cuerpo.quaternion.x, cuerpo.quaternion.y, cuerpo.quaternion.z, cuerpo.quaternion.w)
    }
    const ahora = performance.now()
    if (rapido && ahora - ultimoAviso > 200) {
      ultimoAviso = ahora
      alMover()
    }
    return activo
  }

  return {
    paso,
    /** La esfera entra rodando por la izquierda (rueda de verdad: giro = velocidad / radio). */
    lanzarEntrada() {
      const x = fueraDeCuadro()
      const v = (ENTRADA.hasta - x) / ENTRADA.metrosPorVelocidad
      cuerpoEsfera.position.set(x, ENTRADA.y, ENTRADA.z)
      cuerpoEsfera.wakeUp()
      cuerpoEsfera.velocity.set(v, 0, 0)
      cuerpoEsfera.angularVelocity.set(0, 0, -v / ENTRADA.radio)
      despertar()
    },
    destruir() {
      dom.removeEventListener('pointerdown', bajar)
      dom.removeEventListener('pointermove', mover)
      dom.removeEventListener('pointerup', soltar)
      dom.removeEventListener('pointercancel', soltar)
    },
  }
}
