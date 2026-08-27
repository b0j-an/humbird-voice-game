import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIRD_X,
  GRAVITY,
  MAX_THRUST,
  WORLD_HEIGHT,
  createGame,
  difficultyForScore,
  liftFromNormalizedPitch,
  stepGame,
} from './game-core.ts';
import { analyzePitch, normalizePitch, semitoneDistance } from './pitch.ts';

test('pitch range is logarithmic and clamped', () => {
  const profile = { lowFrequency: 100, highFrequency: 400, noiseThreshold: .01 };
  assert.equal(normalizePitch(50, profile), 0);
  assert.ok(Math.abs(normalizePitch(200, profile) - .5) < .0001);
  assert.equal(normalizePitch(800, profile), 1);
  assert.ok(Math.abs(semitoneDistance(220, 440) - 12) < .0001);
});

test('midpoint pitch counters gravity', () => {
  assert.equal(liftFromNormalizedPitch(.5), GRAVITY);
  assert.equal(liftFromNormalizedPitch(1), MAX_THRUST);
  assert.equal(liftFromNormalizedPitch(-1), 0);
});

test('pitch detector finds steady tones and rejects silence', () => {
  const sampleRate = 48_000;
  const tone = new Float32Array(2048);
  for (let i = 0; i < tone.length; i += 1) tone[i] = Math.sin(2 * Math.PI * 220 * i / sampleRate) * .35;
  const detected = analyzePitch(tone, sampleRate, .01, 0);
  assert.equal(detected.voiced, true);
  assert.ok(detected.frequency !== null && Math.abs(detected.frequency - 220) < 3, `detected ${detected.frequency}`);
  const silence = analyzePitch(new Float32Array(2048), sampleRate, .01, 0);
  assert.equal(silence.voiced, false);
});

test('difficulty increases without becoming unfair', () => {
  const start = difficultyForScore(0);
  const later = difficultyForScore(100);
  assert.ok(later.speed > start.speed);
  assert.ok(later.gapSize < start.gapSize);
  assert.ok(later.gapSize >= 190);
  assert.ok(later.spawnEvery >= 1.56);
});

test('silence falls, high pitch rises, and ground collision ends a run', () => {
  const falling = createGame(); falling.pipes = []; falling.birdVelocity = 0;
  const afterFall = stepGame(falling, 1 / 60, 0);
  assert.ok(afterFall.birdVelocity > 0);
  const rising = createGame(); rising.pipes = []; rising.birdVelocity = 0;
  const afterRise = stepGame(rising, 1 / 60, 1);
  assert.ok(afterRise.birdVelocity < 0);
  const ground = createGame(); ground.pipes = []; ground.birdY = WORLD_HEIGHT - 90;
  assert.equal(stepGame(ground, .05, 0).isOver, true);
});

test('passing a gate scores once and touching a pipe collides', () => {
  const scoring = createGame();
  scoring.birdY = 300;
  scoring.pipes = [{ x: BIRD_X - 77, gapY: 300, gapSize: 250, width: 78, scored: false }];
  const scored = stepGame(scoring, 1 / 60, .5);
  assert.equal(scored.score, 1);
  assert.equal(stepGame(scored, 1 / 60, .5).score, 1);
  const collision = createGame();
  collision.birdY = 70;
  collision.pipes = [{ x: BIRD_X - 20, gapY: 350, gapSize: 180, width: 78, scored: false }];
  assert.equal(stepGame(collision, 1 / 120, .5).isOver, true);
});
