import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshBVH } from 'three-mesh-bvh';

type V3 = [number, number, number];

export function makeBox(pos: V3, size: V3, color = 0x8a8f98): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color }));
  m.position.set(...pos);
  return m;
}

/** Built-in test room: x -5..5, z -6..6, height 3, floor top at y = 0. */
function buildTestRoom(): THREE.Group {
  const g = new THREE.Group();
  const W = 10, D = 12, H = 3, T = 0.2;
  g.add(
    makeBox([0, -0.5, 0], [W + 2 * T, 1, D + 2 * T], 0x4b505a),          // floor
    makeBox([0, H + T / 2, 0], [W + 2 * T, T, D + 2 * T], 0x6b707a),     // ceiling
    makeBox([0, H / 2, -D / 2 - T / 2], [W + 2 * T, H, T], 0x8a8f98),    // walls
    makeBox([0, H / 2, D / 2 + T / 2], [W + 2 * T, H, T], 0x8a8f98),
    makeBox([-W / 2 - T / 2, H / 2, 0], [T, H, D], 0x7d828c),
    makeBox([W / 2 + T / 2, H / 2, 0], [T, H, D], 0x7d828c),
    makeBox([0, 1.5, 0], [0.6, 3, 0.6], 0xb0b4bc),                       // pillar
    makeBox([2, 0.5, -2], [1, 1, 1], 0x9b6b3d),                          // crate
    makeBox([-2.5, 0.4, -3.5], [2.5, 0.8, 2], 0x4a7bd0),                 // jumpable platform
  );
  for (let i = 0; i < 3; i++) g.add(makeBox([4.1, 0.2 * (i + 1), 3 - 1.2 * i], [1.8, 0.4 * (i + 1), 1.2], 0xd0a14a)); // stairs
  const grid = new THREE.GridHelper(12, 12, 0xffffff, 0x888888);
  grid.position.y = 0.005;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.25;
  g.add(grid);
  const spawn = new THREE.Object3D();
  spawn.name = 'SPAWN_POINT';
  spawn.position.set(0, 0, 4);
  g.add(spawn);
  return g;
}

function disposeObject(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}

/** Merge meshes (in world space) into one triangle soup and build a BVH over it. */
export function buildCollider(meshes: THREE.Mesh[]): { bvh: MeshBVH; box: THREE.Box3; tris: number } | null {
  const usable = meshes.filter((m) => m.geometry?.attributes?.position);
  const count = (m: THREE.Mesh) => Math.floor((m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3) * 3;
  const total = usable.reduce((n, m) => n + count(m), 0);
  if (!total) return null;
  const out = new Float32Array(total * 3);
  const v = new THREE.Vector3();
  let o = 0;
  for (const m of usable) {
    const pos = m.geometry.attributes.position, idx = m.geometry.index, n = count(m);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
      out[o++] = v.x; out[o++] = v.y; out[o++] = v.z;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  geo.computeBoundingBox();
  return { bvh: new MeshBVH(geo), box: geo.boundingBox!.clone(), tris: total / 3 };
}

/**
 * The current world. Any GLB works:
 *  - By default every visible mesh becomes solid (collision = its real triangles).
 *  - Optional: meshes/objects named COL_* are used INSTEAD, as simplified invisible collision.
 *  - Optional: an object named SPAWN_POINT sets the start position and direction.
 */
export class Level {
  readonly root = new THREE.Group();
  collider: MeshBVH | null = null;
  readonly spawn = new THREE.Vector3();
  spawnYaw = 0;
  notice = '';
  killY = -100;
  size = 100; // rough world diagonal, used for the camera far plane
  private readonly world = new THREE.Group(); // scaled as a whole by setScale()
  private token = 0;

  constructor() { this.root.add(this.world); }

  /** Load a GLB url, or the built-in test room for null. Returns false if a newer load superseded this one.
   *  Throws on failure and leaves the current world untouched. */
  async load(url: string | null): Promise<boolean> {
    const token = ++this.token;
    const content = url ? (await new GLTFLoader().loadAsync(url)).scene : buildTestRoom();
    if (token !== this.token) { disposeObject(content); return false; }
    this.setWorld(content);
    return true;
  }

  setWorld(content: THREE.Object3D) {
    while (this.world.children.length) { const c = this.world.children[0]; this.world.remove(c); disposeObject(c); }
    this.world.scale.setScalar(1);
    this.world.add(content);
    this.rebuild();
  }

  /** Uniform scale around the world origin (for models not authored in metres). */
  setScale(s: number) { this.world.scale.setScalar(s); this.rebuild(); }

  /** Call again after adding/removing meshes in the world (curtains, doors...). */
  rebuild() {
    this.notice = '';
    this.world.updateMatrixWorld(true);
    const cols = new Set<THREE.Mesh>();
    let spawnNode: THREE.Object3D | null = null;
    this.world.traverse((o) => {
      if (o.name === 'SPAWN_POINT') spawnNode = o;
      if (o.name.startsWith('COL_')) {
        o.traverse((c) => { if ((c as THREE.Mesh).isMesh) cols.add(c as THREE.Mesh); });
        o.visible = false;
      }
    });
    let meshes = [...cols];
    const auto = !meshes.length;
    if (auto) this.world.traverseVisible((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.noCollide) meshes.push(o as THREE.Mesh); });

    const built = buildCollider(meshes);
    this.collider = built?.bvh ?? null;
    if (!built) { this.notice = 'No solid geometry found in this model.'; this.spawn.set(0, 1, 0); this.spawnYaw = 0; return; }

    const size = built.box.getSize(new THREE.Vector3());
    this.size = size.length();
    this.killY = built.box.min.y - 30;
    this.notice = `Collision: ${built.tris.toLocaleString()} triangles (${auto ? 'all visible meshes' : 'COL_* meshes'}).`;

    const node = spawnNode as THREE.Object3D | null;
    if (node) {
      node.getWorldPosition(this.spawn);
      this.spawnYaw = new THREE.Euler().setFromQuaternion(node.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
    } else {
      // no SPAWN_POINT: drop onto the floor under the middle of the model
      const c = built.box.getCenter(new THREE.Vector3());
      const down = new THREE.Vector3(0, -1, 0);
      const hit = built.bvh.raycastFirst(new THREE.Ray(new THREE.Vector3(c.x, c.y, c.z), down), THREE.DoubleSide)
               ?? built.bvh.raycastFirst(new THREE.Ray(new THREE.Vector3(c.x, built.box.max.y + 1, c.z), down), THREE.DoubleSide);
      this.spawn.copy(hit ? hit.point : new THREE.Vector3(c.x, built.box.max.y + 1, c.z));
      this.spawn.y += 0.02;
      this.spawnYaw = 0;
      this.notice += ' No SPAWN_POINT: starting at the middle of the model (use Teleport in the menu to move).';
    }
  }
}
