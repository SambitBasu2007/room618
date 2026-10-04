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

  // --- New: Joystick state ---
  private joystick = {
    active: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    radius: 50, // pixel radius of the touch area
  };

  // --- New: Button states ---
  private useButton = false;
  private jumpButton = false;
  private joystickPointer: number | null = null;
  private lookPointer: number | null = null;
  private lastLookX = 0;
  private lastLookY = 0;
  private readonly joystickEl = document.getElementById('joystick');
  private readonly joystickKnob = document.getElementById('joystick-knob');
  private readonly jumpEl = document.getElementById('jumpBtn');
  private readonly useEl = document.getElementById('useBtn');

  constructor(private dom: HTMLElement) {
    // Keyboard events
    window.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // Mouse look
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !document.pointerLockElement) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch = Math.max(-LIMIT, Math.min(LIMIT, this.pitch - e.movementY * this.sensitivity));
    });

    // Pointer lock change
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      this.keys.clear();
      this.onLockChange?.(this.locked);
    });

    this.joystickEl?.addEventListener('pointerdown', this.handleJoystickDown);
    this.joystickEl?.addEventListener('pointermove', this.handleJoystickMove);
    this.joystickEl?.addEventListener('pointerup', this.handleJoystickEnd);
    this.joystickEl?.addEventListener('pointercancel', this.handleJoystickEnd);
    this.dom.addEventListener('pointerdown', this.handleLookDown);
    this.dom.addEventListener('pointermove', this.handleLookMove);
    this.dom.addEventListener('pointerup', this.handleLookEnd);
    this.dom.addEventListener('pointercancel', this.handleLookEnd);
    this.jumpEl?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.jumpButton = true;
    });
    this.jumpEl?.addEventListener('pointerup', () => { this.jumpButton = false; });
    this.jumpEl?.addEventListener('pointercancel', () => { this.jumpButton = false; });
    this.jumpEl?.addEventListener('pointerleave', () => { this.jumpButton = false; });
    this.useEl?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.useButton = true;
    });
    this.useEl?.addEventListener('pointerup', () => { this.useButton = false; });
    this.useEl?.addEventListener('pointercancel', () => { this.useButton = false; });
    this.useEl?.addEventListener('pointerleave', () => { this.useButton = false; });
  }

  lock() {
    this.locked = true;
    this.onLockChange?.(true);
  }

  startMobile() {
    this.locked = true;
    this.onLockChange?.(true);
  }

  private handleLookDown = (e: PointerEvent) => {
    if (!this.locked || e.pointerId === this.joystickPointer) return;
    this.lookPointer = e.pointerId;
    this.lastLookX = e.clientX;
    this.lastLookY = e.clientY;
    this.dom.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  private handleLookMove = (e: PointerEvent) => {
    if (e.pointerId !== this.lookPointer) return;
    this.yaw -= (e.clientX - this.lastLookX) * this.sensitivity * 3.5;
    this.pitch = Math.max(-LIMIT, Math.min(LIMIT, this.pitch - (e.clientY - this.lastLookY) * this.sensitivity * 3.5));
    this.lastLookX = e.clientX;
    this.lastLookY = e.clientY;
    e.preventDefault();
  };

  private handleLookEnd = (e: PointerEvent) => {
    if (e.pointerId === this.lookPointer) this.lookPointer = null;
  };

  private handleJoystickDown = (e: PointerEvent) => {
    this.joystickPointer = e.pointerId;
    this.joystickEl?.setPointerCapture(e.pointerId);
    this.joystick.active = true;
    this.updateJoystick(e);
    e.stopPropagation();
    e.preventDefault();
  };

  private handleJoystickMove = (e: PointerEvent) => {
    if (e.pointerId !== this.joystickPointer) return;
    this.updateJoystick(e);
    e.stopPropagation();
    e.preventDefault();
  };

  private updateJoystick(e: PointerEvent) {
    const rect = this.joystickEl?.getBoundingClientRect();
    if (!rect) return;
    const max = rect.width / 2 - 27;
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy);
    const scale = distance > max ? max / distance : 1;
    this.joystick.startX = 0;
    this.joystick.startY = 0;
    this.joystick.currentX = dx * scale;
    this.joystick.currentY = dy * scale;
    if (this.joystickKnob) this.joystickKnob.style.transform =
      `translate(${this.joystick.currentX}px, ${this.joystick.currentY}px)`;
  }

  private handleJoystickEnd = (e: PointerEvent) => {
    if (e.pointerId !== this.joystickPointer) return;
    this.joystickPointer = null;
    this.joystick.active = false;
    this.joystick.currentX = 0;
    this.joystick.currentY = 0;
    if (this.joystickKnob) this.joystickKnob.style.transform = 'translate(0, 0)';
  };

  // --- Button touch/ mouse handling ---
  private handleMouseDown = (e: MouseEvent) => {
    if (this.locked) return;
    const rect = this.dom.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Use button: top-right corner
    const useBtnWidth = 60;
    const useBtnHeight = 60;
    if (x >= rect.width - useBtnWidth && y >= 0 && y <= useBtnHeight) {
      this.useButton = true;
      e.preventDefault();
    }
    // Jump button: top-right corner, below use button
    const jumpBtnWidth = 60;
    const jumpBtnHeight = 60;
    if (x >= rect.width - jumpBtnWidth && y >= useBtnHeight && y <= useBtnHeight * 2) {
      this.jumpButton = true;
      e.preventDefault();
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (this.locked) return;
    const rect = this.dom.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Release use button
    const useBtnWidth = 60;
    if (x >= rect.width - useBtnWidth && y >= 0 && y <= useBtnWidth) {
      this.useButton = false;
    }
    // Release jump button
    const jumpBtnWidth = 60;
    if (x >= rect.width - jumpBtnWidth && y >= useBtnWidth && y <= useBtnWidth * 2) {
      this.jumpButton = false;
    }
  };

  read(): MoveInput {
    const k = (c: string) => this.keys.has(c);

    // Determine joystick movement values
    // Joystick: current position relative to start
    const dx = this.joystick.currentX;
    const dy = this.joystick.currentY;

    // Normalize: map pixel delta to -1..1
    // We consider the joystick "pushed" if drag is more than 10px
    const deadzone = 10;
    let moveX = 0;
    let moveZ = 0;

    if (Math.abs(dx) > deadzone) {
      moveX = Math.max(-1, Math.min(1, dx / 24)); // right = positive x, left = negative x
    }

    if (Math.abs(dy) > deadzone) {
      moveZ = Math.max(-1, Math.min(1, -dy / 24)); // push up (negative dy) = forward
      // In the player code: moveZ: +1 = forward (KeyW/ArrowUp)
      // Pushing joystick forward (toward top of screen) = negative dy = +1 moveZ ✓
    }

    // Build moveX: keyboard OR joystick
    const kMoveXRight = k('KeyD') || k('ArrowRight');
    const kMoveXLeft = k('KeyA') || k('ArrowLeft');
    const keyboardMoveX = (kMoveXRight ? 1 : 0) - (kMoveXLeft ? 1 : 0);

    const kMoveZForward = k('KeyW') || k('ArrowUp');
    const kMoveZBack = k('KeyS') || k('ArrowDown');
    const keyboardMoveZ = (kMoveZForward ? 1 : 0) - (kMoveZBack ? 1 : 0);

    // Prefer keyboard input if any movement key is pressed;
    // otherwise fall back to joystick
    const finalMoveX = keyboardMoveX !== 0 ? keyboardMoveX : moveX;
    const finalMoveZ = keyboardMoveZ !== 0 ? keyboardMoveZ : moveZ;

    return {
      moveX: finalMoveX,
      moveZ: finalMoveZ,
      jump: k('Space') || this.jumpButton,
      use: k('E') || this.useButton,  // NEW: 'E' key or use button
      run: k('ShiftLeft') || k('ShiftRight'),
      yaw: this.yaw,
    };
  }
}