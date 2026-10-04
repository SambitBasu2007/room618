import * as THREE from 'three';
import { Level } from './level';
import { Player } from './player';
import { FirstPersonInput } from './input';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Every .glb in /assets is a selectable world. The built-in test room is always available.
const modelUrls = import.meta.glob('/assets/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const chaseModelUrls = import.meta.glob('/assets/mark/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const TEST_ROOM = 'Built-in test room';
const worlds = new Map<string, string | null>();
for (const [path, url] of Object.entries(modelUrls).sort()) worlds.set(path.replace('/assets/', ''), url);
worlds.set(TEST_ROOM, null);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20242a);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 500);
scene.add(new THREE.HemisphereLight(0xffffff, 0x555566, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(4, 8, 5);
scene.add(sun);

const level = new Level();
scene.add(level.root);
const player = new Player();
const input = new FirstPersonInput(renderer.domElement);

// ---------- menu ----------
const overlay = $('overlay'), msg = $('msg'), playBtn = $<HTMLButtonElement>('play');
const chaseBtn = $<HTMLButtonElement>('chase');
const sel = $<HTMLSelectElement>('worlds'), scaleEl = $<HTMLInputElement>('scale');
for (const label of worlds.keys()) sel.add(new Option(label, label));

const isMobile = /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent) || window.innerWidth < 768;

const fullscreenButton = $<HTMLButtonElement>('fullscreenBtn');
const fullscreenIcon = fullscreenButton.querySelector('path');
function updateFullscreenButton() {
  const fullscreen = document.fullscreenElement !== null;
  fullscreenButton.setAttribute('aria-label', fullscreen ? 'Exit fullscreen' : 'Enter fullscreen');
  fullscreenButton.title = fullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
  fullscreenIcon?.setAttribute('d', fullscreen
    ? 'M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5'
    : 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5');
}
fullscreenButton.onclick = () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => {});
};
document.addEventListener('fullscreenchange', updateFullscreenButton);
updateFullscreenButton();

playBtn.onclick = () => {
  if (isMobile) input.startMobile();
  else input.lock();
};
input.onLockChange = (locked) => { overlay.style.display = locked ? 'none' : 'grid'; };

let ready = false, loadId = 0, current = '';
let chaseMode = false;
let chasePhase: 'countdown' | 'watching' | 'loading' | 'running' | 'ended' | null = null;
let chaseClock = 0;
let resetClock = 0;
let mark: THREE.Object3D | null = null;
let markMixer: THREE.AnimationMixer | null = null;
const markPlayer = new Player();
const markSpawn = new THREE.Vector3(42.839, 0.01, -56.672);
const markLoader = new GLTFLoader();
const playerSpeed = player.walkSpeed;
const chaseHud = $('chaseHud');
const chaseMessage = $('chaseMessage');
const chaseTimer = $('chaseTimer');
const chaseResult = $('chaseResult');
const chaseResultMessage = $('chaseResultMessage');

function updateViewDirection(target: THREE.Vector3) {
  const eye = new THREE.Vector3(player.pos.x, player.pos.y + player.eye, player.pos.z);
  const direction = target.clone().sub(eye);
  const horizontal = Math.hypot(direction.x, direction.z) || 1;
  input.yaw = Math.atan2(-direction.x, -direction.z);
  input.pitch = Math.atan2(direction.y, horizontal);
}

function disposeMark() {
  if (!mark) return;
  scene.remove(mark);
  mark.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    materials.forEach((material) => material.dispose());
  });
  mark = null;
  markMixer = null;
}

function showChaseHud(message: string, timer = '') {
  chaseHud.classList.add('visible');
  chaseMessage.textContent = message;
  chaseTimer.textContent = timer;
}

function hideChaseHud() {
  chaseHud.classList.remove('visible', 'result');
}

async function startChase() {
  if (!ready || chaseMode || !Object.keys(chaseModelUrls).length) return;
  chaseMode = true;
  chasePhase = 'countdown';
  chaseClock = 5;
  playBtn.disabled = true;
  chaseBtn.disabled = true;
  input.lock();
  showChaseHud('CHASE STARTS IN 5', 'Get ready');
}
chaseBtn.onclick = () => void startChase();

async function loadChaser() {
  const markUrl = chaseModelUrls[Object.keys(chaseModelUrls)[0]];
  try {
    const gltf = await markLoader.loadAsync(markUrl);
    if (!chaseMode || chasePhase !== 'loading') return;
    const loadedMark = gltf.scene;
    loadedMark.scale.setScalar(5);
    mark = loadedMark;
    markPlayer.collider = level.collider;
    markPlayer.killY = level.killY;
    markPlayer.walkSpeed = playerSpeed * 0.4;
    markPlayer.runSpeed = markPlayer.walkSpeed;
    markPlayer.teleport(markSpawn);
    scene.add(loadedMark);
    markMixer = new THREE.AnimationMixer(loadedMark);
    if (gltf.animations.length) markMixer.clipAction(gltf.animations[0]).play();
    chasePhase = 'running';
    chaseClock = 60;
  } catch (error) {
    chaseMode = false;
    chasePhase = null;
    playBtn.disabled = false;
    chaseBtn.disabled = false;
    input.locked = false;
    showChaseHud('CHASE UNAVAILABLE', 'Please try again');
    msg.textContent = `Could not load chase character: ${String(error)}`;
  }
}

