// First-person rover / astronaut view: the real Gale terrain (473×593 cells of 25 m from the 1 m NASA DEM) as a mesh,
// the HiRISE colour image as its skin, plus what a 25 m grid can't give us: procedural ground grain and pebbles,
// scattered rocks (denser on steeper ground), a Mars sky with the sun placed from the real local solar time, haze,
// the planned route painted on the ground, and light beacons at the science sites.
// Display-space colour pipeline: every colour below is authored as it should appear, output is not re-encoded.
import * as THREE from 'three';
import { HeightField } from './rover-terrain';
import { pointOnPolyline } from './mission-timeline';

export type Beacon = { id: string; name: string; x: number; z: number; color: string; kind: 'base' | 'site' | 'target' };

export type SceneOptions = {
  canvas: HTMLCanvasElement;
  elev: Float32Array;
  w: number;
  h: number;
  cellX: number;
  cellY: number;
  /** Steepest slope (deg) inside each cell: rocks are denser on steeper ground. */
  fineSlope: Float32Array | null;
  textureUrl: string;
  /** Outbound route polyline in metres (x east, z south of the region's NW corner) and its cumulative distances. */
  routePts: [number, number][];
  routeCum: number[];
  routeColor: string;
  beacons: Beacon[];
  mode: 'rover' | 'foot';
};

/** Where the camera should be, set every frame by the simulation. */
export type ViewState = {
  x: number;
  z: number;
  /** Radians, clockwise from north (north = −z, east = +x). */
  heading: number;
  /** Mission speed (m/s), only used for the bump of the ride. */
  speed: number;
  /** Distance along the outbound polyline (m) and the direction of travel on it. */
  sRoute: number;
  dir: 1 | -1;
  sunAzDeg: number;
  sunElDeg: number;
};

const FOG_K = 1.5e-4; // 1 − exp(−(d·k)²): ~30 % at 4 km, ~80 % at 8 km, fully hazed at the region's far edge
const ROCK_RADIUS = 240;
const ROCK_CELL = 12;
const ROCK_MAX = 2600;

const hex = (css: string) => {
  const c = new THREE.Color();
  c.set(css);
  // authored in display space: undo three's sRGB→linear on parse so the shader gets the colour as written
  return new THREE.Vector3().setFromColor(c.convertLinearToSRGB());
};
const hash2 = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const NOISE_GLSL = /* glsl */ `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
`;

const TERRAIN_VERT = /* glsl */ `
varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUv;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz; vNormal = normal; vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const TERRAIN_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform vec3 uSunDir, uSunColor, uAmbient, uFogColor;
uniform float uFogK;
varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUv;
${NOISE_GLSL}
void main() {
  float dist = length(vWorld - cameraPosition);
  vec3 base = texture2D(uMap, vUv).rgb;
  // ground grain and pebbles, faded with distance so nothing shimmers on the horizon
  float near = 1.0 - smoothstep(60.0, 700.0, dist);
  vec2 q = vWorld.xz;
  float n0 = fbm(q * 0.045), n1 = fbm(q * 0.31), n2 = noise(q * 2.6), n3 = noise(q * 11.0);
  float v = (n0 - 0.5) * 0.30 + near * ((n1 - 0.5) * 0.34 + (n2 - 0.5) * 0.40 + (n3 - 0.5) * 0.28);
  vec3 col = base * (1.0 + v);
  // micro-relief: bend the normal with the same noise
  float e = 0.12;
  float gx = (noise((q + vec2(e, 0.0)) * 2.6) - noise((q - vec2(e, 0.0)) * 2.6)) + 0.6 * (noise((q + vec2(e, 0.0)) * 11.0) - noise((q - vec2(e, 0.0)) * 11.0));
  float gz = (noise((q + vec2(0.0, e)) * 2.6) - noise((q - vec2(0.0, e)) * 2.6)) + 0.6 * (noise((q + vec2(0.0, e)) * 11.0) - noise((q - vec2(0.0, e)) * 11.0));
  vec3 N = normalize(normalize(vNormal) + near * 1.3 * vec3(-gx, 0.0, -gz));
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 lit = col * (uAmbient + uSunColor * ndl);
  float f = 1.0 - exp(-pow(dist * uFogK, 2.0));
  gl_FragColor = vec4(mix(lit, uFogColor, f), 1.0);
}`;

