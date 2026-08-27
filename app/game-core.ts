export const WORLD_WIDTH = 900;
export const WORLD_HEIGHT = 600;
export const GROUND_HEIGHT = 82;
export const BIRD_X = 235;
export const BIRD_RADIUS = 19;
export const GRAVITY = 760;
export const MAX_THRUST = GRAVITY * 2;

export type GamePhase =
  | 'intro'
  | 'ready'
  | 'countdown'
  | 'playing'
  | 'paused'
  | 'game-over'
  | 'microphone-error';

export type Pipe = {
  x: number;
  gapY: number;
  gapSize: number;
  width: number;
  scored: boolean;
};

export type GameState = {
  birdY: number;
  birdVelocity: number;
  pipes: Pipe[];
  score: number;
  elapsed: number;
  spawnTimer: number;
  isOver: boolean;
};

export function createGame(): GameState {
  return {
    birdY: WORLD_HEIGHT * 0.46,
    birdVelocity: 0,
    pipes: [createPipe(760, 0)],
    score: 0,
    elapsed: 0,
    spawnTimer: 1.9,
    isOver: false,
  };
}

export function difficultyForScore(score: number) {
  return {
    speed: 172 + Math.min(score * 4.5, 70),
    gapSize: 252 - Math.min(score * 3.5, 62),
    spawnEvery: 1.78 - Math.min(score * 0.018, 0.22),
  };
}

export function createPipe(x: number, score: number): Pipe {
  const { gapSize } = difficultyForScore(score);
  const minY = 58 + gapSize / 2;
  const maxY = WORLD_HEIGHT - GROUND_HEIGHT - 48 - gapSize / 2;
  return {
    x,
    gapY: minY + Math.random() * Math.max(1, maxY - minY),
    gapSize,
    width: 78,
    scored: false,
  };
}

export function liftFromNormalizedPitch(normalizedPitch: number) {
  return Math.max(0, Math.min(1, normalizedPitch)) * MAX_THRUST;
}

export function circleIntersectsRect(
  cx: number,
  cy: number,
  radius: number,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const closestX = Math.max(x, Math.min(cx, x + width));
  const closestY = Math.max(y, Math.min(cy, y + height));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

export function stepGame(state: GameState, dt: number, normalizedPitch: number): GameState {
  if (state.isOver) return state;
  const safeDt = Math.min(dt, 1 / 20);
  const next: GameState = {
    ...state,
    elapsed: state.elapsed + safeDt,
    spawnTimer: state.spawnTimer - safeDt,
    pipes: state.pipes.map((pipe) => ({ ...pipe })),
  };

  const acceleration = GRAVITY - liftFromNormalizedPitch(normalizedPitch);
  next.birdVelocity = Math.max(-430, Math.min(470, state.birdVelocity + acceleration * safeDt));
  next.birdY = state.birdY + next.birdVelocity * safeDt;

  const difficulty = difficultyForScore(next.score);
  for (const pipe of next.pipes) pipe.x -= difficulty.speed * safeDt;
  if (next.spawnTimer <= 0) {
    next.pipes.push(createPipe(WORLD_WIDTH + 30, next.score));
    next.spawnTimer += difficulty.spawnEvery;
  }

  for (const pipe of next.pipes) {
    if (!pipe.scored && pipe.x + pipe.width < BIRD_X) {
      pipe.scored = true;
      next.score += 1;
    }
  }
  next.pipes = next.pipes.filter((pipe) => pipe.x + pipe.width > -20);

  const ceilingHit = next.birdY - BIRD_RADIUS <= 0;
  const groundHit = next.birdY + BIRD_RADIUS >= WORLD_HEIGHT - GROUND_HEIGHT;
  const pipeHit = next.pipes.some((pipe) => {
    const gapTop = pipe.gapY - pipe.gapSize / 2;
    const gapBottom = pipe.gapY + pipe.gapSize / 2;
    return (
      circleIntersectsRect(BIRD_X, next.birdY, BIRD_RADIUS, pipe.x, 0, pipe.width, gapTop) ||
      circleIntersectsRect(BIRD_X, next.birdY, BIRD_RADIUS, pipe.x, gapBottom, pipe.width, WORLD_HEIGHT - GROUND_HEIGHT - gapBottom)
    );
  });
  next.isOver = ceilingHit || groundHit || pipeHit;
  return next;
}
