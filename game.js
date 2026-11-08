// CORE / BREAK - Game Engine
// High Performance Canvas 2D Breakout with Dense Brick Physics & Particle FX

(function() {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // Internal logical resolution (matches ~9:16 mobile aspect ratio from screenshot)
  const V_WIDTH = 460;
  const V_HEIGHT = 860;

  // Scale and viewport handling
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const container = document.getElementById('gameContainer');
    const rect = container.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    // Calculate scale to fit logical dimensions
    const scaleX = rect.width / V_WIDTH;
    const scaleY = rect.height / V_HEIGHT;
    scale = Math.min(scaleX, scaleY);
    offsetX = (rect.width - V_WIDTH * scale) / 2;
    offsetY = (rect.height - V_HEIGHT * scale) / 2;

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
  }

  window.addEventListener('resize', resizeCanvas);

  // Game Arena Constants
  const CORE_CX = 230;
  const CORE_CY = 310;
  const CORE_R = 178;
  const GATE_WIDTH = 48; // Opening at the bottom
  const GATE_HALF_ANGLE = Math.asin((GATE_WIDTH / 2) / CORE_R); // rad

  // UI DOM Elements
  const clearedEl = document.getElementById('clearedCount');
  const totalEl = document.getElementById('totalCount');
  const ballsEl = document.getElementById('ballsCount');
  const stageEl = document.getElementById('stageTitle');
  const comboEl = document.getElementById('comboDisplay');
  const muteBtn = document.getElementById('muteBtn');
  const stageSelect = document.getElementById('stageSelect');
  const restartBtn = document.getElementById('restartBtn');

  // Game State
  const state = {
    currentStage: 12,
    score: 0,
    clearedCount: 0,
    totalBricks: 3379,
    firstBreakAchieved: false,
    lives: 3,
    activeBalls: [],
    paddle: {
      x: CORE_CX,
      y: 775,
      w: 72,
      targetW: 72,
      h: 13,
      vx: 0,
      prevX: CORE_CX
    },
    bricks: [],
    gridCols: 0,
    gridRows: 0,
    gridStartX: 0,
    gridStartY: 0,
    brickW: 5.4,
    brickH: 5.4,
    barriers: [], // defensive steel blocks
    barrierBox: null, // unified indestructible bounding box
    powerups: [],
    activeEffects: {
      fireball: 0,
      shield: 0,
      widePaddle: 0,
      laserAim: 0
    },
    particles: [],
    floatingTexts: [],
    screenShake: 0,
    combo: 0,
    comboTimer: 0,
    gameState: 'aiming', // 'aiming', 'playing', 'gameover', 'cleared'
    launched: false
  };

  // Paddle Setup
  function resetPaddle() {
    state.paddle.x = CORE_CX;
    state.paddle.prevX = CORE_CX;
    state.paddle.vx = 0;
    state.paddle.w = 72;
    state.paddle.targetW = 72;
  }

  // Ball Setup
  function createBall(x, y, vx, vy, isFireball = false) {
    return {
      x: x,
      y: y,
      vx: vx,
      vy: vy,
      r: 4.2,
      speed: 460,
      insideCore: false,
      isFireball: isFireball,
      trail: [] // Stores previous {x, y} for curve trail
    };
  }

  function launchBall() {
    if (state.gameState === 'aiming') {
      window.soundEngine.init();
      window.soundEngine.resume();
      state.gameState = 'playing';
      state.launched = true;

      // Launch angled slightly toward the core gate
      const launchAngle = -Math.PI / 2 + (Math.random() - 0.5) * 0.45;
      const speed = 460;
      state.activeBalls = [
        createBall(state.paddle.x, state.paddle.y - 12, Math.cos(launchAngle) * speed, Math.sin(launchAngle) * speed)
      ];
      updateHUD();
    }
  }

  // STAGE GENERATION
  function generateStage(stageNum) {
    state.currentStage = stageNum;
    state.firstBreakAchieved = false;
    state.combo = 0;
    state.clearedCount = 0;
    state.activeEffects = { fireball: 0, shield: 0, widePaddle: 0, laserAim: 0 };
    state.powerups = [];
    state.particles = [];
    state.floatingTexts = [];
    state.screenShake = 0;

    resetPaddle();
    state.gameState = 'aiming';
    state.launched = false;
    state.activeBalls = [createBall(state.paddle.x, state.paddle.y - 12, 0, 0)];

    const bricks = [];
    const barriers = [];

    if (stageNum === 12) {
      // STAGE 12: "CORE / BREAK" - Exact replica of the screenshot!
      // 3,379 bricks filling the upper ~80% of the circle dome
      const bw = 5.2;
      const bh = 5.2;
      state.brickW = bw;
      state.brickH = bh;

      const cols = 64;
      const rows = 56;
      state.gridCols = cols;
      state.gridRows = rows;
      const startX = CORE_CX - (cols * bw) / 2;
      const startY = CORE_CY - CORE_R + 18;
      state.gridStartX = startX;
      state.gridStartY = startY;

      // Build 2D grid
      let count = 0;
      for (let r = 0; r < rows; r++) {
        const rowArr = [];
        for (let c = 0; c < cols; c++) {
          const bx = startX + c * bw;
          const by = startY + r * bh;
          const bcx = bx + bw / 2;
          const bcy = by + bh / 2;
          const dist = Math.hypot(bcx - CORE_CX, bcy - CORE_CY);

          // Fill circle upper dome: dist <= CORE_R - 8, and cut off bottom ~30%
          const isInsideCircle = dist <= CORE_R - 7;
          const isAboveBottomCut = by <= CORE_CY + CORE_R * 0.52;

          if (isInsideCircle && isAboveBottomCut) {
            rowArr.push({
              x: bx,
              y: by,
              w: bw,
              h: bh,
              active: true,
              hp: 1,
              type: 'normal',
              color: '#f09a82' // Screenshot peach/coral color
            });
            count++;
          } else {
            rowArr.push(null);
          }
        }
        bricks.push(rowArr);
      }

      state.totalBricks = count;

      // Indestructible horizontal steel barrier below the brick dome (just like in the screenshot!)
      const barrierY = CORE_CY + CORE_R * 0.68;
      const barW = 7.0;
      const barH = 7.0;
      const barCols = 18;
      const barStartX = CORE_CX - (barCols * barW) / 2;
      const barTotalWidth = barCols * barW;

      state.barrierBox = {
        x: barStartX,
        y: barrierY,
        w: barTotalWidth,
        h: barH
      };

      for (let i = 0; i < barCols; i++) {
        barriers.push({
          x: barStartX + i * barW,
          y: barrierY,
          w: barW - 0.8,
          h: barH,
          indestructible: true,
          color: '#64748b'
        });
      }
    } else if (stageNum === 1) {
      // STAGE 1: Starter Core (~420 bricks)
      const bw = 8.5;
      const bh = 8.5;
      state.brickW = bw;
      state.brickH = bh;
      const cols = 36;
      const rows = 30;
      state.gridCols = cols;
      state.gridRows = rows;
      const startX = CORE_CX - (cols * bw) / 2;
      const startY = CORE_CY - CORE_R + 25;
      state.gridStartX = startX;
      state.gridStartY = startY;

      let count = 0;
      for (let r = 0; r < rows; r++) {
        const rowArr = [];
        for (let c = 0; c < cols; c++) {
          const bx = startX + c * bw;
          const by = startY + r * bh;
          const dist = Math.hypot(bx + bw / 2 - CORE_CX, by + bh / 2 - CORE_CY);
          if (dist <= CORE_R * 0.75 && by <= CORE_CY + CORE_R * 0.35) {
            rowArr.push({
              x: bx,
              y: by,
              w: bw,
              h: bh,
              active: true,
              hp: 1,
              type: 'normal',
              color: '#38bdf8'
            });
            count++;
          } else {
            rowArr.push(null);
          }
        }
        bricks.push(rowArr);
      }
      state.totalBricks = count;
    } else if (stageNum === 6) {
      // STAGE 6: Double Core / Heart (~1,600 bricks)
      const bw = 6.5;
      const bh = 6.5;
      state.brickW = bw;
      state.brickH = bh;
      const cols = 48;
      const rows = 44;
      state.gridCols = cols;
      state.gridRows = rows;
      const startX = CORE_CX - (cols * bw) / 2;
      const startY = CORE_CY - CORE_R + 20;
      state.gridStartX = startX;
      state.gridStartY = startY;

      let count = 0;
      for (let r = 0; r < rows; r++) {
        const rowArr = [];
        for (let c = 0; c < cols; c++) {
          const bx = startX + c * bw;
          const by = startY + r * bh;
          const dist = Math.hypot(bx + bw / 2 - CORE_CX, by + bh / 2 - CORE_CY);
          if (dist <= CORE_R - 10 && by <= CORE_CY + CORE_R * 0.48) {
            // Checkered or tiered colors
            const col = (r + c) % 2 === 0 ? '#ec4899' : '#f43f5e';
            rowArr.push({
              x: bx,
              y: by,
              w: bw,
              h: bh,
              active: true,
              hp: 1,
              type: 'normal',
              color: col
            });
            count++;
          } else {
            rowArr.push(null);
          }
        }
        bricks.push(rowArr);
      }
      state.totalBricks = count;

      // Indestructible defensive barrier
      const barrierY = CORE_CY + CORE_R * 0.65;
      const barW = 8;
      const barH = 8;
      const barCols = 12;
      const barStartX = CORE_CX - 48;
      const barTotalWidth = barCols * barW;

      state.barrierBox = {
        x: barStartX,
        y: barrierY,
        w: barTotalWidth,
        h: barH
      };

      for (let i = 0; i < barCols; i++) {
        barriers.push({
          x: barStartX + i * barW,
          y: barrierY,
          w: barW - 1,
          h: barH,
          indestructible: true,
          color: '#94a3b8'
        });
      }
    }

    state.bricks = bricks;
    state.barriers = barriers;
    updateHUD();
  }

  function updateHUD() {
    const padZeros = (num, len) => String(num).padStart(len, '0');
    clearedEl.textContent = padZeros(state.clearedCount, 4);
    totalEl.textContent = padZeros(state.totalBricks, 4);
    ballsEl.textContent = padZeros(state.activeBalls.length, 3);
    stageEl.textContent = `CORE / BREAK  -  STAGE ${state.currentStage}`;
  }

  // COLLISION DETECTION & PHYSICS
  function updatePhysics(dt) {
    if (state.gameState !== 'playing') return;

    // Sub-stepping for ultra-reliable tunneling-free physics
    const SUB_STEPS = 4;
    const subDt = dt / SUB_STEPS;

    // Update active powerups timer
    for (let key in state.activeEffects) {
      if (state.activeEffects[key] > 0) {
        state.activeEffects[key] -= dt;
        if (state.activeEffects[key] <= 0) {
          state.activeEffects[key] = 0;
          if (key === 'widePaddle') state.paddle.targetW = 72;
        }
      }
    }

    // Smooth paddle resize
    state.paddle.w += (state.paddle.targetW - state.paddle.w) * 0.15;

    // Paddle velocity calculation
    state.paddle.vx = (state.paddle.x - state.paddle.prevX) / (dt || 0.016);
    state.paddle.prevX = state.paddle.x;

    // Combo timer
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.combo = 0;
        comboEl.classList.remove('active');
      }
    }

    // Screen shake decay
    if (state.screenShake > 0) {
      state.screenShake = Math.max(0, state.screenShake - dt * 25);
    }

    // Update Powerups falling
    for (let i = state.powerups.length - 1; i >= 0; i--) {
      const p = state.powerups[i];
      p.y += p.vy * dt;
      p.rotation += 2 * dt;

      // Check collision with paddle
      const px = state.paddle.x;
      const py = state.paddle.y;
      const pw = state.paddle.w;
      const ph = state.paddle.h;
      if (
        p.x >= px - pw / 2 - 8 &&
        p.x <= px + pw / 2 + 8 &&
        p.y >= py - ph / 2 - 8 &&
        p.y <= py + ph / 2 + 8
      ) {
        applyPowerup(p.type);
        window.soundEngine.playPowerupCollect();
        spawnFloatingText(p.x, p.y, p.label, p.color);
        state.powerups.splice(i, 1);
        continue;
      }

      if (p.y > V_HEIGHT + 20) {
        state.powerups.splice(i, 1);
      }
    }

    // Process Balls
    for (let bIdx = state.activeBalls.length - 1; bIdx >= 0; bIdx--) {
      const ball = state.activeBalls[bIdx];

      for (let step = 0; step < SUB_STEPS; step++) {
        ball.x += ball.vx * subDt;
        ball.y += ball.vy * subDt;

        // Maintain ball speed
        const curSpeed = Math.hypot(ball.vx, ball.vy);
        const targetSpeed = state.activeEffects.fireball > 0 ? 540 : ball.speed;
        if (curSpeed > 0 && Math.abs(curSpeed - targetSpeed) > 10) {
          ball.vx = (ball.vx / curSpeed) * targetSpeed;
          ball.vy = (ball.vy / curSpeed) * targetSpeed;
        }

        // Record trail for "优美的曲线"
        if (step === 0) {
          ball.trail.push({ x: ball.x, y: ball.y });
          if (ball.trail.length > 28) ball.trail.shift();
        }

        // 1. Boundary: Screen Edges (Left, Right, Top)
        if (ball.x - ball.r < 10) {
          ball.x = 10 + ball.r;
          ball.vx = Math.abs(ball.vx);
          window.soundEngine.playWallBounce();
        } else if (ball.x + ball.r > V_WIDTH - 10) {
          ball.x = V_WIDTH - 10 - ball.r;
          ball.vx = -Math.abs(ball.vx);
          window.soundEngine.playWallBounce();
        }
        if (ball.y - ball.r < 40) {
          ball.y = 40 + ball.r;
          ball.vy = Math.abs(ball.vy);
          window.soundEngine.playWallBounce();
        }

        // 2. Circle Perimeter Collision & Gate Passage
        handleCircleCollision(ball);

        // 3. Defensive Steel Barrier Collision
        handleBarrierCollision(ball);

        // 4. Brick Grid Collision
        handleBrickGridCollision(ball);

        // 5. Paddle Collision (when outside core)
        handlePaddleCollision(ball);

        // 6. Shield Energy Floor Collision
        if (state.activeEffects.shield > 0 && ball.y + ball.r >= V_HEIGHT - 30) {
          ball.y = V_HEIGHT - 30 - ball.r;
          ball.vy = -Math.abs(ball.vy);
          window.soundEngine.playPaddleHit(0);
          createSparks(ball.x, ball.y, '#38bdf8', 12);
        }
      }

      // Check Ball Out of Bounds (Bottom)
      if (ball.y - ball.r > V_HEIGHT + 30) {
        state.activeBalls.splice(bIdx, 1);
        updateHUD();
        window.soundEngine.playLoseBall();

        if (state.activeBalls.length === 0) {
          state.lives--;
          if (state.lives <= 0) {
            state.gameState = 'gameover';
          } else {
            // Respawn ball on paddle
            state.gameState = 'aiming';
            state.launched = false;
            resetPaddle();
            state.activeBalls = [createBall(state.paddle.x, state.paddle.y - 12, 0, 0)];
          }
        }
      }
    }

    // Particles update
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt; // gravity
      p.alpha -= dt * 1.5;
      p.rotation += p.vRot * dt;
      if (p.alpha <= 0) state.particles.splice(i, 1);
    }

    // Floating text update
    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
      const t = state.floatingTexts[i];
      t.y -= 40 * dt;
      t.alpha -= dt * 1.2;
      if (t.alpha <= 0) state.floatingTexts.splice(i, 1);
    }

    // Check Stage Clear
    if (state.clearedCount >= state.totalBricks && state.totalBricks > 0) {
      state.gameState = 'cleared';
      window.soundEngine.playStageClear();
    }
  }

  // Circular Hull & Gate Collision
  function handleCircleCollision(ball) {
    const dx = ball.x - CORE_CX;
    const dy = ball.y - CORE_CY;
    const dist = Math.hypot(dx, dy);

    // Angle of ball relative to circle center (-PI to PI)
    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += 2 * Math.PI;

    // Gate opening is at angle = PI/2 (90 degrees, straight down)
    const gateAngle = Math.PI / 2;
    const inGateSector = Math.abs(angle - gateAngle) <= GATE_HALF_ANGLE;

    // Detect transition inside <-> outside
    if (inGateSector) {
      if (!ball.insideCore && dist < CORE_R) {
        ball.insideCore = true;
        window.soundEngine.playGatePass(true);
        createSparks(ball.x, ball.y, '#f97316', 16);
        spawnFloatingText(ball.x, ball.y - 20, 'INTO CORE!', '#38bdf8');
      } else if (ball.insideCore && dist > CORE_R) {
        ball.insideCore = false;
        window.soundEngine.playGatePass(false);
      }
      return; // Free passage through the gate opening!
    }

    // Gatepost Tips Collision (the two vertical orange markers on left/right of gate)
    const leftPostX = CORE_CX - GATE_WIDTH / 2;
    const rightPostX = CORE_CX + GATE_WIDTH / 2;
    const postY = CORE_CY + Math.cos(GATE_HALF_ANGLE) * CORE_R;

    [leftPostX, rightPostX].forEach(px => {
      const pDist = Math.hypot(ball.x - px, ball.y - postY);
      if (pDist < ball.r + 3) {
        const nx = (ball.x - px) / (pDist || 1);
        const ny = (ball.y - postY) / (pDist || 1);
        const dot = ball.vx * nx + ball.vy * ny;
        if (dot < 0) {
          ball.vx -= 2 * dot * nx;
          ball.vy -= 2 * dot * ny;
          window.soundEngine.playWallBounce();
        }
      }
    });

    // Wall collision (Inside or Outside)
    const wallDist = Math.abs(dist - CORE_R);
    if (wallDist < ball.r) {
      // Normal vector points away from center
      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);

      if (ball.insideCore) {
        // Hitting the inside of the circular boundary
        const dot = ball.vx * nx + ball.vy * ny;
        if (dot > 0) {
          ball.vx -= 2 * dot * nx;
          ball.vy -= 2 * dot * ny;
          ball.x = CORE_CX + nx * (CORE_R - ball.r - 0.5);
          ball.y = CORE_CY + ny * (CORE_R - ball.r - 0.5);
          window.soundEngine.playWallBounce();
        }
      } else {
        // Hitting the outside of the circular boundary
        const dot = ball.vx * nx + ball.vy * ny;
        if (dot < 0) {
          ball.vx -= 2 * dot * nx;
          ball.vy -= 2 * dot * ny;
          ball.x = CORE_CX + nx * (CORE_R + ball.r + 0.5);
          ball.y = CORE_CY + ny * (CORE_R + ball.r + 0.5);
          window.soundEngine.playWallBounce();
        }
      }
    }
  }

  // Indestructible Horizontal Steel Barrier Collision
  function handleBarrierCollision(ball) {
    const bar = state.barrierBox;
    if (!bar) return;

    // Check collision with ball (circle vs AABB)
    const closestX = Math.max(bar.x, Math.min(ball.x, bar.x + bar.w));
    const closestY = Math.max(bar.y, Math.min(ball.y, bar.y + bar.h));

    const dx = ball.x - closestX;
    const dy = ball.y - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq < ball.r * ball.r) {
      const dist = Math.sqrt(distSq);
      let nx = 0;
      let ny = 0;

      if (dist === 0) {
        // Ball center inside box: resolve along minimum penetration axis
        const overlapLeft = ball.x - bar.x;
        const overlapRight = (bar.x + bar.w) - ball.x;
        const overlapTop = ball.y - bar.y;
        const overlapBottom = (bar.y + bar.h) - ball.y;
        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

        if (minOverlap === overlapTop) {
          ny = -1;
          ball.y = bar.y - ball.r;
        } else if (minOverlap === overlapBottom) {
          ny = 1;
          ball.y = bar.y + bar.h + ball.r;
        } else if (minOverlap === overlapLeft) {
          nx = -1;
          ball.x = bar.x - ball.r;
        } else {
          nx = 1;
          ball.x = bar.x + bar.w + ball.r;
        }
      } else {
        nx = dx / dist;
        ny = dy / dist;
        // Clamp position outside to prevent tunneling
        ball.x = closestX + nx * ball.r;
        ball.y = closestY + ny * ball.r;
      }

      // Reflect ball velocity vector: v' = v - 2 * (v . n) * n
      const dot = ball.vx * nx + ball.vy * ny;
      if (dot < 0) {
        ball.vx -= 2 * dot * nx;
        ball.vy -= 2 * dot * ny;
      }

      // Micro-spin: prevent pure static vertical loop
      if (Math.abs(ball.vx) < 15) {
        ball.vx += (Math.random() - 0.5) * 35;
      }

      // INDESTRUCTIBLE: Never damage or destroy!
      window.soundEngine.playSteelHit();
      createSparks(ball.x, ball.y, '#94a3b8', 8);
      state.screenShake = 2;
    }
  }

  // Brick Grid Collision (O(1) Spatial Grid)
  function handleBrickGridCollision(ball) {
    const bw = state.brickW;
    const bh = state.brickH;
    const startX = state.gridStartX;
    const startY = state.gridStartY;

    // Find grid bounding cells around ball
    const minCol = Math.max(0, Math.floor((ball.x - ball.r - startX) / bw));
    const maxCol = Math.min(state.gridCols - 1, Math.floor((ball.x + ball.r - startX) / bw));
    const minRow = Math.max(0, Math.floor((ball.y - ball.r - startY) / bh));
    const maxRow = Math.min(state.gridRows - 1, Math.floor((ball.y + ball.r - startY) / bh));

    let hitAny = false;

    for (let r = minRow; r <= maxRow; r++) {
      if (!state.bricks[r]) continue;
      for (let c = minCol; c <= maxCol; c++) {
        const brick = state.bricks[r][c];
        if (!brick || !brick.active) continue;

        // Brick bounds
        const bx = brick.x;
        const by = brick.y;
        const bwActual = brick.w;
        const bhActual = brick.h;

        // Circle-Box Intersection
        const closestX = Math.max(bx, Math.min(ball.x, bx + bwActual));
        const closestY = Math.max(by, Math.min(ball.y, by + bhActual));
        const distX = ball.x - closestX;
        const distY = ball.y - closestY;
        const distSq = distX * distX + distY * distY;

        if (distSq < ball.r * ball.r) {
          // HIT!
          brick.active = false;
          state.clearedCount++;
          state.score += 10 + state.combo;
          hitAny = true;

          // SPECIAL: "绝望，直到第一个消失" (Despair until the first one disappears)
          if (!state.firstBreakAchieved) {
            state.firstBreakAchieved = true;
            window.soundEngine.playFirstBreak();
            state.screenShake = 16;
            spawnFloatingText(CORE_CX, CORE_CY + 40, 'CORE BREACH! 突破核心!', '#ffedd5');
            createCoreShockwave(closestX, closestY);
          } else {
            // Consecutive hits
            state.combo++;
            state.comboTimer = 0.8;
            window.soundEngine.playBrickHit(state.combo);

            if (state.combo % 10 === 0) {
              spawnFloatingText(ball.x, ball.y - 14, `x${state.combo} COMBO!`, '#fbbf24');
              state.screenShake = Math.min(8, state.combo * 0.3);
            }
          }

          // Particles
          createBrickDebris(bx + bwActual / 2, by + bhActual / 2, brick.color);

          // Powerup drop chance (~3.5%)
          if (Math.random() < 0.035) {
            spawnPowerup(bx + bwActual / 2, by + bhActual / 2);
          }

          // Collision reflection (unless fireball active)
          if (state.activeEffects.fireball <= 0) {
            // Determine collision normal
            const overlapX = ball.r - Math.abs(distX);
            const overlapY = ball.r - Math.abs(distY);
            if (overlapX < overlapY) {
              ball.vx = -ball.vx;
            } else {
              ball.vy = -ball.vy;
            }
          }

          updateHUD();
          break; // Process one brick reflection per sub-step
        }
      }
      if (hitAny && state.activeEffects.fireball <= 0) break;
    }
  }

  // Paddle Collision
  function handlePaddleCollision(ball) {
    const p = state.paddle;
    const px = p.x;
    const py = p.y;
    const pw = p.w;
    const ph = p.h;

    // Check if ball is moving downward and intersects paddle capsule
    if (ball.vy > 0 &&
        ball.x + ball.r >= px - pw / 2 &&
        ball.x - ball.r <= px + pw / 2 &&
        ball.y + ball.r >= py - ph / 2 &&
        ball.y - ball.r <= py + ph / 2 + 6) {

      // Hit offset from paddle center (-1 to +1)
      const hitOffset = (ball.x - px) / (pw / 2);
      // Paddle velocity influence
      const paddleInfluence = Math.max(-0.4, Math.min(0.4, (p.vx || 0) * 0.001));

      // Calculate bounce angle (-60 deg to +60 deg)
      const maxAngle = (65 * Math.PI) / 180;
      const angle = (hitOffset * 0.75 + paddleInfluence) * maxAngle;

      const speed = Math.hypot(ball.vx, ball.vy);
      ball.vx = Math.sin(angle) * speed;
      ball.vy = -Math.cos(angle) * speed;

      ball.y = py - ph / 2 - ball.r - 1;

      window.soundEngine.playPaddleHit(Math.abs(hitOffset));
      createSparks(ball.x, py - ph / 2, '#fb923c', 10);
      state.screenShake = 2;
    }
  }

  // POWERUPS
  const POWERUP_TYPES = [
    { type: 'multiball', label: '+2 BALLS', color: '#22c55e', symbol: '●●' },
    { type: 'fireball', label: 'FIRE CORE', color: '#ef4444', symbol: '🔥' },
    { type: 'wide', label: 'WIDE PADDLE', color: '#3b82f6', symbol: '↔️' },
    { type: 'shield', label: 'SAFETY SHIELD', color: '#06b6d4', symbol: '🛡️' },
    { type: 'bomb', label: 'CLUSTER BOMB', color: '#eab308', symbol: '💥' }
  ];

  function spawnPowerup(x, y) {
    const proto = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    state.powerups.push({
      x: x,
      y: y,
      vy: 140,
      type: proto.type,
      label: proto.label,
      color: proto.color,
      symbol: proto.symbol,
      rotation: 0,
      r: 10
    });
  }

  function applyPowerup(type) {
    if (type === 'multiball') {
      const orig = state.activeBalls[0] || createBall(state.paddle.x, state.paddle.y - 12, 0, -420);
      for (let i = 0; i < 2; i++) {
        const spread = (i === 0 ? -1 : 1) * 0.4;
        const curAngle = Math.atan2(orig.vy, orig.vx);
        const newAngle = curAngle + spread;
        const speed = Math.hypot(orig.vx, orig.vy) || 460;
        const nb = createBall(orig.x, orig.y, Math.cos(newAngle) * speed, Math.sin(newAngle) * speed);
        nb.insideCore = orig.insideCore;
        state.activeBalls.push(nb);
      }
      updateHUD();
    } else if (type === 'fireball') {
      state.activeEffects.fireball = 7.0; // 7 seconds
      state.activeBalls.forEach(b => b.isFireball = true);
    } else if (type === 'wide') {
      state.activeEffects.widePaddle = 12.0;
      state.paddle.targetW = 110;
    } else if (type === 'shield') {
      state.activeEffects.shield = 12.0;
    } else if (type === 'bomb') {
      // Detonate a cluster inside the core
      detonateClusterBomb();
    }
  }

  function detonateClusterBomb() {
    const bombX = CORE_CX + (Math.random() - 0.5) * 60;
    const bombY = CORE_CY - 20 + (Math.random() - 0.5) * 60;
    const radius = 38;

    window.soundEngine.playFirstBreak();
    state.screenShake = 12;
    createCoreShockwave(bombX, bombY);
    spawnFloatingText(bombX, bombY, 'CLUSTER DETONATION!', '#fbbf24');

    for (let r = 0; r < state.gridRows; r++) {
      if (!state.bricks[r]) continue;
      for (let c = 0; c < state.gridCols; c++) {
        const b = state.bricks[r][c];
        if (b && b.active && Math.hypot(b.x - bombX, b.y - bombY) <= radius) {
          b.active = false;
          state.clearedCount++;
          state.score += 15;
          createBrickDebris(b.x, b.y, b.color);
        }
      }
    }
    updateHUD();
  }

  // VISUAL EFFECTS & PARTICLES
  function createBrickDebris(x, y, color) {
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 110;
      state.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vRot: (Math.random() - 0.5) * 15,
        rotation: 0,
        size: 1.8 + Math.random() * 2.2,
        color: color,
        alpha: 1.0
      });
    }
  }

  function createSparks(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
      const speed = 60 + Math.random() * 180;
      state.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vRot: 0,
        rotation: 0,
        size: 2,
        color: color,
        alpha: 1.0
      });
    }
  }

  function createCoreShockwave(x, y) {
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2;
      const speed = 120 + Math.random() * 140;
      state.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vRot: 0,
        rotation: 0,
        size: 2.8,
        color: i % 2 === 0 ? '#ffedd5' : '#f09a82',
        alpha: 1.0
      });
    }
  }

  function spawnFloatingText(x, y, text, color) {
    state.floatingTexts.push({
      x: x,
      y: y,
      text: text,
      color: color,
      alpha: 1.0
    });
  }

  // RENDER LOOP
  function render() {
    ctx.save();

    // Screen Shake Offset
    if (state.screenShake > 0) {
      const rx = (Math.random() - 0.5) * state.screenShake;
      const ry = (Math.random() - 0.5) * state.screenShake;
      ctx.translate(rx, ry);
    }

    // Background Clear
    ctx.fillStyle = '#080b12';
    ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

    // Subtle Core Glow in center
    const radialGlow = ctx.createRadialGradient(CORE_CX, CORE_CY, 20, CORE_CX, CORE_CY, CORE_R + 30);
    radialGlow.addColorStop(0, 'rgba(30, 41, 59, 0.45)');
    radialGlow.addColorStop(0.8, 'rgba(15, 23, 42, 0.2)');
    radialGlow.addColorStop(1, 'rgba(8, 11, 18, 0)');
    ctx.fillStyle = radialGlow;
    ctx.beginPath();
    ctx.arc(CORE_CX, CORE_CY, CORE_R + 30, 0, Math.PI * 2);
    ctx.fill();

    // 1. Draw Indestructible Steel Barrier
    if (state.barriers && state.barriers.length > 0) {
      state.barriers.forEach(bar => {
        // Metallic steel armor blocks with crisp bevel
        ctx.fillStyle = '#334155';
        ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
        ctx.fillStyle = '#475569';
        ctx.fillRect(bar.x + 0.6, bar.y + 0.6, bar.w - 1.2, bar.h - 1.2);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(bar.x, bar.y, bar.w, bar.h);
      });
    }

    // 2. Draw Bricks Matrix
    for (let r = 0; r < state.gridRows; r++) {
      if (!state.bricks[r]) continue;
      for (let c = 0; c < state.gridCols; c++) {
        const b = state.bricks[r][c];
        if (!b || !b.active) continue;

        ctx.fillStyle = b.color;
        ctx.fillRect(b.x + 0.4, b.y + 0.4, b.w - 0.8, b.h - 0.8);
      }
    }

    // 3. Draw Outer Circular Hull & Bottom Gate Opening
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#5ea6b8'; // Matching screenshot teal/cyan
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 6;

    // Outer circle arc with bottom gap: from (gateAngle + half) to (gateAngle - half)
    const startArc = Math.PI / 2 + GATE_HALF_ANGLE;
    const endArc = Math.PI / 2 - GATE_HALF_ANGLE + Math.PI * 2;
    ctx.beginPath();
    ctx.arc(CORE_CX, CORE_CY, CORE_R, startArc, endArc, false);
    ctx.stroke();

    ctx.shadowBlur = 0; // reset glow

    // Gatepost Markers (Two small orange vertical tick marks)
    const gatePostY1 = CORE_CY + Math.cos(GATE_HALF_ANGLE) * CORE_R - 2;
    const gatePostY2 = gatePostY1 + 12;
    const leftPostX = CORE_CX - GATE_WIDTH / 2;
    const rightPostX = CORE_CX + GATE_WIDTH / 2;

    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#f97316'; // Glowing orange/amber
    ctx.beginPath();
    ctx.moveTo(leftPostX, gatePostY1);
    ctx.lineTo(leftPostX, gatePostY2);
    ctx.moveTo(rightPostX, gatePostY1);
    ctx.lineTo(rightPostX, gatePostY2);
    ctx.stroke();

    // 4. Draw Safety Shield if Active
    if (state.activeEffects.shield > 0) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#06b6d4';
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(20, V_HEIGHT - 30);
      ctx.lineTo(V_WIDTH - 20, V_HEIGHT - 30);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 5. Draw Powerups
    state.powerups.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.symbol, 0, 0);
      ctx.restore();
    });

    // 6. Draw Paddle
    const p = state.paddle;
    const paddleColor = state.activeEffects.widePaddle > 0 ? '#38bdf8' : '#fb923c';
    ctx.fillStyle = paddleColor;
    ctx.shadowColor = paddleColor;
    ctx.shadowBlur = 8;
    // Rounded capsule paddle
    const rad = p.h / 2;
    ctx.beginPath();
    ctx.roundRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, [rad]);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Paddle Center Highlight Accent
    ctx.fillStyle = '#ffedd5';
    ctx.fillRect(p.x - 8, p.y - p.h / 2 + 3, 16, 2);

    // 7. Draw Ball & "优美的曲线" (The Beautiful Curve Trail)
    state.activeBalls.forEach(ball => {
      // Draw Trail Ribbon
      if (ball.trail.length > 2) {
        ctx.beginPath();
        ctx.moveTo(ball.trail[0].x, ball.trail[0].y);
        for (let i = 1; i < ball.trail.length; i++) {
          const pt = ball.trail[i];
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.lineWidth = ball.isFireball ? 4 : 2.5;
        ctx.strokeStyle = ball.isFireball
          ? 'rgba(239, 68, 68, 0.65)'
          : 'rgba(255, 255, 255, 0.45)';
        ctx.stroke();
      }

      // Draw Glowing Ball
      ctx.fillStyle = ball.isFireball ? '#f97316' : '#ffffff';
      ctx.shadowColor = ball.isFireball ? '#ef4444' : '#67e8f9';
      ctx.shadowBlur = ball.isFireball ? 16 : 10;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Aiming Laser Guide when in 'aiming' mode
    if (state.gameState === 'aiming') {
      ctx.save();
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(state.paddle.x, state.paddle.y - 12);
      ctx.lineTo(CORE_CX, CORE_CY + CORE_R + 10);
      ctx.stroke();
      ctx.restore();

      // Launch prompt text
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px "Space Mono", monospace, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAP OR PRESS SPACE TO LAUNCH', CORE_CX, state.paddle.y - 28);
    }

    // 8. Draw Particles
    state.particles.forEach(pt => {
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = Math.max(0, pt.alpha);
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    });
    ctx.globalAlpha = 1.0;

    // 9. Draw Floating Texts
    state.floatingTexts.forEach(ft => {
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.font = 'bold 12px "Space Mono", monospace, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
    });
    ctx.globalAlpha = 1.0;

    // Game Over Overlay
    if (state.gameState === 'gameover') {
      ctx.fillStyle = 'rgba(8, 11, 18, 0.85)';
      ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 26px "Space Mono", monospace, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CORE COLLAPSED', CORE_CX, CORE_CY - 10);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px monospace';
      ctx.fillText(`CLEARED: ${state.clearedCount} / ${state.totalBricks}`, CORE_CX, CORE_CY + 25);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('CLICK / TAP TO RETRY', CORE_CX, CORE_CY + 65);
    } else if (state.gameState === 'cleared') {
      ctx.fillStyle = 'rgba(8, 11, 18, 0.85)';
      ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 28px "Space Mono", monospace, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('STAGE CLEARED!', CORE_CX, CORE_CY - 15);
      ctx.fillStyle = '#ffedd5';
      ctx.font = '14px monospace';
      ctx.fillText('ALL CORE BRICKS DESTROYED', CORE_CX, CORE_CY + 20);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('CLICK / TAP FOR NEXT STAGE', CORE_CX, CORE_CY + 60);
    }

    ctx.restore();
  }

  // MAIN LOOP
  let lastTime = performance.now();
  function gameLoop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05); // cap delta time
    lastTime = now;

    updatePhysics(dt);
    render();

    requestAnimationFrame(gameLoop);
  }

  // CONTROLS & INPUT
  function updatePaddleFromClientX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    // Map to virtual coords
    const virtualX = (relativeX - offsetX) / scale;
    state.paddle.x = Math.max(state.paddle.w / 2 + 10, Math.min(V_WIDTH - state.paddle.w / 2 - 10, virtualX));

    if (state.gameState === 'aiming' && state.activeBalls.length > 0) {
      state.activeBalls[0].x = state.paddle.x;
      state.activeBalls[0].y = state.paddle.y - 12;
    }
  }

  // Mouse Move
  canvas.addEventListener('mousemove', e => {
    updatePaddleFromClientX(e.clientX);
  });

  // Touch Move & Drag
  canvas.addEventListener('touchstart', e => {
    window.soundEngine.init();
    window.soundEngine.resume();
    if (e.touches.length > 0) {
      updatePaddleFromClientX(e.touches[0].clientX);
      if (state.gameState === 'aiming') {
        launchBall();
      } else if (state.gameState === 'gameover' || state.gameState === 'cleared') {
        generateStage(state.currentStage);
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length > 0) {
      updatePaddleFromClientX(e.touches[0].clientX);
    }
  }, { passive: false });

  // Click to launch or restart
  canvas.addEventListener('click', e => {
    window.soundEngine.init();
    window.soundEngine.resume();
    if (state.gameState === 'aiming') {
      launchBall();
    } else if (state.gameState === 'gameover' || state.gameState === 'cleared') {
      generateStage(state.currentStage);
    }
  });

  // Keyboard Controls
  const keys = {};
  window.addEventListener('keydown', e => {
    window.soundEngine.init();
    window.soundEngine.resume();
    keys[e.key] = true;
    if (e.code === 'Space') {
      e.preventDefault();
      if (state.gameState === 'aiming') {
        launchBall();
      } else if (state.gameState === 'gameover' || state.gameState === 'cleared') {
        generateStage(state.currentStage);
      }
    }
  });

  window.addEventListener('keyup', e => {
    keys[e.key] = false;
  });

  // Keyboard paddle update in animation frame
  function checkKeyboard(dt) {
    const moveSpeed = 500 * dt;
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
      state.paddle.x = Math.max(state.paddle.w / 2 + 10, state.paddle.x - moveSpeed);
    }
    if (keys['ArrowRight'] || keys['d'] || keys['D']) {
      state.paddle.x = Math.min(V_WIDTH - state.paddle.w / 2 - 10, state.paddle.x + moveSpeed);
    }
    if (state.gameState === 'aiming' && state.activeBalls.length > 0) {
      state.activeBalls[0].x = state.paddle.x;
      state.activeBalls[0].y = state.paddle.y - 12;
    }
  }

  // Wrap physics update with keyboard check
  const origUpdatePhysics = updatePhysics;
  updatePhysics = function(dt) {
    checkKeyboard(dt);
    origUpdatePhysics(dt);
  };

  // UI Event Listeners
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      window.soundEngine.init();
      const isMuted = window.soundEngine.toggleMute();
      muteBtn.textContent = isMuted ? '🔇 MUTED' : '🔊 SOUND';
    });
  }

  if (stageSelect) {
    stageSelect.addEventListener('change', e => {
      const stageNum = parseInt(e.target.value, 10);
      generateStage(stageNum);
    });
  }

  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      generateStage(state.currentStage);
    });
  }

  // Initialize
  resizeCanvas();
  generateStage(12); // Default to Stage 12 from screenshot!
  requestAnimationFrame(gameLoop);

})();
