import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIRD_X,
  GRAVITY,
  GROUND_HEIGHT,
  MAX_THRUST,
  WORLD_HEIGHT,
  createGame,
  createPipe,
  difficultyForScore,
  liftFromNormalizedPitch,
  stepGame,
} from './game-core.ts';
import {
  SENSITIVITY_DEFAULT,
  SENSITIVITY_INITIAL,
  SENSITIVITY_MAX,
  SENSITIVITY_MIN,
  analyzeVoiceLevel,
  createCalibration,
  followVoicePower,
  gainForSensitivity,
  rangeFromCalibration,
  responseExponentForSensitivity,
  voicePowerFromCalibration,
  updateCalibration,
  voicePowerFromLevel,
} from './voice.ts';

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

test('sensitivity gain is monotonic and neutral at the default', () => {
  assert.equal(gainForSensitivity(SENSITIVITY_DEFAULT), 1);
  assert.ok(gainForSensitivity(SENSITIVITY_MAX) > gainForSensitivity(SENSITIVITY_DEFAULT));
  assert.ok(gainForSensitivity(SENSITIVITY_MIN) < gainForSensitivity(SENSITIVITY_DEFAULT));
  for (let step = SENSITIVITY_MIN; step < SENSITIVITY_MAX; step += 1) {
    assert.ok(gainForSensitivity(step + 1) > gainForSensitivity(step));
  }
  assert.equal(gainForSensitivity(99), gainForSensitivity(SENSITIVITY_MAX));
  assert.equal(gainForSensitivity(-4), gainForSensitivity(SENSITIVITY_MIN));
});

test('calibrated range keeps a usable window at every sensitivity', () => {
  const candidates = [
    createCalibration(),
    { noiseFloor: 0.0001, loudRef: 0.0001 },
    { noiseFloor: 9, loudRef: 9 },
    { noiseFloor: 0.02, loudRef: 0.4 },
  ];
  for (const calibration of candidates) {
    for (let step = SENSITIVITY_MIN; step <= SENSITIVITY_MAX; step += 1) {
      const range = rangeFromCalibration(calibration, step);
      assert.ok(range.quiet > 0, 'quiet must stay positive');
      assert.ok(range.loud > range.quiet, 'loud must stay above quiet');
      assert.equal(voicePowerFromLevel(range.quiet, range.quiet, range.loud), 0);
      assert.equal(voicePowerFromLevel(range.loud, range.quiet, range.loud), 1);
    }
  }
});

test('higher sensitivity needs less voice for the same lift', () => {
  const calibration = { noiseFloor: 0.004, loudRef: 0.1 };
  const quietSpeech = 0.02;
  const low = rangeFromCalibration(calibration, 3);
  const high = rangeFromCalibration(calibration, 8);
  assert.ok(high.loud < low.loud);
  assert.ok(
    voicePowerFromLevel(quietSpeech, high.quiet, high.loud) >
      voicePowerFromLevel(quietSpeech, low.quiet, low.loud),
  );
});

test('calibration tracks a sustained shout but shrugs off a transient bang', () => {
  let ambient = createCalibration();
  for (let frame = 0; frame < 300; frame += 1) ambient = updateCalibration(ambient, 0.003, 1 / 60);

  let shouting = ambient;
  for (let frame = 0; frame < 180; frame += 1) shouting = updateCalibration(shouting, 0.09, 1 / 60);
  const shoutRange = rangeFromCalibration(shouting, SENSITIVITY_DEFAULT);
  assert.equal(voicePowerFromLevel(0.09, shoutRange.quiet, shoutRange.loud), 1);
  assert.ok(voicePowerFromLevel(0.003, shoutRange.quiet, shoutRange.loud) === 0);

  let banged = ambient;
  for (let frame = 0; frame < 4; frame += 1) banged = updateCalibration(banged, 0.35, 1 / 60);
  assert.ok(banged.loudRef < ambient.loudRef * 1.5, 'a ~66ms transient must not redefine loud');
});

test('calibration decays back toward the room instead of drifting away', () => {
  let calibration = { noiseFloor: 0.004, loudRef: 0.3 };
  for (let frame = 0; frame < 60 * 30; frame += 1) calibration = updateCalibration(calibration, 0.003, 1 / 60);
  assert.ok(calibration.loudRef < 0.06);
  assert.ok(calibration.noiseFloor >= 0.0015);
});

test('the top of the sensitivity slider keeps buying lift', () => {
  const calibration = { noiseFloor: 0.004, loudRef: 0.1 };
  const softSpeech = 0.012;
  let previous = -1;
  for (let step = SENSITIVITY_MIN; step <= SENSITIVITY_MAX; step += 1) {
    const power = voicePowerFromCalibration(softSpeech, calibration, step);
    assert.ok(power >= previous, 'power must never drop as sensitivity rises');
    previous = power;
  }
  // The regression this guards: shifting the threshold alone saturated against the
  // noise gate, so the last few notches did nothing at all.
  assert.ok(voicePowerFromCalibration(softSpeech, calibration, 10) > voicePowerFromCalibration(softSpeech, calibration, 7));
  assert.equal(voicePowerFromCalibration(softSpeech, calibration, SENSITIVITY_MAX), 1);
});

test('response curve bends toward lift without opening the gate', () => {
  assert.equal(responseExponentForSensitivity(SENSITIVITY_DEFAULT), 1);
  assert.ok(responseExponentForSensitivity(SENSITIVITY_MAX) < 0.5);
  assert.ok(responseExponentForSensitivity(SENSITIVITY_MIN) > 1);
  const calibration = { noiseFloor: 0.004, loudRef: 0.1 };
  for (let step = SENSITIVITY_MIN; step <= SENSITIVITY_MAX; step += 1) {
    const { quiet } = rangeFromCalibration(calibration, step);
    assert.ok(quiet > calibration.noiseFloor, 'the gate must stay above the room at every setting');
    assert.equal(voicePowerFromCalibration(quiet, calibration, step), 0);
    assert.equal(voicePowerFromCalibration(0, calibration, step), 0);
  }
});

test('the starting slider position is easier than neutral', () => {
  assert.ok(SENSITIVITY_INITIAL > SENSITIVITY_DEFAULT);
  assert.ok(SENSITIVITY_INITIAL <= SENSITIVITY_MAX);
  const calibration = { noiseFloor: 0.004, loudRef: 0.1 };
  assert.ok(
    voicePowerFromCalibration(0.022, calibration, SENSITIVITY_INITIAL) >
      voicePowerFromCalibration(0.022, calibration, SENSITIVITY_DEFAULT),
  );
});

test('easier tuning keeps the difficulty ramp fair', () => {
  const start = difficultyForScore(0);
  assert.ok(start.gapSize > 260, 'the opening gap should be forgiving');
  assert.ok(GRAVITY < 700, 'a lighter fall gives the player more reaction time');
  const pipe = createPipe(700, 0);
  assert.ok(pipe.gapY - pipe.gapSize / 2 > 0);
  assert.ok(pipe.gapY + pipe.gapSize / 2 < WORLD_HEIGHT - GROUND_HEIGHT);
});
