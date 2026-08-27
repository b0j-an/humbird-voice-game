export type PitchSample = {
  frequency: number | null;
  confidence: number;
  level: number;
  timestamp: number;
  voiced: boolean;
};

export type CalibrationProfile = {
  lowFrequency: number;
  highFrequency: number;
  noiseThreshold: number;
};

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function semitoneDistance(low: number, high: number) {
  return 12 * Math.log2(high / low);
}

export function normalizePitch(frequency: number, profile: CalibrationProfile) {
  const low = Math.log2(profile.lowFrequency);
  const high = Math.log2(profile.highFrequency);
  if (high <= low) return 0;
  return Math.max(0, Math.min(1, (Math.log2(frequency) - low) / (high - low)));
}

export function analyzePitch(
  samples: Float32Array,
  sampleRate: number,
  noiseThreshold = 0.012,
  timestamp = performance.now(),
): PitchSample {
  let energy = 0;
  for (let i = 0; i < samples.length; i += 1) energy += samples[i] * samples[i];
  const level = Math.sqrt(energy / samples.length);
  if (level < noiseThreshold) return { frequency: null, confidence: 0, level, timestamp, voiced: false };

  const minFrequency = 70;
  const maxFrequency = 1000;
  const minTau = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const maxTau = Math.min(Math.floor(sampleRate / minFrequency), Math.floor(samples.length / 2));
  const difference = new Float32Array(maxTau + 1);
  const cumulative = new Float32Array(maxTau + 1);

  for (let tau = 1; tau <= maxTau; tau += 1) {
    let sum = 0;
    const limit = samples.length - tau;
    for (let i = 0; i < limit; i += 1) {
      const delta = samples[i] - samples[i + tau];
      sum += delta * delta;
    }
    difference[tau] = sum;
  }

  cumulative[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= maxTau; tau += 1) {
    runningSum += difference[tau];
    cumulative[tau] = runningSum === 0 ? 1 : (difference[tau] * tau) / runningSum;
  }

  let bestTau = -1;
  const threshold = 0.16;
  for (let tau = minTau; tau < maxTau; tau += 1) {
    if (cumulative[tau] < threshold) {
      while (tau + 1 <= maxTau && cumulative[tau + 1] < cumulative[tau]) tau += 1;
      bestTau = tau;
      break;
    }
  }
  if (bestTau < 0) {
    let bestValue = 1;
    for (let tau = minTau; tau <= maxTau; tau += 1) {
      if (cumulative[tau] < bestValue) { bestValue = cumulative[tau]; bestTau = tau; }
    }
  }

  const confidence = bestTau > 0 ? 1 - cumulative[bestTau] : 0;
  if (bestTau <= 0 || confidence < 0.68) return { frequency: null, confidence, level, timestamp, voiced: false };
  const left = cumulative[Math.max(minTau, bestTau - 1)];
  const center = cumulative[bestTau];
  const right = cumulative[Math.min(maxTau, bestTau + 1)];
  const denominator = 2 * (2 * center - right - left);
  const refinedTau = denominator === 0 ? bestTau : bestTau + (right - left) / denominator;
  const frequency = sampleRate / refinedTau;
  return { frequency, confidence, level, timestamp, voiced: frequency >= minFrequency && frequency <= maxFrequency };
}
