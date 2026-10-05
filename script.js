const canvas = document.getElementById('game-board');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const highScoreElement = document.getElementById('high-score');
const statusPill = document.getElementById('status-pill');
const startButton = document.getElementById('start-btn');
const pauseButton = document.getElementById('pause-btn');
const resetButton = document.getElementById('reset-btn');
const soundButton = document.getElementById('sound-btn');
const difficultySelect = document.getElementById('difficulty-select');
const directionButtons = document.querySelectorAll('[data-direction]');

const gridSize = 20;
const tileSize = canvas.width / gridSize;
const highScoreKey = 'snake-game-high-score';
const difficultySettings = {
  easy: 180,
  medium: 120,
  hard: 90,
};

let snake;
let direction;
let queuedDirection;
let food;
let score;
let running;
let paused;
let gameLoop;
let animationStep = 0;
let selectedDifficulty = 'medium';
let soundEnabled = true;
let audioContext = null;
let musicInterval = null;

function loadHighScore() {
  const saved = Number(localStorage.getItem(highScoreKey) || 0);
  highScoreElement.textContent = saved;
  return saved;
}

let highScore = loadHighScore();

function setStatus(label, tone = 'neutral') {
  statusPill.textContent = label;
  statusPill.dataset.tone = tone;
}

function setDirection(newDirection) {
  const isOpposite =
    newDirection.x === -direction.x && newDirection.y === -direction.y;

  if (!isOpposite) {
    queuedDirection = newDirection;
  }
}

function ensureAudio() {
  if (!audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    audioContext = new AudioCtor();
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  return audioContext;
}

function playTone(frequency, duration = 0.18, type = 'sine', volume = 0.03) {
  const context = ensureAudio();
  if (!context || !soundEnabled) return;

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gainNode.gain.value = volume;

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);

  oscillator.start();
  oscillator.stop(context.currentTime + duration);

  gainNode.gain.exponentialRampToValueAtTime(
    0.0001,
    context.currentTime + duration,
  );
}

function playFoodSound() {
  playTone(660, 0.1, 'triangle', 0.04);
  setTimeout(() => playTone(880, 0.12, 'triangle', 0.04), 80);
}

function startMusicLoop() {
  if (!soundEnabled) return;

  const melody = [392, 440, 494, 440, 349, 392, 330, 294];
  let step = 0;

  clearInterval(musicInterval);
  musicInterval = setInterval(() => {
    if (!soundEnabled) return;
    playTone(melody[step % melody.length], 0.18, 'sine', 0.018);
    step += 1;
  }, 340);
}

function stopMusicLoop() {
  clearInterval(musicInterval);
  musicInterval = null;
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  soundButton.textContent = soundEnabled ? '🔊' : '🔇';

  if (!soundEnabled) {
    stopMusicLoop();
    if (audioContext && audioContext.state === 'running') {
      audioContext.suspend();
    }
    return;
  }

  ensureAudio();
  if (running) {
    startMusicLoop();
  }
}

function randomFoodPosition() {
  let position;

  do {
    position = {
      x: Math.floor(Math.random() * gridSize),
      y: Math.floor(Math.random() * gridSize),
    };
  } while (snake.some((segment) => segment.x === position.x && segment.y === position.y));

  return position;
}

function resetGame() {
  snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  direction = { x: 1, y: 0 };
  queuedDirection = { x: 1, y: 0 };
  score = 0;
  scoreElement.textContent = score;
  food = randomFoodPosition();
  running = false;
  paused = false;
  clearInterval(gameLoop);
  startButton.textContent = 'Start';
  pauseButton.textContent = 'Pause';
  setStatus('Ready', 'neutral');
  animationStep = 0;
  drawBoard();
}

function updateScore() {
  scoreElement.textContent = score;
  if (score > highScore) {
    highScore = score;
    localStorage.setItem(highScoreKey, String(highScore));
    highScoreElement.textContent = highScore;
  }
  playFoodSound();
}