function finishChase(message: string) {
  chasePhase = 'ended';
  resetClock = 5;
  chaseResult.classList.add('visible');
  chaseResultMessage.textContent = message.replace(' • Resetting in 5…', '');
  chaseHud.classList.add('visible', 'result');
  chaseMessage.textContent = '';
  chaseTimer.textContent = `RESETTING IN ${resetClock}`;
}

function placePlayer() {
  player.collider = level.collider;
  player.killY = level.killY;
  player.teleport(level.spawn);
  input.yaw = level.spawnYaw;
  input.pitch = 0;
  camera.far = Math.max(500, level.size * 2);
  camera.updateProjectionMatrix();
}

async function enterWorld(label: string) {
  const id = ++loadId;
  ready = false; playBtn.disabled = true; msg.textContent = 'Loading…';
  try {
    if (!(await level.load(worlds.get(label) ?? null)) || id !== loadId) return; // superseded by a newer request
    current = label;
    scaleEl.value = '0'; $('scaleVal').textContent = '1.00×';
    placePlayer();
    msg.textContent = level.notice;
  } catch (e) {
    if (id !== loadId) return;
    msg.textContent = `Could not load "${label}": ${String(e)}`;
    if (!level.collider) { await level.load(null); current = TEST_ROOM; placePlayer(); } // nothing loaded yet: fall back
  }
  sel.value = current;
  ready = true; playBtn.disabled = false; chaseBtn.disabled = false;
}

sel.onchange = () => { void enterWorld(sel.value); };
scaleEl.oninput = () => { $('scaleVal').textContent = `${(10 ** scaleEl.valueAsNumber).toFixed(2)}×`; };
scaleEl.onchange = () => { // rebuilds collision, so only on release
  level.setScale(10 ** scaleEl.valueAsNumber);
  placePlayer();
  msg.textContent = level.notice;
};
$('go').onclick = () => {
  const n = (id: string) => { const v = $<HTMLInputElement>(id).valueAsNumber; return Number.isFinite(v) ? v : 0; };
  player.teleport(new THREE.Vector3(n('tx'), n('ty'), n('tz')));
  msg.textContent = 'Teleported. Press Play.';
};

window.addEventListener('keydown', (e) => {
  if (!input.locked || !ready) return;
  const keys = [...worlds.keys()], i = keys.indexOf(current);
  if (e.code === 'KeyR') placePlayer();
  else if (e.code === 'BracketRight') void enterWorld(keys[(i + 1) % keys.length]);
  else if (e.code === 'BracketLeft') void enterWorld(keys[(i + keys.length - 1) % keys.length]);
});

void enterWorld(sel.options[0].value);

// FUTURE: guide arrow, puzzle checks, curtain animation etc. register here and run every frame.
const systems: Array<(dt: number) => void> = [];

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const hud = $('hud');
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (ready && input.locked) {
    player.update(dt, input.read()); // paused while the menu is open
    if (chaseMode && chasePhase) {
      markMixer?.update(dt);
      if (chasePhase === 'countdown') {
        chaseClock -= dt;
        showChaseHud(`CHASE STARTS IN ${Math.max(1, Math.ceil(chaseClock))}`);
        if (chaseClock <= 0) { chasePhase = 'watching'; chaseClock = 1; }
      } else if (chasePhase === 'watching') {
        chaseClock -= dt;
        updateViewDirection(markSpawn);
        showChaseHud('', `${Math.max(0, chaseClock).toFixed(1)}s`);
        if (chaseClock <= 0) {
          chasePhase = 'loading';
          showChaseHud('GET READY', 'Starting…');
          void loadChaser();
        }
      } else if (chasePhase === 'loading') {
        showChaseHud('GET READY', 'Starting…');
      } else if (chasePhase === 'running' && mark) {
        const toPlayer = player.pos.clone().sub(markPlayer.pos);
        toPlayer.y = 0;
        const distance = toPlayer.length();
        if (distance > 0.001) {
          toPlayer.normalize();
          markPlayer.update(dt, { moveX: toPlayer.x, moveZ: -toPlayer.z, jump: false, run: false, use: false, yaw: 0 });
          mark.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        }
        mark.position.copy(markPlayer.pos);
        chaseClock -= dt;
        showChaseHud('ANIKET IS CHASING YOU, RUN', `SURVIVE: ${Math.max(0, chaseClock).toFixed(1)}s`);
        if (markPlayer.pos.distanceTo(player.pos) < markPlayer.radius + player.radius) finishChase('GAME OVER • Resetting in 5…');
        else if (chaseClock <= 0) finishChase('YOU WIN • Resetting in 5…');
      } else if (chasePhase === 'ended') {
        resetClock -= dt;
        chaseTimer.textContent = `RESETTING IN ${Math.max(0, Math.ceil(resetClock))}`;
        if (resetClock <= 0) window.location.reload();
      }
    }
  }
  for (const s of systems) s(dt);
  camera.position.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
  camera.rotation.set(input.pitch, input.yaw, 0, 'YXZ');
  const p = player.pos;
  hud.textContent = ready
    ? `${current}\nfeet  x ${p.x.toFixed(2)}  y ${p.y.toFixed(2)}  z ${p.z.toFixed(2)}\n${player.onGround ? 'on ground' : 'in air'}`
    : 'Loading…';
  renderer.render(scene, camera);
});
