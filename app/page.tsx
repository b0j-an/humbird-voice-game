'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BIRD_X,
  GROUND_HEIGHT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  createGame,
  stepGame,
  type GamePhase,
  type GameState,
} from './game-core';
import { analyzePitch, median, normalizePitch, semitoneDistance, type CalibrationProfile, type PitchSample } from './pitch';

type AudioRig = {
  stream: MediaStream;
  context: AudioContext;
  analyser: AnalyserNode;
  samples: Float32Array<ArrayBuffer>;
};

type Capture = { kind: 'low' | 'high'; startedAt: number; samples: number[] };

const initialPitch: PitchSample = { frequency: null, confidence: 0, level: 0, timestamp: 0, voiced: false };

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(255,253,244,.88)';
  ctx.strokeStyle = '#172d35';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-72, 22);
  ctx.bezierCurveTo(-75, -7, -42, -15, -27, 0);
  ctx.bezierCurveTo(-20, -45, 39, -49, 49, -5);
  ctx.bezierCurveTo(81, -5, 90, 24, 65, 32);
  ctx.lineTo(-57, 32);
  ctx.bezierCurveTo(-70, 32, -75, 28, -72, 22);
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}

function drawPipe(ctx: CanvasRenderingContext2D, x: number, gapY: number, gapSize: number, width: number) {
  const capHeight = 30;
  const gapTop = gapY - gapSize / 2;
  const gapBottom = gapY + gapSize / 2;
  const fill = ctx.createLinearGradient(x, 0, x + width, 0);
  fill.addColorStop(0, '#397657'); fill.addColorStop(.22, '#67b972'); fill.addColorStop(.68, '#4b9f65'); fill.addColorStop(1, '#295a45');
  ctx.fillStyle = fill; ctx.strokeStyle = '#172d35'; ctx.lineWidth = 4;
  ctx.fillRect(x, 0, width, gapTop - capHeight); ctx.strokeRect(x, -4, width, gapTop - capHeight + 4);
  roundedRect(ctx, x - 10, gapTop - capHeight, width + 20, capHeight, 4); ctx.fill(); ctx.stroke();
  ctx.fillRect(x, gapBottom + capHeight, width, WORLD_HEIGHT - GROUND_HEIGHT - gapBottom - capHeight); ctx.strokeRect(x, gapBottom + capHeight, width, WORLD_HEIGHT - GROUND_HEIGHT - gapBottom - capHeight + 4);
  roundedRect(ctx, x - 10, gapBottom, width + 20, capHeight, 4); ctx.fill(); ctx.stroke();
}