const ROCK_VERT = /* glsl */ `
varying vec3 vWorld; varying vec3 vNormal; varying float vSeed;
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = m * instanceMatrix;
  #endif
  vec4 wp = m * vec4(position, 1.0);
  vec3 centre = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  // rocks shrink to nothing at the edge of the scatter radius instead of popping
  float s = 1.0 - smoothstep(${(ROCK_RADIUS * 0.72).toFixed(1)}, ${ROCK_RADIUS.toFixed(1)}, distance(centre, cameraPosition));
  wp.xyz = centre + (wp.xyz - centre) * s;
  vWorld = wp.xyz; vSeed = fract(sin(dot(centre.xz, vec2(12.9898, 78.233))) * 43758.5453);
  vNormal = normalize(mat3(m) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const ROCK_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunDir, uSunColor, uAmbient, uFogColor;
uniform float uFogK;
varying vec3 vWorld; varying vec3 vNormal; varying float vSeed;
void main() {
  vec3 base = mix(vec3(0.27, 0.17, 0.12), vec3(0.42, 0.29, 0.20), vSeed);
  float ndl = max(dot(normalize(vNormal), uSunDir), 0.0);
  vec3 lit = base * (uAmbient * 0.9 + uSunColor * ndl);
  float dist = length(vWorld - cameraPosition);
  float f = 1.0 - exp(-pow(dist * uFogK, 2.0));
  gl_FragColor = vec4(mix(lit, uFogColor, f), 1.0);
}`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const SKY_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunDir; uniform float uSunEl;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.25, 1.0);
  vec3 horizon = vec3(0.90, 0.72, 0.54), mid = vec3(0.78, 0.60, 0.46), zenith = vec3(0.55, 0.40, 0.33);
  vec3 sky = mix(horizon, mid, smoothstep(0.0, 0.25, h));
  sky = mix(sky, zenith, smoothstep(0.15, 0.9, h));
  float sd = max(dot(d, uSunDir), 0.0);
  // on Mars the sky around the sun turns blue as the sun gets low
  float low = 1.0 - smoothstep(0.0, 0.5, uSunEl);
  sky += mix(vec3(1.0, 0.82, 0.58), vec3(0.62, 0.74, 0.95), low) * (pow(sd, 18.0) * 0.55 + pow(sd, 3.0) * 0.12);
  sky += vec3(1.0, 0.97, 0.9) * smoothstep(0.9993, 0.9998, sd);
  sky = mix(sky, horizon * 0.9, smoothstep(0.0, -0.12, d.y));
  gl_FragColor = vec4(sky, 1.0);
}`;

const RIBBON_VERT = /* glsl */ `
attribute float aS;
varying float vS; varying vec2 vUv; varying vec3 vWorld;
void main() {
  vS = aS; vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const RIBBON_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor, uFogColor; uniform float uCenter, uAhead, uTime, uFogK;
varying float vS; varying vec2 vUv; varying vec3 vWorld;
void main() {
  float d = (vS - uCenter) * uAhead;                       // metres ahead along the direction of travel
  float aheadFade = 1.0 - smoothstep(700.0, 1600.0, d);
  float passed = smoothstep(-30.0, -4.0, d);
  float p = fract((vS * uAhead) / 7.0 - uTime * 0.7);      // bars flowing toward the camera
  float bar = smoothstep(0.0, 0.1, p) * (1.0 - smoothstep(0.32, 0.48, p));
  float edge = smoothstep(0.0, 0.22, vUv.x) * (1.0 - smoothstep(0.78, 1.0, vUv.x));
  float a = (0.30 + 0.60 * bar) * edge * aheadFade * passed;
  float dist = length(vWorld - cameraPosition);
  float f = 1.0 - exp(-pow(dist * uFogK, 2.0));
  gl_FragColor = vec4(mix(uColor, uFogColor, f * 0.65), a);
}`;

const BEACON_VERT = /* glsl */ `
varying float vY;
void main() { vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const BEACON_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor; varying float vY;
void main() {
  float t = clamp(vY / 700.0, 0.0, 1.0);
  gl_FragColor = vec4(uColor, pow(1.0 - t, 1.6) * 0.5);
}`;

export class RoverScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.5, 60000);
  readonly scene = new THREE.Scene();
  readonly field: HeightField;
  /** Resolves when the HiRISE skin has loaded. */
  readonly ready: Promise<void>;
  /** User look-around offsets in radians (drag to look; the view eases back). */
  look = { yaw: 0, pitch: 0 };
  dragging = false;
  /** Extra yaw (radians) set by the caller, e.g. a slow look-around while working at a site. */
  autoYaw = 0;

  private readonly o: SceneOptions;
  private readonly shared = {
    uSunDir: { value: new THREE.Vector3(0.4, 0.7, -0.5).normalize() },
    uSunColor: { value: new THREE.Vector3(0.8, 0.72, 0.62) },
    uAmbient: { value: new THREE.Vector3(0.3, 0.25, 0.22) },
    uFogColor: { value: new THREE.Vector3(0.86, 0.68, 0.5) },
    uFogK: { value: FOG_K },
  };
  private readonly terrainMat: THREE.ShaderMaterial;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly ribbonMat: THREE.ShaderMaterial;
  private readonly rocks: THREE.InstancedMesh;
  private readonly sky: THREE.Mesh;
  private readonly disposables: { dispose: () => void }[] = [];
  private view: ViewState;
  private cam = { y: NaN, heading: NaN };
  private t = 0;
  private rockCentre: [number, number] = [NaN, NaN];
  private lastSunKey = '';

  constructor(o: SceneOptions) {
    this.o = o;
    this.renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.field = new HeightField(o.elev, o.w, o.h, o.cellX, o.cellY, 60);

    // ---- terrain ----
    const f = this.field;
    const n = f.w2 * f.h2;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const regionW = o.w * o.cellX;
    const regionH = o.h * o.cellY;
    for (let j = 0; j < f.h2; j++) {
      for (let i = 0; i < f.w2; i++) {
        const k = j * f.w2 + i;
        const x = f.x(i);
        const z = f.z(j);
        pos[k * 3] = x;
        pos[k * 3 + 1] = f.heights[k];
        pos[k * 3 + 2] = z;
        uv[k * 2] = x / regionW;
        uv[k * 2 + 1] = 1 - z / regionH;
        const hL = f.heights[j * f.w2 + Math.max(i - 1, 0)];
        const hR = f.heights[j * f.w2 + Math.min(i + 1, f.w2 - 1)];
        const hU = f.heights[Math.max(j - 1, 0) * f.w2 + i];
        const hD = f.heights[Math.min(j + 1, f.h2 - 1) * f.w2 + i];
        const nx = (hL - hR) / (2 * o.cellX);
        const nz = (hU - hD) / (2 * o.cellY);
        const len = Math.hypot(nx, 1, nz);
        nor[k * 3] = nx / len;
        nor[k * 3 + 1] = 1 / len;
        nor[k * 3 + 2] = nz / len;
      }
    }
    const index = new Uint32Array((f.w2 - 1) * (f.h2 - 1) * 6);
    let q = 0;
    for (let j = 0; j < f.h2 - 1; j++) {
      for (let i = 0; i < f.w2 - 1; i++) {
        const a = j * f.w2 + i;
        const b = a + 1;
        const c = a + f.w2;
        const d = c + 1;
        index[q++] = a; index[q++] = c; index[q++] = b; // faces up (+y); the diagonal b–c matches HeightField.heightAt
        index[q++] = b; index[q++] = c; index[q++] = d;
      }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    tg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    tg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    tg.setIndex(new THREE.BufferAttribute(index, 1));
    const placeholder = new THREE.DataTexture(new Uint8Array([176, 110, 72, 255]), 1, 1);
    placeholder.needsUpdate = true;
    this.terrainMat = new THREE.ShaderMaterial({
      uniforms: { ...this.shared, uMap: { value: placeholder } },
      vertexShader: TERRAIN_VERT,
      fragmentShader: TERRAIN_FRAG,
    });
    const terrain = new THREE.Mesh(tg, this.terrainMat);
    terrain.frustumCulled = false;
    this.scene.add(terrain);
    this.disposables.push(tg, this.terrainMat, placeholder);

    // ---- sky ----
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { uSunDir: this.shared.uSunDir, uSunEl: { value: 0.8 } },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    const skyGeo = new THREE.SphereGeometry(1000, 40, 20);
    this.sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.sky.renderOrder = -1000;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.disposables.push(skyGeo, this.skyMat);

    // ---- rocks ----
    const rg = new THREE.IcosahedronGeometry(1, 1);
    const rp = rg.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
      const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
      const r = 0.72 + 0.5 * (s - Math.floor(s)); // same vertex position → same jitter, so the rock stays closed
      rp.setXYZ(i, x * r, y * r * 0.62, z * r);
    }
    rg.computeVertexNormals();
    const rockMat = new THREE.ShaderMaterial({ uniforms: { ...this.shared }, vertexShader: ROCK_VERT, fragmentShader: ROCK_FRAG });
    this.rocks = new THREE.InstancedMesh(rg, rockMat, ROCK_MAX);
    this.rocks.count = 0;
    this.rocks.frustumCulled = false;
    this.scene.add(this.rocks);
    this.disposables.push(rg, rockMat);

    // ---- route ribbon painted on the ground ----
    this.ribbonMat = new THREE.ShaderMaterial({
      uniforms: { ...this.shared, uColor: { value: hex(o.routeColor) }, uCenter: { value: 0 }, uAhead: { value: 1 }, uTime: { value: 0 } },
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const ribbonGeo = this.buildRibbon(o.routePts, o.routeCum, 1.6, 5);
    const ribbon = new THREE.Mesh(ribbonGeo, this.ribbonMat);
    ribbon.frustumCulled = false;
    ribbon.renderOrder = 2;
    this.scene.add(ribbon);
    this.disposables.push(ribbonGeo, this.ribbonMat);

    // ---- beacons ----
    const cyl = new THREE.CylinderGeometry(1.3, 1.3, 700, 14, 1, true);
    cyl.translate(0, 350, 0);
    this.disposables.push(cyl);
    for (const b of o.beacons) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: hex(b.color) } },
        vertexShader: BEACON_VERT,
        fragmentShader: BEACON_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(cyl, mat);
      m.position.set(b.x, this.field.heightAt(b.x, b.z), b.z);
      m.frustumCulled = false;
      m.renderOrder = 3;
      this.scene.add(m);
      this.disposables.push(mat);
    }

    // initial view: at the start of the route, looking along it
    const p0 = o.routePts[0] ?? [0, 0];
    const p1 = pointOnPolyline(o.routeCum, o.routePts, 60);
    this.view = {
      x: p0[0],
      z: p0[1],
      heading: Math.atan2(p1[0] - p0[0], -(p1[1] - p0[1])),
      speed: 0,
      sRoute: 0,
      dir: 1,
      sunAzDeg: 180,
      sunElDeg: 50,
    };
    this.setSun(this.view.sunAzDeg, this.view.sunElDeg);
    this.ready = new THREE.TextureLoader().loadAsync(o.textureUrl).then((tex) => {
      tex.colorSpace = THREE.NoColorSpace;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      this.terrainMat.uniforms.uMap.value = tex;
      this.disposables.push(tex);
    });
  }

  /** Strip of triangles lying on the ground along the route, `width` m wide, one cross-section every `step` m. */
  private buildRibbon(pts: [number, number][], cum: number[], width: number, step: number): THREE.BufferGeometry {
    const total = cum[cum.length - 1] || 1;
    const count = Math.max(2, Math.ceil(total / step) + 1);
    const pos = new Float32Array(count * 2 * 3);
    const uv = new Float32Array(count * 2 * 2);
    const aS = new Float32Array(count * 2);
    for (let k = 0; k < count; k++) {
      const s = Math.min(total, k * step);
      const p = pointOnPolyline(cum, pts, s);
      const a = pointOnPolyline(cum, pts, Math.max(0, s - 3));
      const b = pointOnPolyline(cum, pts, Math.min(total, s + 3));
      let tx = b[0] - a[0];
      let tz = b[1] - a[1];
      const len = Math.hypot(tx, tz) || 1;
      tx /= len;
      tz /= len;
      const nx = -tz * (width / 2);
      const nz = tx * (width / 2);
      const L: [number, number] = [p[0] + nx, p[1] + nz];
      const R: [number, number] = [p[0] - nx, p[1] - nz];
      pos.set([L[0], this.field.heightAt(L[0], L[1]) + 0.35, L[1]], k * 6);
      pos.set([R[0], this.field.heightAt(R[0], R[1]) + 0.35, R[1]], k * 6 + 3);
      uv.set([0, s / 7, 1, s / 7], k * 4);
      aS[k * 2] = s;
      aS[k * 2 + 1] = s;
    }
    const index: number[] = [];
    for (let k = 0; k < count - 1; k++) {
      const a = k * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
    g.setIndex(index);
    return g;
  }

  setSize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  setView(v: ViewState) {
    this.view = v;
  }

  /** Sun from azimuth (deg clockwise from north) and elevation; colours follow the elevation. */
  setSun(azDeg: number, elDeg: number) {
    const key = `${azDeg.toFixed(1)}|${elDeg.toFixed(1)}`;
    if (key === this.lastSunKey) return;
    this.lastSunKey = key;
    const az = (azDeg * Math.PI) / 180;
    const el = Math.max(2, elDeg) * (Math.PI / 180);
    this.shared.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    this.skyMat.uniforms.uSunEl.value = Math.sin(el);
    const k = smooth(2, 32, elDeg);
    this.shared.uSunColor.value.set(mix(0.9, 0.82, k) * (0.4 + 0.6 * k), mix(0.5, 0.74, k) * (0.4 + 0.6 * k), mix(0.3, 0.62, k) * (0.4 + 0.6 * k));
    this.shared.uAmbient.value.set(mix(0.2, 0.3, k), mix(0.15, 0.25, k), mix(0.14, 0.22, k));
  }

  private updateRocks(cx: number, cz: number) {
    const { w, h, cellX, cellY, fineSlope } = this.o;
    const m4 = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const eul = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    let n = 0;
    const i0 = Math.floor((cx - ROCK_RADIUS) / ROCK_CELL), i1 = Math.floor((cx + ROCK_RADIUS) / ROCK_CELL);
    const j0 = Math.floor((cz - ROCK_RADIUS) / ROCK_CELL), j1 = Math.floor((cz + ROCK_RADIUS) / ROCK_CELL);
    for (let j = j0; j <= j1 && n < ROCK_MAX; j++) {
      for (let i = i0; i <= i1 && n < ROCK_MAX; i++) {
        const gx = Math.floor(((i + 0.5) * ROCK_CELL) / cellX);
        const gz = Math.floor(((j + 0.5) * ROCK_CELL) / cellY);
        const slope = fineSlope && gx >= 0 && gx < w && gz >= 0 && gz < h ? fineSlope[gz * w + gx] : 8;
        const density = 0.45 + Math.min(slope, 35) / 12; // expected rocks per cell: more on steep, broken ground
        const count = Math.min(5, Math.floor(density * (0.35 + 1.3 * hash2(i, j))));
        for (let r = 0; r < count && n < ROCK_MAX; r++) {
          const px = (i + hash2(i * 7 + r, j * 13 + r * 5)) * ROCK_CELL;
          const pz = (j + hash2(j * 5 + r * 3, i * 11 + r)) * ROCK_CELL;
          const size = 0.08 + 1.1 * Math.pow(hash2(i + r * 31, j - r * 17), 3.2);
          p.set(px, this.field.heightAt(px, pz) - size * 0.22, pz);
          eul.set(hash2(i - r, j + 3) * 0.5, hash2(i + 9, j - r) * Math.PI * 2, hash2(i + r, j - 5) * 0.5);
          quat.setFromEuler(eul);
          s.set(size, size * (0.7 + 0.6 * hash2(i * 3 + r, j * 3)), size);
          m4.compose(p, quat, s);
          this.rocks.setMatrixAt(n++, m4);
        }
      }
    }
    this.rocks.count = n;
    this.rocks.instanceMatrix.needsUpdate = true;
    this.rockCentre = [cx, cz];
  }

  /** Advance the camera towards the view the simulation asked for, and draw one frame. */
  render(dt: number) {
    const v = this.view;
    dt = Math.min(0.1, Math.max(0.0001, dt));
    this.t += dt;
    const first = Number.isNaN(this.cam.y);
    const eye = this.o.mode === 'rover' ? 2.1 : 1.75;
    const gy = this.field.heightAt(v.x, v.z);
    this.cam.y = first ? gy + eye : this.cam.y + (gy + eye - this.cam.y) * (1 - Math.exp(-dt * 14));
    this.cam.y = Math.max(this.cam.y, gy + 0.8);
    let dh = v.heading - (first ? v.heading : this.cam.heading);
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.cam.heading = (first ? v.heading : this.cam.heading) + dh * (first ? 1 : 1 - Math.exp(-dt * 4.5));

    // tilt with the ground: the vehicle pitches over crests and leans on side slopes
    const hx = Math.sin(this.cam.heading);
    const hz = -Math.cos(this.cam.heading);
    const pitchG = this.field.slopeAlong(v.x, v.z, hx, hz, 24);
    const rollG = this.field.slopeAlong(v.x, v.z, Math.cos(this.cam.heading), Math.sin(this.cam.heading), 14);
    const bumpK = Math.min(1.2, v.speed / 1.4);
    const bob = Math.sin(this.t * 19) * 0.035 * bumpK;
    const sway = Math.sin(this.t * 7.3) * 0.006 * bumpK;
    if (!this.dragging) {
      const ease = Math.exp(-dt * 2.2);
      this.look.yaw *= ease;
      this.look.pitch *= ease;
    }
    this.camera.position.set(v.x, this.cam.y + bob, v.z);
    this.camera.rotation.set((this.o.mode === 'rover' ? -0.07 : -0.03) + 0.5 * pitchG + this.look.pitch, -this.cam.heading + this.look.yaw + this.autoYaw, 0.5 * rollG + sway, 'YXZ');

    this.setSun(v.sunAzDeg, v.sunElDeg);
    this.sky.position.copy(this.camera.position);
    this.ribbonMat.uniforms.uCenter.value = v.sRoute;
    this.ribbonMat.uniforms.uAhead.value = v.dir;
    this.ribbonMat.uniforms.uTime.value = this.t;
    if (Number.isNaN(this.rockCentre[0]) || Math.hypot(v.x - this.rockCentre[0], v.z - this.rockCentre[1]) > 40) this.updateRocks(v.x, v.z);
    this.renderer.render(this.scene, this.camera);
  }

  /** Screen position of a world point (for HTML labels): sx, sy in CSS pixels, `visible` false if behind the camera. */
  project(x: number, y: number, z: number, width: number, height: number): { sx: number; sy: number; dist: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z);
    const dist = v.distanceTo(this.camera.position);
    v.project(this.camera);
    return { sx: (v.x * 0.5 + 0.5) * width, sy: (-v.y * 0.5 + 0.5) * height, dist, visible: v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.3 && Math.abs(v.y) < 1.3 };
  }

  /** Camera attitude in degrees, for the instrument readout. */
  attitude() {
    return { pitch: (this.camera.rotation.x * 180) / Math.PI, roll: (this.camera.rotation.z * 180) / Math.PI };
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.rocks.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
