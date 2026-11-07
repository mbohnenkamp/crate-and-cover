// Himmel: Kuppel mit Verlauf (Zenit, Horizont, Boden), Sonne und ziehenden Wolken. Folgt der Kamera, kein Nebel.
// Tageszeit je Karte (map.licht): morgen, mittag, abend — stellt Himmel, Sonne, Streulicht, Nebel und Belichtung.

import * as THREE from 'three';

export const DAYTIMES = {
  mittag: {
    sun: [18, 30, 10], sunColor: 0xfff3e0, sunIntensity: 2.6,
    hemi: [0xdde8f5, 0x6b6253, 1.5],
    zenith: 0x4f8fd6, horizon: 0xc3d9ea, ground: 0xaab6c0, glow: 0xfff1d0,
    fog: 0xc3d9ea, exposure: 1.15, cloud: 0.3, cloudColor: 0xffffff,
  },
  morgen: {
    sun: [30, 11, -10], sunColor: 0xffdcae, sunIntensity: 2.3,
    hemi: [0xd4e2f0, 0x66605a, 1.4],
    zenith: 0x5f97cf, horizon: 0xe8d6bd, ground: 0xb8b3ad, glow: 0xffe2b0,
    fog: 0xe2d8c8, exposure: 1.1, cloud: 0.36, cloudColor: 0xfff4e4,
  },
  abend: {
    sun: [-30, 9, 14], sunColor: 0xffb272, sunIntensity: 2.4,
    hemi: [0xd9c6c0, 0x5a4a42, 1.25],
    zenith: 0x3d6cae, horizon: 0xf2b98c, ground: 0xb09c90, glow: 0xffc27a,
    fog: 0xe9c3a4, exposure: 1.05, cloud: 0.33, cloudColor: 0xffd9c0,
  },
};

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
  uniform vec3 cloudColor;
  uniform float cloud;
  uniform float time;
  varying vec3 vDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h < 0.0
      ? mix(horizon, ground, clamp(-h * 5.0, 0.0, 1.0))
      : mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55));
    float s = max(dot(d, sunDir), 0.0);
    col += sunColor * (pow(s, 900.0) * 1.5 + pow(s, 10.0) * 0.2 + pow(s, 2.0) * 0.06);
    // Wolken: Richtung auf eine Ebene in Wolkenhöhe projiziert, zwei Oktaven Rauschen, ziehen langsam
    if (h > 0.02) {
      vec2 uv = d.xz / (h + 0.15) * 1.6 + vec2(time * 0.012, time * 0.004);
      float n = noise(uv) * 0.65 + noise(uv * 2.3 + 7.0) * 0.35;
      float c = smoothstep(1.0 - cloud, 1.0 - cloud + 0.25, n);
      float fade = smoothstep(0.02, 0.2, h);
      float shade = 0.72 + 0.28 * smoothstep(1.0 - cloud + 0.08, 1.0 - cloud + 0.3, n);
      col = mix(col, cloudColor * shade, c * fade * 0.9);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSky() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      ground: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color() },
      cloudColor: { value: new THREE.Color() },
      cloud: { value: 0.45 },
      time: { value: 0 },
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
  const u = material.uniforms;
  return {
    dome,
    // Himmel auf eine Tageszeit stellen
    set(t) {
      u.zenith.value.setHex(t.zenith);
      u.horizon.value.setHex(t.horizon);
      u.ground.value.setHex(t.ground);
      u.sunDir.value.set(...t.sun).normalize();
      u.sunColor.value.setHex(t.glow);
      u.cloudColor.value.setHex(t.cloudColor);
      u.cloud.value = t.cloud;
    },
    update(dt, cameraPosition) {
      u.time.value += dt;
      dome.position.copy(cameraPosition);
    },
  };
}