function drawBird(ctx: CanvasRenderingContext2D, y: number, velocity: number, lift: number, now: number) {
  const angle = Math.max(-.35, Math.min(.55, velocity / 650));
  ctx.save(); ctx.translate(BIRD_X, y); ctx.rotate(angle);
  for (let i = 4; i >= 1; i -= 1) {
    ctx.globalAlpha = .08 * i;
    ctx.fillStyle = i % 2 ? '#ff7b38' : '#fff7df';
    ctx.beginPath(); ctx.arc(-28 - i * 17, Math.sin(now / 180 + i) * 8, 4 + i, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#172d35'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(0, 0, 29, 23, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const flap = Math.sin(now / (lift > .05 ? 70 : 130)) * .45;
  ctx.save(); ctx.translate(-15, 6); ctx.rotate(flap);
  ctx.fillStyle = '#ff7b38'; ctx.beginPath(); ctx.ellipse(-8, 7, 22, 11, .3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
  ctx.fillStyle = '#fffdf4'; ctx.beginPath(); ctx.ellipse(14, -8, 7, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#172d35'; ctx.beginPath(); ctx.arc(16, -8, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff7b38'; ctx.beginPath(); ctx.moveTo(27, -1); ctx.lineTo(48, 4); ctx.lineTo(27, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawGame(canvas: HTMLCanvasElement, game: GameState, lift: number, now: number, phase: GamePhase) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(width / WORLD_WIDTH, 0, 0, height / WORLD_HEIGHT, 0, 0);
  const sky = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  sky.addColorStop(0, '#8bdced'); sky.addColorStop(.72, '#bdebf0'); sky.addColorStop(.73, '#eaf1ae'); sky.addColorStop(1, '#89c866');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  const cloudOffset = phase === 'playing' ? (game.elapsed * 18) % 1100 : 0;
  drawCloud(ctx, 110 - cloudOffset % 1000, 110, .85); drawCloud(ctx, 580 - cloudOffset * .6 % 1100, 165, 1.05); drawCloud(ctx, 980 - cloudOffset % 1100, 78, .65);
  for (const pipe of game.pipes) drawPipe(ctx, pipe.x, pipe.gapY, pipe.gapSize, pipe.width);
  ctx.fillStyle = '#6caf59'; ctx.fillRect(0, WORLD_HEIGHT - GROUND_HEIGHT, WORLD_WIDTH, GROUND_HEIGHT);
  ctx.strokeStyle = '#172d35'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, WORLD_HEIGHT - GROUND_HEIGHT); ctx.lineTo(WORLD_WIDTH, WORLD_HEIGHT - GROUND_HEIGHT); ctx.stroke();
  ctx.globalAlpha = .18; ctx.strokeStyle = '#285c47'; ctx.lineWidth = 3;
  for (let x = -30; x < WORLD_WIDTH; x += 62) { ctx.beginPath(); ctx.moveTo(x, WORLD_HEIGHT); ctx.lineTo(x + 46, WORLD_HEIGHT - GROUND_HEIGHT); ctx.stroke(); }
  ctx.globalAlpha = 1;
  drawBird(ctx, game.birdY, game.birdVelocity, lift, now);
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioRig | null>(null);
  const gameRef = useRef<GameState>(createGame());
  const phaseRef = useRef<GamePhase>('intro');
  const profileRef = useRef<CalibrationProfile | null>(null);
  const captureRef = useRef<Capture | null>(null);
  const finishCaptureRef = useRef<(capture: Capture) => void>(() => undefined);
  const liftRef = useRef(0);
  const lastVoicedRef = useRef(0);
  const lastUiRef = useRef(0);
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [pitch, setPitch] = useState<PitchSample>(initialPitch);
  const [micOn, setMicOn] = useState(false);
  const [liftPercent, setLiftPercent] = useState(0);
  const [profile, setProfile] = useState<CalibrationProfile | null>(null);
  const [lowFrequency, setLowFrequency] = useState<number | null>(null);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [error, setError] = useState('');

  const changePhase = useCallback((next: GamePhase) => { phaseRef.current = next; setPhase(next); }, []);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem('humbird-high-score') || 0);
    const loadScore = window.setTimeout(() => { if (Number.isFinite(stored)) setHighScore(stored); }, 0);
    return () => {
      window.clearTimeout(loadScore);
      const rig = audioRef.current;
      rig?.stream.getTracks().forEach((track) => track.stop());
      if (rig && rig.context.state !== 'closed') void rig.context.close();
    };
  }, []);

  const stopMicrophone = useCallback(() => {
    const rig = audioRef.current;
    rig?.stream.getTracks().forEach((track) => track.stop());
    if (rig && rig.context.state !== 'closed') void rig.context.close();
    audioRef.current = null; profileRef.current = null; captureRef.current = null; liftRef.current = 0;
    setMicOn(false); setLiftPercent(0); setProfile(null); setLowFrequency(null); setPitch(initialPitch); setError(''); changePhase('intro');
  }, [changePhase]);

  const enableMicrophone = useCallback(async () => {
    setError('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Microphone access needs a supported browser on HTTPS or localhost.'); changePhase('microphone-error'); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      const context = new AudioContext({ latencyHint: 'interactive' });
      await context.resume();
      const analyser = context.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = .05;
      context.createMediaStreamSource(stream).connect(analyser);
      audioRef.current = { stream, context, analyser, samples: new Float32Array(analyser.fftSize) };
      setMicOn(true);
      changePhase('calibration-low');
    } catch (reason) {
      const name = reason instanceof DOMException ? reason.name : '';
      const message = name === 'NotAllowedError' ? 'Microphone permission was denied. Allow access in your browser, then try again.' : name === 'NotFoundError' ? 'No microphone was found. Connect one and try again.' : 'The microphone could not start. Check that another app is not using it, then retry.';
      setError(message); changePhase('microphone-error');
    }
  }, [changePhase]);

  const finishCapture = useCallback((capture: Capture) => {
    setCaptureProgress(0);
    if (capture.samples.length < 12) {
      setError('I could not hear a steady note. Move closer to the microphone and hold the sound a little longer.'); return;
    }
    const frequency = median(capture.samples);
    if (capture.kind === 'low') {
      setLowFrequency(frequency); setError(''); changePhase('calibration-high'); return;
    }
    if (!lowFrequency || frequency <= lowFrequency || semitoneDistance(lowFrequency, frequency) < 4) {
      setError('Your high note needs to be at least four semitones above the low note. Try a brighter, comfortable note.'); return;
    }
    const nextProfile = { lowFrequency, highFrequency: frequency, noiseThreshold: .012 };
    profileRef.current = nextProfile; setProfile(nextProfile); setError(''); changePhase('ready');
  }, [changePhase, lowFrequency]);
  useEffect(() => { finishCaptureRef.current = finishCapture; }, [finishCapture]);

  const captureNote = useCallback((kind: 'low' | 'high') => {
    const rig = audioRef.current;
    if (!rig) return;
    void rig.context.resume(); setError(''); setCaptureProgress(.01);
    captureRef.current = { kind, startedAt: performance.now(), samples: [] };
  }, []);

  const startFlight = useCallback(() => {
    gameRef.current = createGame(); liftRef.current = 0; setScore(0); setCountdown(3); changePhase('countdown');
  }, [changePhase]);

  useEffect(() => {
    if (phase !== 'countdown') return;
    const timer = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) { window.clearInterval(timer); gameRef.current = createGame(); changePhase('playing'); return 0; }
        return current - 1;
      });
    }, 850);
    return () => window.clearInterval(timer);
  }, [phase, changePhase]);

  useEffect(() => {
    const pause = () => { if (phaseRef.current === 'playing') changePhase('paused'); };
    const visibility = () => { if (document.hidden) pause(); };
    window.addEventListener('blur', pause); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', visibility); };
  }, [changePhase]);

  useEffect(() => {
    let frame = 0; let previous = performance.now(); let accumulator = 0;
    const loop = (now: number) => {
      const dt = Math.min((now - previous) / 1000, .05); previous = now;
      const rig = audioRef.current;
      let sample = initialPitch;
      if (rig) {
        if (rig.context.state === 'suspended' && phaseRef.current === 'playing') changePhase('paused');
        rig.analyser.getFloatTimeDomainData(rig.samples);
        sample = analyzePitch(rig.samples, rig.context.sampleRate, profileRef.current?.noiseThreshold ?? .012, now);
        if (sample.voiced && sample.frequency) {
          lastVoicedRef.current = now;
          if (profileRef.current) {
            const target = normalizePitch(sample.frequency, profileRef.current);
            liftRef.current += (target - liftRef.current) * .24;
          }
        } else if (now - lastVoicedRef.current > 80) {
          liftRef.current *= Math.max(0, 1 - dt / .12);
        }
        if (now - lastUiRef.current > 70) { setPitch(sample); setLiftPercent(Math.round(liftRef.current * 100)); lastUiRef.current = now; }
        const capture = captureRef.current;
        if (capture) {
          const elapsed = now - capture.startedAt;
          setCaptureProgress(Math.min(1, elapsed / 1500));
          if (sample.voiced && sample.frequency && sample.confidence >= .72) capture.samples.push(sample.frequency);
          if (elapsed >= 1500) { captureRef.current = null; finishCaptureRef.current(capture); }
        }
      }
      if (phaseRef.current === 'playing') {
        accumulator += dt;
        while (accumulator >= 1 / 120) { gameRef.current = stepGame(gameRef.current, 1 / 120, liftRef.current); accumulator -= 1 / 120; }
        setScore(gameRef.current.score);
        if (gameRef.current.isOver) {
          const finalScore = gameRef.current.score;
          setHighScore((current) => { const best = Math.max(current, finalScore); window.localStorage.setItem('humbird-high-score', String(best)); return best; });
          changePhase('game-over');
        }
      } else accumulator = 0;
      if (canvasRef.current) drawGame(canvasRef.current, gameRef.current, liftRef.current, now, phaseRef.current);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [changePhase]);

  const levelPercent = Math.min(100, Math.round(pitch.level * 1200));
  const rangeLabel = profile ? `${Math.round(profile.lowFrequency)}–${Math.round(profile.highFrequency)} Hz` : 'Not calibrated';

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="wordmark" href="#game" aria-label="HumBird home">HUM<span>BIRD</span></a>
        <p>Voice-controlled sky arcade</p>
        <div className="header-actions">
          <div className={`mic-pill ${micOn ? 'is-on' : ''}`}><i /> {micOn ? 'MIC LIVE' : 'MIC OFF'}</div>
          {micOn && <button className="text-button" type="button" onClick={stopMicrophone}>Stop mic</button>}
        </div>
      </header>

      <section className="hero" id="game">
        <div className="hero-copy">
          <p className="eyebrow">YOUR VOICE. YOUR WINGS.</p>
          <h1>Hum high.<br />Fly <em>higher.</em></h1>
          <p className="lede">Guide a tiny bird through a very big sky using nothing but the pitch of your voice.</p>
          {phase === 'intro' && <button className="primary-button" type="button" onClick={enableMicrophone}><span className="button-icon">●</span>Enable microphone<span aria-hidden="true">↗</span></button>}
          {phase === 'microphone-error' && <button className="primary-button" type="button" onClick={enableMicrophone}><span className="button-icon">↻</span>Try microphone again<span aria-hidden="true">↗</span></button>}
          {micOn && phase !== 'intro' && phase !== 'microphone-error' && <div className="range-summary"><span>YOUR RANGE</span><strong>{rangeLabel}</strong><small>Higher pitch = stronger lift</small></div>}
          <p className="privacy">Audio is analyzed on this device. Nothing is recorded or uploaded.</p>
        </div>

        <div className="game-frame">
          <canvas ref={canvasRef} className="game-canvas" aria-label="HumBird voice-controlled game field" />
          <div className="score-hud" aria-live="polite"><span>SCORE</span><strong>{score}</strong><small>BEST {highScore}</small></div>
          <div className="pitch-card" aria-live="polite">
            <span>LIVE PITCH</span><strong>{pitch.voiced && pitch.frequency ? `${Math.round(pitch.frequency)} Hz` : '— Hz'}</strong>
            <div className="level-track" title="Microphone input level"><i style={{ width: `${levelPercent}%` }} /></div>
            <div className="pitch-scale"><i className={liftPercent > 5 ? 'active' : ''}/><i className={liftPercent > 25 ? 'active' : ''}/><i className={liftPercent > 45 ? 'active' : ''}/><i className={liftPercent > 65 ? 'active' : ''}/><i className={liftPercent > 85 ? 'active' : ''}/></div>
            <small>LOW <b>HOVER</b> HIGH</small>
          </div>

          <div className={`game-overlay ${phase === 'playing' ? 'is-hidden' : ''}`}>
            {phase === 'intro' && <div className="game-panel compact"><span className="panel-step">READY WHEN YOU ARE</span><h2>First, meet your mic.</h2><p>Enable it to teach HumBird your comfortable vocal range.</p></div>}
            {(phase === 'calibration-low' || phase === 'calibration-high') && <div className="game-panel">
              <span className="panel-step">CALIBRATION · {phase === 'calibration-low' ? '1 OF 2' : '2 OF 2'}</span>
              <h2>{phase === 'calibration-low' ? 'Hum a comfy low note.' : 'Now hum a comfy high note.'}</h2>
              <p>Use “mmm,” “oo,” or “ah.” Keep it steady and comfortable—never strain.</p>
              <div className="capture-visual"><i style={{ width: `${captureProgress * 100}%` }} /></div>
              <button className="panel-button" type="button" onClick={() => captureNote(phase === 'calibration-low' ? 'low' : 'high')} disabled={captureProgress > 0}>{captureProgress > 0 ? 'Listening…' : `Capture ${phase === 'calibration-low' ? 'low' : 'high'} note`}</button>
              {error && <p className="inline-error" role="alert">{error}</p>}
            </div>}
            {phase === 'ready' && <div className="game-panel"><span className="panel-step">CALIBRATION COMPLETE</span><h2>Your wings are tuned.</h2><p>Low notes let you descend. Your midpoint hovers. High notes lift you toward the clouds.</p><button className="panel-button" type="button" onClick={startFlight}>Start flight</button></div>}
            {phase === 'countdown' && <div className="countdown" aria-live="assertive">{countdown || 'GO'}</div>}
            {phase === 'paused' && <div className="game-panel compact"><span className="panel-step">FLIGHT PAUSED</span><h2>Catch your breath.</h2><p>The game pauses whenever this tab loses focus.</p><button className="panel-button" type="button" onClick={startFlight}>Restart flight</button></div>}
            {phase === 'game-over' && <div className="game-panel game-over-panel"><span className="panel-step">FLIGHT COMPLETE</span><h2>{score > 0 ? 'Beautiful flying.' : 'Almost airborne!'}</h2><div className="final-score"><span>Score <b>{score}</b></span><span>Best <b>{highScore}</b></span></div><button className="panel-button" type="button" onClick={startFlight}>Fly again</button></div>}
            {phase === 'microphone-error' && <div className="game-panel compact"><span className="panel-step error-step">MICROPHONE NEEDED</span><h2>We cannot hear you yet.</h2><p role="alert">{error}</p></div>}
          </div>
        </div>
      </section>

      <section className="how-it-works" aria-label="How to play">
        <article><span>01</span><h2>Find your range</h2><p>Hum one comfortable low note, then one comfortable high note.</p></article>
        <article><span>02</span><h2>Shape your flight</h2><p>Higher pitch adds lift. Lower pitch eases down. Silence lets gravity take over.</p></article>
        <article><span>03</span><h2>Thread the sky</h2><p>Pass every gate, build your score, and keep your longest flight alive.</p></article>
      </section>
    </main>
  );
}
