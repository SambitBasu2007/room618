import type { MoveInput } from './player';

const LIMIT = Math.PI / 2 - 0.01;

/** Keyboard + mouse-look (pointer lock). Holds yaw/pitch; the camera is driven from these. */
export class FirstPersonInput {
  yaw = 0;
  pitch = 0;
  locked = false;
  sensitivity = 0.0022;
  onLockChange: ((locked: boolean) => void) | null = null;
  private keys = new Set<string>();

  constructor(private dom: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch = Math.max(-LIMIT, Math.min(LIMIT, this.pitch - e.movementY * this.sensitivity));
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      this.keys.clear();
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    const r: unknown = this.dom.requestPointerLock();
    if (r instanceof Promise) r.catch(() => { /* browsers refuse re-locking right after Esc; click again */ });
  }

  read(): MoveInput {
    const k = (c: string) => this.keys.has(c);
    return {
      moveX: (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0),
      moveZ: (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0),
      jump: k('Space'),
      run: k('ShiftLeft') || k('ShiftRight'),
      yaw: this.yaw,
    };
  }
}