function drawRoundedRect(x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function drawFood() {
  const cx = food.x * tileSize + tileSize / 2;
  const cy = food.y * tileSize + tileSize / 2;
  const radius = tileSize * 0.34;

  const glow = ctx.createRadialGradient(
    cx - radius * 0.25,
    cy - radius * 0.25,
    4,
    cx,
    cy,
    radius * 2,
  );
  glow.addColorStop(0, '#ffe7ee');
  glow.addColorStop(0.3, '#ff9ab0');
  glow.addColorStop(1, '#ff4d6d');

  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(cx - radius * 0.3, cy - radius * 0.35, radius * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawBodySegment(x, y, angle, index) {
  const segmentLength = tileSize * 0.78;
  const segmentWidth = tileSize * 0.62;
  const sway = Math.sin((animationStep + index * 5) * 0.25) * 0.18;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + sway);

  const gradient = ctx.createLinearGradient(-segmentLength / 2, 0, segmentLength / 2, 0);
  gradient.addColorStop(0, '#7af0b9');
  gradient.addColorStop(0.35, '#3ad39a');
  gradient.addColorStop(0.7, '#1ea974');
  gradient.addColorStop(1, '#0b764d');

  ctx.fillStyle = gradient;
  drawRoundedRect(-segmentLength / 2, -segmentWidth / 2, segmentLength, segmentWidth, segmentWidth / 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  drawRoundedRect(-segmentLength / 2 + 3, -segmentWidth / 2 + 2, segmentLength - 6, segmentWidth * 0.34, segmentWidth / 4);
  ctx.fill();

  ctx.restore();
}

function drawHead() {
  const head = snake[0];
  const headX = head.x * tileSize + tileSize / 2;
  const headY = head.y * tileSize + tileSize / 2;
  const headAngle = Math.atan2(direction.y, direction.x);
  const size = tileSize * 0.82;

  ctx.save();
  ctx.translate(headX, headY);
  ctx.rotate(headAngle);

  const gradient = ctx.createRadialGradient(-size * 0.14, -size * 0.18, 4, 0, 0, size);
  gradient.addColorStop(0, '#b8ffd8');
  gradient.addColorStop(0.4, '#52d89e');
  gradient.addColorStop(1, '#0b8d5d');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.78, size * 0.64, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0e6b4a';
  ctx.beginPath();
  ctx.ellipse(size * 0.42, 0, size * 0.42, size * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-size * 0.18, -size * 0.18, size * 0.14, size * 0.12, 0, 0, Math.PI * 2);
  ctx.ellipse(-size * 0.18, size * 0.18, size * 0.14, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.arc(-size * 0.18, -size * 0.18, size * 0.06, 0, Math.PI * 2);
  ctx.arc(-size * 0.18, size * 0.18, size * 0.06, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0b3b2e';
  ctx.font = `700 ${Math.max(10, size * 0.22)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Lilly', size * 0.2, -size * 0.06);

  ctx.strokeStyle = '#0b764d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(size * 0.65, 0);
  ctx.lineTo(size * 0.92, 0);
  ctx.stroke();

  ctx.restore();
}

function drawSnake() {
  snake.forEach((segment, index) => {
    if (index === 0) {
      drawHead();
      return;
    }

    const currentX = segment.x * tileSize + tileSize / 2;
    const currentY = segment.y * tileSize + tileSize / 2;
    const previous = snake[index - 1];
    const next = snake[index + 1] || segment;
    const startX = previous.x * tileSize + tileSize / 2;
    const startY = previous.y * tileSize + tileSize / 2;
    const endX = next.x * tileSize + tileSize / 2;
    const endY = next.y * tileSize + tileSize / 2;
    const angle = Math.atan2(endY - startY, endX - startX);

    drawBodySegment(currentX, currentY, angle, index);
  });
}

function drawBoard() {
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const boardGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  boardGradient.addColorStop(0, '#05151f');
  boardGradient.addColorStop(1, '#0b1320');
  ctx.fillStyle = boardGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let x = 0; x < gridSize; x += 1) {
    for (let y = 0; y < gridSize; y += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? 'rgba(12, 119, 90, 0.05)' : 'rgba(15, 118, 110, 0.04)';
      ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }

  drawFood();
  drawSnake();
}

function checkCollision(head) {
  const hitsWall =
    head.x < 0 ||
    head.x >= gridSize ||
    head.y < 0 ||
    head.y >= gridSize;

  const hitsSelf = snake.some(
    (segment, index) => index !== snake.length - 1 && segment.x === head.x && segment.y === head.y,
  );

  return hitsWall || hitsSelf;
}

function tick() {
  if (!running) return;

  direction = queuedDirection;
  animationStep += 1;

  const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

  if (checkCollision(head)) {
    running = false;
    paused = false;
    startButton.textContent = 'Try Again';
    pauseButton.textContent = 'Pause';
    setStatus('Game Over', 'danger');
    stopMusicLoop();
    return;
  }

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    score += 1;
    updateScore();
    food = randomFoodPosition();
  } else {
    snake.pop();
  }

  drawBoard();
}

function startGame() {
  if (running) return;

  ensureAudio();
  if (snake.some((segment) => segment.x < 0 || segment.x >= gridSize || segment.y < 0 || segment.y >= gridSize)) {
    resetGame();
  }

  running = true;
  paused = false;
  startButton.textContent = 'Resume';
  pauseButton.textContent = 'Pause';
  setStatus('Running', 'neutral');
  drawBoard();
  clearInterval(gameLoop);
  gameLoop = setInterval(tick, difficultySettings[selectedDifficulty]);

  if (soundEnabled) {
    startMusicLoop();
  }
}

function stopGame() {
  running = false;
  paused = false;
  clearInterval(gameLoop);
  startButton.textContent = 'Start';
  pauseButton.textContent = 'Pause';
  setStatus('Ready', 'neutral');
}

function pauseGame() {
  if (!running) {
    if (paused) {
      startGame();
    }
    return;
  }

  running = false;
  paused = true;
  clearInterval(gameLoop);
  pauseButton.textContent = 'Resume';
  setStatus('Paused', 'warning');
  if (soundEnabled) {
    stopMusicLoop();
  }
}

function handleKeydown(event) {
  const keyMap = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 },
    s: { x: 0, y: 1 },
    a: { x: -1, y: 0 },
    d: { x: 1, y: 0 },
  };

  const newDirection = keyMap[event.key];
  if (newDirection) {
    event.preventDefault();
    if (!running) {
      startGame();
    }
    setDirection(newDirection);
  }
}

startButton.addEventListener('click', () => {
  if (running) return;
  startGame();
});

pauseButton.addEventListener('click', () => {
  if (running) {
    pauseGame();
    return;
  }

  if (paused) {
    startGame();
  }
});

resetButton.addEventListener('click', () => {
  stopGame();
  resetGame();
  stopMusicLoop();
});

soundButton.addEventListener('click', toggleSound);

soundButton.textContent = '🔊';

difficultySelect.addEventListener('change', (event) => {
  selectedDifficulty = event.target.value;
  if (running) {
    clearInterval(gameLoop);
    gameLoop = setInterval(tick, difficultySettings[selectedDifficulty]);
  }
});

directionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const directionMap = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };

    const newDirection = directionMap[button.dataset.direction];
    if (!newDirection) return;

    if (!running) {
      startGame();
    }
    setDirection(newDirection);
  });
});

document.addEventListener('keydown', handleKeydown);

resetGame();
