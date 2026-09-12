export type VoiceSample = {
  level: number;
  peak: number;
  decibels: number;
  timestamp: number;
  active: boolean;
};

export function analyzeVoiceLevel(samples: Float32Array, noiseFloor = 0.008, timestamp = performance.now()): VoiceSample {
  let energy = 0;
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const absolute = Math.abs(samples[index]);
    energy += samples[index] * samples[index];
    if (absolute > peak) peak = absolute;
  }
  const level = Math.sqrt(energy / samples.length);
  const decibels = 20 * Math.log10(Math.max(level, 0.00001));
  return { level, peak, decibels, timestamp, active: level >= noiseFloor };
}

export function voicePowerFromLevel(level: number, quietLevel = 0.01, loudLevel = 0.14) {
  if (level <= quietLevel) return 0;
  const quietDb = Math.log10(quietLevel);
  const loudDb = Math.log10(loudLevel);
  const normalized = (Math.log10(level) - quietDb) / (loudDb - quietDb);
  return Math.max(0, Math.min(1, normalized));
}

export function followVoicePower(current: number, target: number) {
  const coefficient = target > current ? 0.62 : 0.28;
  const next = current + (target - current) * coefficient;
  return next < 0.01 ? 0 : next;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const SENSITIVITY_MIN = 1;
export const SENSITIVITY_MAX = 15;
export const SENSITIVITY_DEFAULT = 5;
/** Where the slider starts for a new player. Deliberately above neutral: most
 * built-in laptop mics are quiet, and a too-heavy bird is the worse first run. */
export const SENSITIVITY_INITIAL = 8;

/** Manual trim on top of auto-calibration. 5 is neutral, 15 lets a whisper fly, 1 demands a shout. */
export function gainForSensitivity(sensitivity: number) {
  const clamped = clamp(sensitivity, SENSITIVITY_MIN, SENSITIVITY_MAX);
  return Math.pow(2, (clamped - SENSITIVITY_DEFAULT) / 2.5);
}

/**
 * Shifting the loud threshold alone runs out of road: it eventually collides with
 * the noise gate and extra sensitivity stops doing anything. This curve bends the
 * response instead, so the top of the slider keeps giving more lift for the same
 * voice without ever opening the gate onto room noise.
 */
export function responseExponentForSensitivity(sensitivity: number) {
  const clamped = clamp(sensitivity, SENSITIVITY_MIN, SENSITIVITY_MAX);
  return clamp(Math.pow(0.9, clamped - SENSITIVITY_DEFAULT), 0.3, 2);
}

export type VoiceCalibration = { noiseFloor: number; loudRef: number };
export type VoiceRange = { quiet: number; loud: number };

const NOISE_FLOOR_MIN = 0.0015;
const NOISE_FLOOR_MAX = 0.03;
const LOUD_REF_MIN = 0.02;
const LOUD_REF_MAX = 0.5;

export function createCalibration(): VoiceCalibration {
  return { noiseFloor: 0.004, loudRef: 0.06 };
}

/**
 * Tracks the room's noise floor and the player's own loudest voice, so the same
 * shout maps to full lift on a quiet headset and on a distant laptop mic alike.
 * The loud reference rises slowly on purpose: a cough or a door slam must not
 * redefine "loud" and leave the player underpowered for the next few seconds.
 */
export function updateCalibration(calibration: VoiceCalibration, level: number, dt: number): VoiceCalibration {
  const step = clamp(dt, 0, 0.25);
  const towards = (current: number, target: number, seconds: number) =>
    current + (target - current) * (1 - Math.exp(-step / seconds));

  const drifted =
    level < calibration.noiseFloor
      ? towards(calibration.noiseFloor, level, 0.4)
      : level < calibration.noiseFloor * 3
        ? towards(calibration.noiseFloor, level, 8)
        : calibration.noiseFloor;
  const noiseFloor = clamp(drifted, NOISE_FLOOR_MIN, NOISE_FLOOR_MAX);

  const resting = Math.max(noiseFloor * 8, LOUD_REF_MIN);
  const tracked =
    level > calibration.loudRef
      ? towards(calibration.loudRef, level, 1.8)
      : towards(calibration.loudRef, resting, 9);
  const loudRef = clamp(tracked, LOUD_REF_MIN, LOUD_REF_MAX);

  return { noiseFloor, loudRef };
}

export function rangeFromCalibration(calibration: VoiceCalibration, sensitivity: number): VoiceRange {
  const gain = gainForSensitivity(sensitivity);
  // The gate has to stay above the room, but it can hug the floor more closely
  // as sensitivity rises — that is what buys headroom at the top of the slider.
  const quietMultiplier = clamp(2.2 / Math.pow(gain, 0.25), 1.3, 2.6);
  const quiet = clamp(calibration.noiseFloor * quietMultiplier, 0.002, 0.05);
  const loud = clamp((calibration.loudRef * 0.72) / gain, quiet * 1.5, 0.6);
  return { quiet, loud };
}

/** Single entry point the game loop uses: gate, normalize, then bend the response. */
export function voicePowerFromCalibration(level: number, calibration: VoiceCalibration, sensitivity: number) {
  const { quiet, loud } = rangeFromCalibration(calibration, sensitivity);
  const normalized = voicePowerFromLevel(level, quiet, loud);
  if (normalized <= 0) return 0;
  return clamp(Math.pow(normalized, responseExponentForSensitivity(sensitivity)), 0, 1);
}
