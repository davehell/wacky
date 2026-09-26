// Renders the app icon: the game's own hedgehog on the toilet, under a sunny sky on a patch of grass.
// Open /tools/icon.html?size=512 on the dev server and save the picture as public/icon-512.png
// (likewise 180 and 192); see AGENTS.md.
import * as THREE from 'three';
import { col } from '../src/util.js';
import { std, mesh } from '../src/render.js';
import { toiletHedgehog } from '../src/hedgehogs.js';

const size = Number(new URLSearchParams(location.search).get('size')) || 512;
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setPixelRatio(1); r.setSize(size, size);
r.outputEncoding = THREE.sRGBEncoding;
r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(r.domElement);

const sc = new THREE.Scene();
// sky fading from deep blue at the top to pale near the horizon, with a warm sun glow behind the hedgehog
sc.background = new THREE.CanvasTexture((() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#3b8fe8'); sky.addColorStop(0.7, '#a9dcfb'); sky.addColorStop(1, '#cdeafc');
  g.fillStyle = sky; g.fillRect(0, 0, 256, 256);
  const sun = g.createRadialGradient(150, 96, 0, 150, 96, 120);
  sun.addColorStop(0, 'rgba(255, 236, 160, 1)'); sun.addColorStop(0.35, 'rgba(255, 214, 110, 0.75)'); sun.addColorStop(1, 'rgba(255, 214, 110, 0)');
  g.fillStyle = sun; g.fillRect(0, 0, 256, 256);
  return c;
})());
sc.background.encoding = THREE.sRGBEncoding;

sc.add(new THREE.HemisphereLight(col(0xe4f2ff), col(0x5d7f3c), 0.85));
const sun = new THREE.DirectionalLight(col(0xfff0d4), 1.35);
sun.position.set(2.5, 6, 5); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 20 });
sun.shadow.bias = -0.0005;
sc.add(sun);
const fill = new THREE.DirectionalLight(col(0xffffff), 0.35);
fill.position.set(-4, 2, 3);
sc.add(fill);

const grass = mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.2, 48), std(0x6cc24a, { roughness: 0.9 }));
grass.position.y = -0.1;
sc.add(grass);

const hog = toiletHedgehog();
hog.rotation.y = 0.45;
sc.add(hog);
hog.updateMatrixWorld(true);

const box = new THREE.Box3().setFromObject(hog);
const center = box.getCenter(new THREE.Vector3());
const radius = box.getSize(new THREE.Vector3()).length() * 0.4;
const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
cam.position.copy(center).addScaledVector(new THREE.Vector3(0.1, 0.32, 1).normalize(), radius / Math.sin((14 * Math.PI) / 180));
cam.lookAt(center.x, center.y - 0.12, center.z);

r.render(sc, cam);
document.body.dataset.ready = '1';
