// Himmel: Kuppel mit Verlauf (Zenit, Horizont, Boden) und Sonne. Folgt der Kamera, kein Nebel.

import * as THREE from 'three';

const vertex = `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 ground;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h < 0.0
      ? mix(horizon, ground, clamp(-h * 5.0, 0.0, 1.0))
      : mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55));
    float s = max(dot(d, sunDir), 0.0);
    col += sunColor * (pow(s, 900.0) * 1.5 + pow(s, 10.0) * 0.2 + pow(s, 2.0) * 0.06);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSky(sunPosition) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color(0x4f8fd6) },
      horizon: { value: new THREE.Color(0xc3d9ea) },
      ground: { value: new THREE.Color(0xaab6c0) },
      sunDir: { value: sunPosition.clone().normalize() },
      sunColor: { value: new THREE.Color(0xfff1d0) },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), material);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  return dome;
}
