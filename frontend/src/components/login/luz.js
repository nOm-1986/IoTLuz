// Shaders de la luz de los aros (haces volumétricos y charcos en el suelo), compartidos por la
// sala del login y la lámpara del panel. La geometría de los dos viene horneada en sala.glb.
import * as THREE from 'three'

// Suma luz sin tocar el alfa: sobre un lienzo transparente (el panel) la luz se suma a la página
// en vez de taparla con un parche oscuro. En un lienzo opaco (el login) es igual que AdditiveBlending.
export const SOLO_LUZ = {
  blending: THREE.CustomBlending,
  blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
}

export const LUZ_LED = new THREE.Color(1, 0.86, 0.68) // blanco cálido, ~3000 K

/** Haz (godrays): aditivo, más denso arriba y en el eje, se funde abajo y en los bordes, con
 *  tramado. La altura relativa (0 suelo, 1 aro) viene horneada en el rojo del color de vértice. */
export function materialHaz(color = LUZ_LED) {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    ...SOLO_LUZ,
    uniforms: { uColor: { value: color.clone() }, uFuerza: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vAltura;
      varying vec3 vNormal;
      varying vec3 vVista;
      void main() {
        vAltura = color.r;
        vec4 mundo = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vVista = normalize(cameraPosition - mundo.xyz);
        gl_Position = projectionMatrix * viewMatrix * mundo;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uFuerza;
      varying float vAltura;
      varying vec3 vNormal;
      varying vec3 vVista;
      float azar(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        float h = clamp(vAltura, 0.0, 1.0);
        float caida = (0.08 + 0.92 * pow(h, 1.3)) * smoothstep(0.0, 0.4, h); // no vela las piezas
        float borde = pow(abs(dot(normalize(vNormal), normalize(vVista))), 3.6);
        float a = uFuerza * caida * borde;
        if (a <= 0.0005) discard; // apagado: nada, ni siquiera el tramado
        a += (azar(gl_FragCoord.xy) - 0.5) / 255.0 * min(1.0, a * 40.0);
        gl_FragColor = vec4(uColor, max(a, 0.0));
      }
    `,
  })
}

/** Charco de luz en el suelo: lleno por dentro y con el borde difuminado (radio en el rojo). */
export function materialCharco(color = LUZ_LED) {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    ...SOLO_LUZ,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    uniforms: { uColor: { value: color.clone() }, uFuerza: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vRadio;
      void main() {
        vRadio = color.r;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uFuerza;
      varying float vRadio;
      void main() {
        float a = uFuerza * (1.0 - smoothstep(0.78, 1.0, vRadio));
        if (a <= 0.0005) discard;
        gl_FragColor = vec4(uColor * a, 1.0);
      }
    `,
  })
}
