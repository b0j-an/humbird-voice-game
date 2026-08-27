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
