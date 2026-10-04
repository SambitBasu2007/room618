https://sambitbasu2007.github.io/room618/




# Room Walker

A WebGL-based 3D room explorer built with Three.js, allowing users to navigate and inspect different 3D environments.

## Overview

Room Walker lets you load and navigate 3D worlds (.glb files) with first-person controls. The application includes a built-in test room and supports loading custom GLB models from the `assets` directory.

## Controls

### Desktop (Keyboard & Mouse)
| Control | Action |
|---------|--------|
| **WASD / Arrow keys** | Move forward/backward/left/right |
| **Mouse movement** | Look around (after pointer lock) |
| **Space** | Jump |
| **Shift** | Run (increases speed) |
| **R** | Respawn at current spawn point |
| **[ / ]** | Switch to previous/next world |
| **Esc** | Pause/unpause (opens menu) |
| **Number inputs** | Teleport to specific coordinates |

### Mobile (Touch)
| Control | Action | Location |
|---------|--------|----------|
| **Joystick drag** | Move forward/backward/left/right | Bottom-left corner |
| **Use button** | Interact with world objects | Top-right, above jump |
| **Jump button** | Jump | Top-right, below use |
| **Fullscreen** | Toggle browser fullscreen | Top-right (⛶/⟳ icon) |

### UI

The on-screen menu (accessible by pressing Esc or clicking "Play") provides:

- **World selection** - Dropdown to choose between loaded worlds
- **World scale** - Slider to scale the loaded model (range -2 to 2, where 0 = 1.00×)
- **Teleport** - Input fields for X, Y, Z coordinates with a "Go" button
- **Status message** - Shows loading status, collision info, and notifications
- **Hint text** - Permanent hints at the bottom (WASD/arrows move, mouse look, etc.)

## Mobile Controls

### Joystick (Bottom-Left)
- Drag the inner square in any direction to move
- Push up = move forward, down = backward
- Push left = strafe left, right = strafe right
- 10px deadzone prevents jitter when idle
- Works alongside keyboard (keyboard takes priority)

### Buttons (Right Side)
- **Use** (top): Press to interact with objects (equivalent to "E" key). Currently placeholder for future interaction logic.
- **Jump**: Press to jump. Also works with Space key.
- **Fullscreen** (top-right toggle): 
  - Press once → enters browser fullscreen
  - Press again → exits fullscreen
  - Icon changes from `⛶` to `⟳` when active

## Technical Details

### Architecture

The project is structured as a modular TypeScript/Vite application:

- **`src/main.ts`** - Entry point: sets up Three.js renderer, scene, camera, lights, and the main game loop. Handles world loading, UI interactions, and input event wiring. Includes fullscreen toggle logic.
- **`src/level.ts`** - Manages world loading, collision geometry generation, and spawn point detection. Supports both automatic collision from all visible meshes and simplified collision from meshes named `COL_*`.
- **`src/player.ts`** - Pure movement and collision logic using a capsule vs. BVH triangle collision detection. Handles walking, jumping, running, gravity, and respawning. Exports the `MoveInput` interface (now includes `use` field).
- **`src/input.ts`** - First-person input management: keyboard, mouse look, pointer lock, joystick tracking, and button states (use, jump). Generates `MoveInput` each frame.
- **`index.html`** - UI container with world dropdown, scale slider, teleport inputs, HUD, crosshair, menu system, and mobile control overlay.

### Key Features

- **BVH collision detection** using `three-mesh-bvh` for efficient triangle intersection tests
- **Dual collision mode**: automatic (all visible meshes) or simplified (meshes named `COL_*`)
- **Spawn point support**: objects named `SPAWN_POINT` define starting position and yaw
- **World scaling** uniform scaling around the origin
- **Teleportation** via coordinate inputs
- **Automatic fallback** to the built-in test room if a GLB fails to load
- **Camera far plane** adjusts based on world size
- **Fullscreen API** toggle button

### Built-in Test Room

The application always includes a built-in test room with:

- Floor (10×12 units) and ceiling (3 units high)
- Four walls and a grid floor
- A central pillar and a crate
- A jumpable platform
- Stairs
- A `SPAWN_POINT` at (0, 0, 4)

### Adding New Worlds

Place `.glb` files in the `assets/` directory. They will automatically appear in the world selection dropdown. The application supports:

- Any valid GLB/binary or ASCII glTF model
- Optional `COL_*` named meshes for simplified collision geometry
- Optional `SPAWN_POINT` object for custom spawn positions

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Dependencies

- **three** ^0.170.0 - 3D library
- **three-mesh-bvh** ^0.9.15 - BVH collision tree
- **@types/three** ^0.170.0 - TypeScript types
- **typescript** ^5.6.0 - Language tools
- **vite** ^5.4.0 - Build dev server
