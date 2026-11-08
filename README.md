# CORE / BREAK 🕹️

> A high-performance retro-arcade brick breaker featuring the viral **Stage 12 Omega Core** with 3,379 bricks, procedural ribbon trails, synth Web Audio, and multi-ball mayhem.

🎮 **[Play Live on GitHub Pages](https://alexmmog.github.io/core-break/)**

---

## 📸 Overview & Mechanics

Recreated with exact arcade aesthetics from the viral game screenshot:

- **Stage 12: Omega Core (3,379 Bricks)**: Massive concentric dome structure protected by a high-density brick layer and a narrow bottom entrance with a defensive gate barrier.
- **Ribbon Motion Trail (优美的曲线)**: Multi-segment catmull-rom smoothed trail with glowing neon alpha fade.
- **Procedural Web Audio API**: No external sound assets required. Synthesizes retro square/triangle sound waves, pentatonic combo pitch scaling, deep sub-bass drop on initial barrier breach, and stage clear fanfare.
- **Spatial Partitioning Collision Grid**: Ultra-optimized collision detection running locked at 60/120 FPS with 4x sub-stepping physics.
- **Power-Ups & Multi-ball**: Drop rates for Multi-ball (+3 balls), Fireball, Laser Paddle, and Speed Surge.
- **Multi-Stage Select**:
  - **Stage 12: Omega Core** (3,379 Bricks)
  - **Stage 6: Dual Core** (1,600 Bricks)
  - **Stage 1: Proto Core** (420 Bricks)

---

## 🎮 Controls

- **Desktop**:
  - `Mouse` or `←` / `→` arrow keys: Move paddle
  - `Space` or `Left Click`: Launch ball
  - Top buttons: Toggle sound, restart, or switch stages
- **Mobile / Touch**:
  - `Drag`: Smooth responsive 1:1 finger tracking for paddle
  - `Tap`: Launch ball

---

## 🛠️ Tech Stack

- Zero dependencies (Vanilla HTML5 Canvas + Web Audio API + CSS3)
- Pure client-side static application, ready for GitHub Pages or any static host.
