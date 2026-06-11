/* =========================================================
 * BRICK BREAKER — Arkanoid Style
 * タイトー「アルカノイド」へのオマージュとして作られた
 * ブラウザ用ブロック崩しゲーム（依存ライブラリなし）
 * ========================================================= */
(() => {
  'use strict';

  // ===== キャンバス =====
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  // 論理座標系は 448x620 固定。Retina 等では実ピクセルを増やして高精細に描画する
  const W = 448;
  const H = 620;
  function setupResolution() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  setupResolution();
  addEventListener('resize', setupResolution);

  // ===== フィールド寸法 =====
  const HUD_H = 48;
  const WALL = 16;
  const FIELD = { left: WALL, right: W - WALL, top: HUD_H + WALL, bottom: H };
  const COLS = 13;
  const BW = 32, BH = 16;            // ブロックサイズ
  const BRICK_TOP = FIELD.top + 56;  // ブロック配置開始Y
  const PADDLE_Y = H - 44;
  const BALL_R = 5;

  // ===== ブロック定義 =====
  // w白 o橙 c水 g緑 r赤 b青 m桃 y黄 / S=シルバー(複数回) G=ゴールド(破壊不可)
  const BRICK_INFO = {
    w: { color: '#f0f0f0', score: 50 },
    o: { color: '#ff8c00', score: 60 },
    c: { color: '#00c8e8', score: 70 },
    g: { color: '#00c853', score: 80 },
    r: { color: '#f43030', score: 90 },
    b: { color: '#2962ff', score: 100 },
    m: { color: '#ff44aa', score: 110 },
    y: { color: '#ffd600', score: 120 },
  };

  // ===== ステージ定義（13列 × 任意行） =====
  const STAGES = [
    [ // ROUND 1: 元祖1面
      'SSSSSSSSSSSSS',
      'rrrrrrrrrrrrr',
      'yyyyyyyyyyyyy',
      'bbbbbbbbbbbbb',
      'mmmmmmmmmmmmm',
      'ggggggggggggg',
    ],
    [ // ROUND 2: 階段
      'w............',
      'wo...........',
      'woc..........',
      'wocg.........',
      'wocgr........',
      'wocgrb.......',
      'wocgrbm......',
      'wocgrbmy.....',
      'wocgrbmyw....',
      'wocgrbmywo...',
      'wocgrbmywoc..',
      'SSSSSSSSSSSSS',
    ],
    [ // ROUND 3: ゴールドの梁
      'ggggggggggggg',
      '.............',
      'GGGGGGGGGGGG.',
      '.............',
      'ccccccccccccc',
      '.............',
      '.GGGGGGGGGGGG',
      '.............',
      'yyyyyyyyyyyyy',
      '.............',
      'GGGGGGGGGGGG.',
      '.............',
      'rrrrrrrrrrrrr',
    ],
    [ // ROUND 4: 市松模様
      'r.y.b.m.g.c.w',
      '.y.b.m.g.c.w.',
      'r.y.b.m.g.c.w',
      '.y.b.m.g.c.w.',
      'r.y.b.m.g.c.w',
      '.y.b.m.g.c.w.',
      'r.y.b.m.g.c.w',
      '.y.b.m.g.c.w.',
    ],
    [ // ROUND 5: インベーダー
      '...y.....y...',
      '....y...y....',
      '...yyyyyyy...',
      '..yymyyymyy..',
      '.yyyyyyyyyyy.',
      '.y.yyyyyyy.y.',
      '.y.y.....y.y.',
      '....yy.yy....',
    ],
    [ // ROUND 6: ダイヤモンド
      '......S......',
      '.....SrS.....',
      '....SrmrS....',
      '...SrmymrS...',
      '..SrmybymrS..',
      '...SrmymrS...',
      '....SrmrS....',
      '.....SrS.....',
      '......S......',
    ],
    [ // ROUND 7: 要塞
      'G...........G',
      'G.rrrrrrrrr.G',
      'G.r.......r.G',
      'G.r.SSSSS.r.G',
      'G.r.S.y.S.r.G',
      'G.r.SSSSS.r.G',
      'G.r.......r.G',
      'G.rrrrrrrrr.G',
      'G...........G',
    ],
    [ // ROUND 8: 虹の最終面
      'mmmmmmmmmmmmm',
      'rrrrrrrrrrrrr',
      'yyyyyyyyyyyyy',
      'ggggggggggggg',
      'bbbbbbbbbbbbb',
      'ccccccccccccc',
      'wwwwwwwwwwwww',
      'SSSSSSSSSSSSS',
    ],
  ];

  // ===== カプセル定義 =====
  const CAPSULES = {
    S: { color: '#ff8c00', name: 'SLOW' },      // ボール減速
    C: { color: '#22cc55', name: 'CATCH' },     // キャッチ
    E: { color: '#2962ff', name: 'EXPAND' },    // バウス拡大
    D: { color: '#00c8e8', name: 'DISRUPT' },   // 3つに分裂
    L: { color: '#f43030', name: 'LASER' },     // レーザー
    B: { color: '#ff44aa', name: 'BREAK' },     // 次のラウンドへ
    P: { color: '#bdbdbd', name: 'PLAYER' },    // 残機+1
  };
  // 出現の重み（B,Pはレア）
  const CAPSULE_WEIGHTS = [
    ['S', 18], ['C', 15], ['E', 18], ['D', 14], ['L', 15], ['B', 2], ['P', 3],
  ];
  const CAPSULE_DROP_RATE = 0.22;

  // ===== サウンド（Web Audio 合成） =====
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* 無音で続行 */ }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }
  function beep(freq, dur, type = 'square', vol = 0.08, slideTo = null) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  const SFX = {
    paddle:  () => beep(440, 0.06, 'square', 0.09),
    brick:   () => beep(880, 0.05, 'square', 0.08),
    silver:  () => beep(220, 0.07, 'sawtooth', 0.08),
    gold:    () => beep(150, 0.08, 'sawtooth', 0.07),
    capsule: () => { beep(660, 0.08, 'square', 0.07); beep(990, 0.1, 'square', 0.06); },
    laser:   () => beep(1400, 0.1, 'sawtooth', 0.05, 300),
    lose:    () => beep(300, 0.6, 'sawtooth', 0.1, 60),
    life:    () => { beep(523, 0.1, 'square', 0.08); setTimeout(() => beep(784, 0.15, 'square', 0.08), 100); },
    clear:   () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.15, 'square', 0.08), i * 120)); },
  };

  // ===== ゲーム状態 =====
  let state = 'title';   // title | intro | play | dead | clear | gameover
  let stateTimer = 0;
  let paused = false;

  let score = 0;
  let hiScore = Number(localStorage.getItem('bb_hiscore') || 50000);
  let lives = 3;
  let round = 1;
  let nextLifeScore = 20000;

  let bricks = [];        // {col,row,type,hp,flash}
  let grid = [];          // grid[row][col] -> brick or null
  let destructibleLeft = 0;
  let balls = [];         // {x,y,dx,dy,speed,stuck,stickOffset,stickTimer}
  let capsules = [];      // {x,y,type,phase}
  let lasers = [];        // {x,y}
  let particles = [];     // {x,y,vx,vy,life,maxLife,color}

  const paddle = { x: W / 2, w: 64, targetW: 64, h: 12 };
  let mode = 'none';      // none | catch | expand | laser
  let slowFactor = 1;     // S カプセルで 0.55 になり徐々に戻る
  let laserCooldown = 0;
  let blink = 0;          // 点滅表示用タイマー

  // ===== 入力 =====
  const keys = {};
  let firePressed = false;

  const pauseBtn = document.getElementById('pauseBtn');
  function setPaused(v) {
    if (v && state !== 'play' && state !== 'intro') v = false;
    paused = v;
    pauseBtn.textContent = paused ? '▶' : '❚❚';
  }
  pauseBtn.addEventListener('click', () => {
    ensureAudio();
    setPaused(!paused);
    pauseBtn.blur(); // フォーカスが残るとスペースキーでボタンが再発火するため
  });

  addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'Space') { ensureAudio(); firePressed = true; }
    if (e.code === 'KeyP') setPaused(!paused);
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });

  function canvasX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return (clientX - rect.left) * (W / rect.width);
  }
  canvas.addEventListener('mousemove', (e) => {
    movePaddleTo(canvasX(e.clientX));
  });
  canvas.addEventListener('mousedown', () => { ensureAudio(); firePressed = true; });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    movePaddleTo(canvasX(e.touches[0].clientX));
  }, { passive: false });
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    ensureAudio();
    firePressed = true;
    movePaddleTo(canvasX(e.touches[0].clientX));
  }, { passive: false });

  function movePaddleTo(x) {
    paddle.x = clamp(x, FIELD.left + paddle.w / 2, FIELD.right - paddle.w / 2);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPaused(true);
  });

  // ===== ユーティリティ =====
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function brickRect(b) {
    return { x: FIELD.left + b.col * BW, y: BRICK_TOP + b.row * BH, w: BW, h: BH };
  }
  function pickCapsuleType() {
    const total = CAPSULE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [t, w] of CAPSULE_WEIGHTS) { r -= w; if (r <= 0) return t; }
    return 'S';
  }
  function baseSpeed() { return Math.min(360, 250 + (round - 1) * 10); }
  function silverHp() { return 2 + Math.floor((round - 1) / 8); }

  // ===== ゲーム進行 =====
  function startGame() {
    score = 0;
    lives = 3;
    round = 1;
    nextLifeScore = 20000;
    loadRound();
  }

  function loadRound() {
    const layout = STAGES[(round - 1) % STAGES.length];
    bricks = [];
    grid = [];
    destructibleLeft = 0;
    for (let r = 0; r < layout.length; r++) {
      grid[r] = [];
      for (let c = 0; c < COLS; c++) {
        const ch = layout[r][c];
        if (!ch || ch === '.') { grid[r][c] = null; continue; }
        const hp = ch === 'G' ? Infinity : ch === 'S' ? silverHp() : 1;
        const b = { col: c, row: r, type: ch, hp, flash: 0 };
        bricks.push(b);
        grid[r][c] = b;
        if (ch !== 'G') destructibleLeft++;
      }
    }
    resetField(true);
    state = 'intro';
    stateTimer = 2.0;
  }

  // ライフ消費後やラウンド開始時のフィールド初期化
  function resetField(newRound) {
    balls = [];
    capsules = [];
    lasers = [];
    mode = 'none';
    slowFactor = 1;
    paddle.targetW = 64;
    paddle.w = 64;
    movePaddleTo(paddle.x);
    spawnStuckBall();
    if (!newRound) { state = 'intro'; stateTimer = 1.0; }
  }

  function spawnStuckBall() {
    balls.push({
      x: paddle.x + 10, y: PADDLE_Y - BALL_R - 1,
      dx: 0, dy: -1,
      speed: baseSpeed(),
      stuck: true, stickOffset: 10, stickTimer: 3.0,
    });
  }

  function releaseBall(ball) {
    ball.stuck = false;
    // 貼り付き位置に応じて発射角を変える（中央なら真上寄り）
    const rel = clamp(ball.stickOffset / (paddle.w / 2), -1, 1);
    const angle = rel * (Math.PI / 4) || (Math.random() < 0.5 ? -0.2 : 0.2);
    ball.dx = Math.sin(angle);
    ball.dy = -Math.cos(angle);
    SFX.paddle();
  }

  function loseLife() {
    SFX.lose();
    // バウス爆発パーティクル
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: paddle.x + (Math.random() - 0.5) * paddle.w,
        y: PADDLE_Y + 6,
        vx: (Math.random() - 0.5) * 260,
        vy: -Math.random() * 220,
        life: 0.9, maxLife: 0.9,
        color: ['#f43030', '#ffd600', '#bdbdbd'][i % 3],
      });
    }
    lives--;
    state = 'dead';
    stateTimer = 1.6;
  }

  function addScore(pts) {
    score += pts;
    if (score > hiScore) {
      hiScore = score;
      localStorage.setItem('bb_hiscore', String(hiScore));
    }
    if (score >= nextLifeScore) {
      lives++;
      SFX.life();
      nextLifeScore += nextLifeScore === 20000 ? 40000 : 60000;
    }
  }

  function roundClear() {
    SFX.clear();
    state = 'clear';
    stateTimer = 2.0;
  }

  // ===== ブロックヒット処理 =====
  function hitBrick(b, fromLaser) {
    if (b.type === 'G') {
      b.flash = 0.15;
      SFX.gold();
      return;
    }
    b.hp--;
    if (b.hp > 0) {
      b.flash = 0.2;
      SFX.silver();
      return;
    }
    // 破壊
    grid[b.row][b.col] = null;
    bricks.splice(bricks.indexOf(b), 1);
    destructibleLeft--;
    const rect = brickRect(b);
    const color = b.type === 'S' ? '#cfd4dc' : BRICK_INFO[b.type].color;
    addScore(b.type === 'S' ? 50 * round : BRICK_INFO[b.type].score);
    SFX.brick();
    for (let i = 0; i < 8; i++) {
      particles.push({
        x: rect.x + rect.w / 2, y: rect.y + rect.h / 2,
        vx: (Math.random() - 0.5) * 220,
        vy: (Math.random() - 0.5) * 220,
        life: 0.4, maxLife: 0.4, color,
      });
    }
    // カプセル抽選（複数ボール中・落下中カプセルあり・レーザー破壊時は出ない）
    if (!fromLaser && b.type !== 'S' && balls.length === 1 && capsules.length === 0
        && Math.random() < CAPSULE_DROP_RATE) {
      capsules.push({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, type: pickCapsuleType(), phase: 0 });
    }
    if (destructibleLeft <= 0) roundClear();
  }

  // ===== カプセル効果 =====
  function applyCapsule(type) {
    SFX.capsule();
    addScore(1000);
    switch (type) {
      case 'S':
        slowFactor = 0.55;
        break;
      case 'C':
        mode = 'catch';
        paddle.targetW = 64;
        break;
      case 'E':
        mode = 'expand';
        paddle.targetW = 96;
        break;
      case 'L':
        mode = 'laser';
        paddle.targetW = 64;
        break;
      case 'D': {
        mode = 'none';
        paddle.targetW = 64;
        const src = balls.find((b) => !b.stuck) || balls[0];
        if (src.stuck) releaseBall(src);
        for (const rot of [-0.5, 0.5]) {
          const cos = Math.cos(rot), sin = Math.sin(rot);
          balls.push({
            x: src.x, y: src.y,
            dx: src.dx * cos - src.dy * sin,
            dy: src.dx * sin + src.dy * cos,
            speed: src.speed, stuck: false, stickOffset: 0, stickTimer: 0,
          });
        }
        break;
      }
      case 'B':
        addScore(10000);
        roundClear();
        break;
      case 'P':
        lives++;
        SFX.life();
        break;
    }
  }

  // ===== 更新 =====
  function update(dt) {
    blink += dt;
    if (paused) {
      // ポーズ中の画面タップで再開（タップ入力は持ち越さない）
      if (firePressed) setPaused(false);
      firePressed = false;
      return;
    }

    // パドル幅アニメーション
    paddle.w += (paddle.targetW - paddle.w) * Math.min(1, dt * 10);
    movePaddleTo(paddle.x);

    // キーボード移動
    const kdir = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
    if (kdir) movePaddleTo(paddle.x + kdir * 420 * dt);

    updateParticles(dt);

    switch (state) {
      case 'title':
        if (firePressed) { startGame(); }
        break;

      case 'intro':
        stateTimer -= dt;
        // ボールはバウスに追従
        for (const b of balls) if (b.stuck) {
          b.x = paddle.x + b.stickOffset;
          b.y = PADDLE_Y - BALL_R - 1;
        }
        if (stateTimer <= 0) state = 'play';
        break;

      case 'play':
        updatePlay(dt);
        break;

      case 'dead':
        stateTimer -= dt;
        if (stateTimer <= 0) {
          if (lives < 0) {
            state = 'gameover';
            stateTimer = 0;
          } else {
            resetField(false);
          }
        }
        break;

      case 'clear':
        stateTimer -= dt;
        if (stateTimer <= 0) {
          round++;
          loadRound();
        }
        break;

      case 'gameover':
        stateTimer += dt;
        if (firePressed && stateTimer > 1) state = 'title';
        break;
    }
    firePressed = false;
  }

  function updatePlay(dt) {
    // スロー効果はゆっくり元に戻る
    slowFactor = Math.min(1, slowFactor + dt * 0.04);
    laserCooldown = Math.max(0, laserCooldown - dt);

    // 発射 / レーザー
    if (firePressed) {
      const stuckBall = balls.find((b) => b.stuck);
      if (stuckBall) {
        releaseBall(stuckBall);
      } else if (mode === 'laser' && laserCooldown <= 0 && lasers.length < 4) {
        lasers.push({ x: paddle.x - paddle.w / 2 + 8, y: PADDLE_Y - 6 });
        lasers.push({ x: paddle.x + paddle.w / 2 - 8, y: PADDLE_Y - 6 });
        laserCooldown = 0.25;
        SFX.laser();
      }
    }

    updateBalls(dt);
    updateCapsules(dt);
    updateLasers(dt);
  }

  function updateBalls(dt) {
    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];
      if (ball.stuck) {
        ball.x = paddle.x + ball.stickOffset;
        ball.y = PADDLE_Y - BALL_R - 1;
        ball.stickTimer -= dt;
        if (ball.stickTimer <= 0) releaseBall(ball);
        continue;
      }
      // サブステップ移動（高速時のすり抜け防止）
      const speed = ball.speed * slowFactor;
      let dist = speed * dt;
      const stepLen = 4;
      while (dist > 0) {
        const step = Math.min(stepLen, dist);
        dist -= step;
        ball.x += ball.dx * step;
        ball.y += ball.dy * step;
        if (stepBallCollision(ball)) { /* 衝突後も継続移動 */ }
        if (ball.y > H + BALL_R * 2) break;
      }
      // 落下
      if (ball.y > H + BALL_R * 2) {
        balls.splice(i, 1);
        if (balls.length === 0) loseLife();
      }
    }
  }

  // 1ステップ分の衝突判定。何かに当たったら true
  function stepBallCollision(ball) {
    let hit = false;

    // 壁
    if (ball.x - BALL_R < FIELD.left) { ball.x = FIELD.left + BALL_R; ball.dx = Math.abs(ball.dx); hit = true; }
    if (ball.x + BALL_R > FIELD.right) { ball.x = FIELD.right - BALL_R; ball.dx = -Math.abs(ball.dx); hit = true; }
    if (ball.y - BALL_R < FIELD.top) { ball.y = FIELD.top + BALL_R; ball.dy = Math.abs(ball.dy); hit = true; }

    // パドル
    const pl = paddle.x - paddle.w / 2, pr = paddle.x + paddle.w / 2;
    if (ball.dy > 0 &&
        ball.y + BALL_R >= PADDLE_Y && ball.y - BALL_R <= PADDLE_Y + paddle.h &&
        ball.x >= pl - BALL_R && ball.x <= pr + BALL_R) {
      ball.y = PADDLE_Y - BALL_R;
      if (mode === 'catch') {
        ball.stuck = true;
        ball.stickOffset = clamp(ball.x - paddle.x, -paddle.w / 2 + 4, paddle.w / 2 - 4);
        ball.stickTimer = 3.0;
        SFX.paddle();
        return true;
      }
      // 当たった位置で反射角を決める（最大65度）
      const rel = clamp((ball.x - paddle.x) / (paddle.w / 2), -1, 1);
      const angle = rel * (Math.PI * 65 / 180);
      ball.dx = Math.sin(angle);
      ball.dy = -Math.cos(angle);
      // パドルヒットごとに少し加速（上限あり）
      ball.speed = Math.min(baseSpeed() + 130, ball.speed + 3);
      SFX.paddle();
      return true;
    }

    // ブロック
    const c0 = clamp(Math.floor((ball.x - BALL_R - FIELD.left) / BW), 0, COLS - 1);
    const c1 = clamp(Math.floor((ball.x + BALL_R - FIELD.left) / BW), 0, COLS - 1);
    const r0 = Math.floor((ball.y - BALL_R - BRICK_TOP) / BH);
    const r1 = Math.floor((ball.y + BALL_R - BRICK_TOP) / BH);
    for (let r = r0; r <= r1; r++) {
      if (r < 0 || r >= grid.length) continue;
      for (let c = c0; c <= c1; c++) {
        const b = grid[r][c];
        if (!b) continue;
        const rect = brickRect(b);
        // 円と矩形の最近点判定
        const nx = clamp(ball.x, rect.x, rect.x + rect.w);
        const ny = clamp(ball.y, rect.y, rect.y + rect.h);
        const ddx = ball.x - nx, ddy = ball.y - ny;
        if (ddx * ddx + ddy * ddy > BALL_R * BALL_R) continue;
        // 反射方向: めり込みの浅い軸で反転
        const overlapX = BALL_R - Math.abs(ddx);
        const overlapY = BALL_R - Math.abs(ddy);
        if (Math.abs(ddx) > Math.abs(ddy)) {
          ball.dx = ddx >= 0 ? Math.abs(ball.dx) : -Math.abs(ball.dx);
          ball.x += (ddx >= 0 ? 1 : -1) * overlapX;
        } else {
          ball.dy = ddy >= 0 ? Math.abs(ball.dy) : -Math.abs(ball.dy);
          ball.y += (ddy >= 0 ? 1 : -1) * overlapY;
        }
        hitBrick(b, false);
        return true;
      }
    }

    // 横ばい防止: 水平に近すぎる軌道を矯正
    if (hit && Math.abs(ball.dy) < 0.18) {
      ball.dy = ball.dy >= 0 ? 0.18 : -0.18;
      const n = Math.hypot(ball.dx, ball.dy);
      ball.dx /= n; ball.dy /= n;
    }
    return hit;
  }

  function updateCapsules(dt) {
    for (let i = capsules.length - 1; i >= 0; i--) {
      const cap = capsules[i];
      cap.y += 110 * dt;
      cap.phase += dt * 6;
      const pl = paddle.x - paddle.w / 2, pr = paddle.x + paddle.w / 2;
      if (cap.y + 7 >= PADDLE_Y && cap.y - 7 <= PADDLE_Y + paddle.h &&
          cap.x + 14 >= pl && cap.x - 14 <= pr) {
        capsules.splice(i, 1);
        applyCapsule(cap.type);
      } else if (cap.y > H + 20) {
        capsules.splice(i, 1);
      }
    }
  }

  function updateLasers(dt) {
    for (let i = lasers.length - 1; i >= 0; i--) {
      const lz = lasers[i];
      lz.y -= 540 * dt;
      if (lz.y < FIELD.top) { lasers.splice(i, 1); continue; }
      const c = Math.floor((lz.x - FIELD.left) / BW);
      const r = Math.floor((lz.y - BRICK_TOP) / BH);
      if (r >= 0 && r < grid.length && c >= 0 && c < COLS && grid[r][c]) {
        hitBrick(grid[r][c], true);
        lasers.splice(i, 1);
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 500 * dt;
    }
  }

  // ===== 描画 =====
  function draw() {
    ctx.clearRect(0, 0, W, H);

    if (state === 'title') {
      drawTitle();
      return;
    }

    drawBackground();
    drawWalls();
    drawBricks();
    drawParticles();
    drawCapsules();
    drawLasers();
    if (state !== 'dead') drawPaddle();
    drawBalls();
    drawHud();
    drawOverlays();
  }

  function drawBackground() {
    // ラウンドごとに色味を変えた背景
    const hues = [225, 280, 160, 30, 330, 200, 0, 260];
    const hue = hues[(round - 1) % hues.length];
    ctx.fillStyle = `hsl(${hue}, 45%, 7%)`;
    ctx.fillRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, H - FIELD.top);
    // 控えめなドット模様
    ctx.fillStyle = `hsla(${hue}, 60%, 28%, 0.25)`;
    for (let y = FIELD.top + 8; y < H; y += 24) {
      for (let x = FIELD.left + 8 + ((y / 24) % 2) * 12; x < FIELD.right; x += 24) {
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  function drawWalls() {
    const grad = ctx.createLinearGradient(0, 0, WALL, 0);
    grad.addColorStop(0, '#8a93a5');
    grad.addColorStop(0.5, '#48505e');
    grad.addColorStop(1, '#23262e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, HUD_H, WALL, H - HUD_H);
    const grad2 = ctx.createLinearGradient(W - WALL, 0, W, 0);
    grad2.addColorStop(0, '#23262e');
    grad2.addColorStop(0.5, '#48505e');
    grad2.addColorStop(1, '#8a93a5');
    ctx.fillStyle = grad2;
    ctx.fillRect(W - WALL, HUD_H, WALL, H - HUD_H);
    const grad3 = ctx.createLinearGradient(0, HUD_H, 0, HUD_H + WALL);
    grad3.addColorStop(0, '#8a93a5');
    grad3.addColorStop(1, '#23262e');
    ctx.fillStyle = grad3;
    ctx.fillRect(0, HUD_H, W, WALL);
  }

  function drawBricks() {
    for (const b of bricks) {
      const { x, y, w, h } = brickRect(b);
      if (b.type === 'S') {
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, '#e8ecf2');
        g.addColorStop(0.5, '#9aa3b2');
        g.addColorStop(1, '#5d6675');
        ctx.fillStyle = g;
      } else if (b.type === 'G') {
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, '#ffe680');
        g.addColorStop(0.5, '#d4a017');
        g.addColorStop(1, '#8a6508');
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = BRICK_INFO[b.type].color;
      }
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      // ベベル（立体縁取り）
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x + 1, y + 1, w - 2, 2);
      ctx.fillRect(x + 1, y + 1, 2, h - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x + 1, y + h - 3, w - 2, 2);
      ctx.fillRect(x + w - 3, y + 1, 2, h - 2);
      if (b.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${b.flash * 4})`;
        ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
        b.flash -= 1 / 60;
      }
    }
  }

  function drawPaddle() {
    const x = paddle.x - paddle.w / 2, y = PADDLE_Y, w = paddle.w, h = paddle.h;
    const cap = 10;
    // 赤いキャップ（レーザー時は砲身風に上へ突き出す）
    ctx.fillStyle = mode === 'laser' ? '#ff5050' : '#e03030';
    if (mode === 'laser') {
      ctx.fillRect(x, y - 4, cap, h + 4);
      ctx.fillRect(x + w - cap, y - 4, cap, h + 4);
    } else {
      ctx.fillRect(x, y, cap, h);
      ctx.fillRect(x + w - cap, y, cap, h);
    }
    // シルバーの本体
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#f2f5fa');
    g.addColorStop(0.5, '#9aa3b2');
    g.addColorStop(1, '#525a68');
    ctx.fillStyle = g;
    ctx.fillRect(x + cap, y, w - cap * 2, h);
    // 中央の青いライト
    ctx.fillStyle = mode === 'catch' ? '#22cc55' : '#3a7bff';
    ctx.fillRect(x + cap + 3, y + 3, 5, h - 6);
    ctx.fillRect(x + w - cap - 8, y + 3, 5, h - 6);
  }

  function drawBalls() {
    for (const b of balls) {
      const g = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, BALL_R + 1);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.7, '#d8dde6');
      g.addColorStop(1, '#8a93a5');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCapsules(legendX = null, legendY = null, legendType = null) {
    const drawOne = (x, y, type, phase) => {
      const info = CAPSULES[type];
      const w = 28, h = 13;
      // 転がるアニメーション: ハイライト帯が上下に動く
      const t = (Math.sin(phase) + 1) / 2;
      ctx.fillStyle = info.color;
      roundRect(x - w / 2, y - h / 2, w, h, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      roundRect(x - w / 2 + 2, y - h / 2 + 1 + t * 4, w - 4, 3, 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(type, x, y + 1);
    };
    if (legendType) { drawOne(legendX, legendY, legendType, blink * 6); return; }
    for (const c of capsules) drawOne(c.x, c.y, c.type, c.phase);
  }

  function drawLasers() {
    ctx.fillStyle = '#ff5050';
    for (const lz of lasers) {
      ctx.fillRect(lz.x - 2, lz.y - 10, 4, 12);
      ctx.fillStyle = '#ffd0d0';
      ctx.fillRect(lz.x - 1, lz.y - 8, 2, 8);
      ctx.fillStyle = '#ff5050';
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, HUD_H);
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f43030';
    ctx.fillText('1UP', 24, 6);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(score).padStart(7, ' '), 8, 22);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f43030';
    ctx.fillText('HIGH SCORE', W / 2, 6);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(hiScore).padStart(7, ' '), W / 2, 22);
    // ROUND は右下に表示（右上はポーズボタンが重なるため）
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f43030';
    ctx.fillText('ROUND ', W - 50, H - 20);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(round), W - 24, H - 20);
    // 残機（小さなバウス）
    for (let i = 0; i < Math.min(lives, 6); i++) {
      const lx = FIELD.left + 6 + i * 26, ly = H - 12;
      ctx.fillStyle = '#e03030';
      ctx.fillRect(lx, ly, 4, 6);
      ctx.fillRect(lx + 16, ly, 4, 6);
      ctx.fillStyle = '#9aa3b2';
      ctx.fillRect(lx + 4, ly, 12, 6);
    }
  }

  function drawOverlays() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (state === 'intro') {
      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.fillStyle = '#fff';
      if (stateTimer > 1.0 || balls.length === 0) {
        ctx.fillText(`ROUND ${round}`, W / 2, H / 2 - 20);
      }
      ctx.fillStyle = '#ffd600';
      ctx.fillText('READY', W / 2, H / 2 + 16);
    } else if (state === 'clear') {
      ctx.font = 'bold 20px "Courier New", monospace';
      ctx.fillStyle = '#ffd600';
      ctx.fillText('ROUND CLEAR!', W / 2, H / 2 - 10);
    } else if (state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, HUD_H, W, H - HUD_H);
      ctx.font = 'bold 26px "Courier New", monospace';
      ctx.fillStyle = '#f43030';
      ctx.fillText('GAME OVER', W / 2, H / 2 - 20);
      if (blink % 1 < 0.6) {
        ctx.font = 'bold 13px "Courier New", monospace';
        ctx.fillStyle = '#fff';
        ctx.fillText('CLICK / SPACE でタイトルへ', W / 2, H / 2 + 24);
      }
    }
    if (paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, HUD_H, W, H - HUD_H);
      ctx.font = 'bold 22px "Courier New", monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText('PAUSE', W / 2, H / 2);
      ctx.font = 'bold 13px "Courier New", monospace';
      ctx.fillStyle = '#aab';
      ctx.fillText('タップ / P で再開', W / 2, H / 2 + 30);
    }
  }

  function drawTitle() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    // 星空
    for (let i = 0; i < 60; i++) {
      const sx = (i * 73 + 31) % W;
      const sy = (i * 137 + 17) % H;
      const tw = (Math.sin(blink * 2 + i) + 1) / 2;
      ctx.fillStyle = `rgba(180,200,255,${0.15 + tw * 0.4})`;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // ロゴ
    ctx.font = 'bold 44px "Courier New", monospace';
    const lg = ctx.createLinearGradient(0, 130, 0, 190);
    lg.addColorStop(0, '#ff5050');
    lg.addColorStop(0.5, '#ffd600');
    lg.addColorStop(1, '#ff8c00');
    ctx.fillStyle = lg;
    ctx.fillText('BRICK', W / 2, 140);
    ctx.fillText('BREAKER', W / 2, 185);
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillStyle = '#7a86ff';
    ctx.fillText('— ARKANOID STYLE —', W / 2, 222);

    // カプセル説明
    ctx.font = '12px "Courier New", monospace';
    ctx.textAlign = 'left';
    const legends = [
      ['S', 'SLOW    ボールが遅くなる'],
      ['C', 'CATCH   ボールをキャッチ'],
      ['E', 'EXPAND  バウスが大きくなる'],
      ['D', 'DISRUPT ボールが3つに分裂'],
      ['L', 'LASER   レーザーで攻撃'],
      ['B', 'BREAK   次のラウンドへ'],
      ['P', 'PLAYER  残機が1機増える'],
    ];
    legends.forEach(([t, desc], i) => {
      const y = 280 + i * 28;
      drawCapsules(120, y, t);
      ctx.textAlign = 'left';
      ctx.font = '12px "Courier New", monospace';
      ctx.fillStyle = '#aab';
      ctx.fillText(desc, 145, y);
    });

    ctx.textAlign = 'center';
    if (blink % 1 < 0.6) {
      ctx.font = 'bold 16px "Courier New", monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText('CLICK or PRESS SPACE', W / 2, 510);
    }
    ctx.font = '12px "Courier New", monospace';
    ctx.fillStyle = '#667';
    ctx.fillText(`HIGH SCORE ${hiScore}`, W / 2, 550);
    ctx.fillText('© 2026 HOMAGE TO TAITO ARKANOID', W / 2, 585);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ===== メインループ =====
  let lastTime = 0;
  function frame(t) {
    const dt = Math.min(0.033, (t - lastTime) / 1000 || 0.016);
    lastTime = t;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
