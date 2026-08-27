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
import { analyzeVoiceLevel, followVoicePower, voicePowerFromLevel } from './voice.ts';

test('voice power responds to loudness and clamps safely', () => {
  assert.equal(voicePowerFromLevel(.005), 0);
  assert.ok(voicePowerFromLevel(.05) > .45);
  assert.equal(voicePowerFromLevel(.3), 1);
});

test('midpoint pitch counters gravity', () => {
  assert.equal(liftFromNormalizedPitch(.5), GRAVITY);
  assert.equal(liftFromNormalizedPitch(1), MAX_THRUST);
  assert.equal(liftFromNormalizedPitch(-1), 0);
});

test('voice analyzer accepts short noisy speech-like bursts and rejects silence', () => {
  const burst = new Float32Array(1024);
  for (let i = 0; i < burst.length; i += 1) burst[i] = (Math.sin(i * .21) + Math.sin(i * .47) * .4) * .08;
  const detected = analyzeVoiceLevel(burst, .01, 0);
  assert.equal(detected.active, true);
  assert.ok(detected.level > .04);
  const silence = analyzeVoiceLevel(new Float32Array(1024), .01, 0);
  assert.equal(silence.active, false);
});

test('voice envelope attacks faster than it releases', () => {
  const attack = followVoicePower(0, 1);
  const release = followVoicePower(1, 0);
  assert.ok(attack > .6);
  assert.ok(release > attack);
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
