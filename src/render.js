import * as THREE from 'three';
import { $, col } from './util.js';

/* ================= Renderer & scene ================= */
const stage = $('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const HORIZON = 0xcdeafc;
scene.fog = new THREE.Fog(col(HORIZON), 320, 1500);
const camera = new THREE.PerspectiveCamera(66, 1, 0.5, 2600);

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(2200, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3b8fe8) }, mid: { value: new THREE.Color(0x9fd6fb) }, bot: { value: new THREE.Color(HORIZON) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = mix(mid, top, pow(clamp(h*2.0,0.0,1.0),0.7)); c = mix(bot, c, smoothstep(-0.01,0.08,h)); gl_FragColor = vec4(c,1.0); }',
  })
);
scene.add(sky);

scene.add(new THREE.HemisphereLight(col(0xcfe8ff), col(0x5d7f3c), 0.75));
const sun = new THREE.DirectionalLight(col(0xfff0d4), 1.55);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 320 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const fontTextures = [];
function canvasTex(w, h, draw, repeat, usesFont) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = MAX_ANISO;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (usesFont) fontTextures.push({ t, c, draw });
  return t;
}
if (document.fonts && document.fonts.load) {
  document.fonts.load('64px Bungee').then(() => {
    for (const f of fontTextures) { f.draw(f.c.getContext('2d'), f.c.width, f.c.height); f.t.needsUpdate = true; }
  }).catch(() => {});
}

const matCache = new Map();
function std(hex, opts) {
  const key = hex + JSON.stringify(opts || {});
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial(Object.assign({ color: col(hex), roughness: 0.55 }, opts)));
  return matCache.get(key);
}
function mesh(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }

export { stage, renderer, MAX_ANISO, scene, camera, sky, sun, canvasTex, std, mesh };
