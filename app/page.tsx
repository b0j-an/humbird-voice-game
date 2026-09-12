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
import {
  SENSITIVITY_INITIAL,
  SENSITIVITY_MAX,
  SENSITIVITY_MIN,
  analyzeVoiceLevel,
  createCalibration,
  followVoicePower,
  rangeFromCalibration,
  updateCalibration,
  voicePowerFromCalibration,
  type VoiceRange,
  type VoiceSample,
} from './voice';

type AudioRig = {
  stream: MediaStream;
  context: AudioContext;
  analyser: AnalyserNode;
  samples: Float32Array<ArrayBuffer>;
};

const initialVoice: VoiceSample = { level: 0, peak: 0, decibels: -100, timestamp: 0, active: false };

type FullscreenTarget = HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type LockableOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> };

function nativeFullscreenElement() {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

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
  const frameRef = useRef<HTMLDivElement>(null);
  // iOS Safari refuses element fullscreen, so we fall back to a fixed-position
  // layer. This tracks that we are in the fallback, since the browser will not.
  const immersiveRef = useRef(false);
  const audioRef = useRef<AudioRig | null>(null);
  const gameRef = useRef<GameState>(createGame());
  const phaseRef = useRef<GamePhase>('intro');
  const liftRef = useRef(0);
  const lastUiRef = useRef(0);
  const calibrationRef = useRef(createCalibration());
  const sensitivityRef = useRef(SENSITIVITY_INITIAL);
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [voice, setVoice] = useState<VoiceSample>(initialVoice);
  const [micOn, setMicOn] = useState(false);
  const [liftPercent, setLiftPercent] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sensitivity, setSensitivity] = useState(SENSITIVITY_INITIAL);
  const [range, setRange] = useState<VoiceRange>(() => rangeFromCalibration(createCalibration(), SENSITIVITY_INITIAL));

  const changePhase = useCallback((next: GamePhase) => { phaseRef.current = next; setPhase(next); }, []);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem('humbird-high-score') || 0);
    const storedSensitivity = Number(window.localStorage.getItem('humbird-sensitivity'));
    const loadScore = window.setTimeout(() => {
      if (Number.isFinite(stored)) setHighScore(stored);
      if (Number.isFinite(storedSensitivity) && storedSensitivity >= SENSITIVITY_MIN && storedSensitivity <= SENSITIVITY_MAX) {
        sensitivityRef.current = storedSensitivity;
        setSensitivity(storedSensitivity);
      }
    }, 0);
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
    audioRef.current = null; liftRef.current = 0; calibrationRef.current = createCalibration();
    setMicOn(false); setLiftPercent(0); setVoice(initialVoice); setError(''); changePhase('intro');
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
      const analyser = context.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0;
      context.createMediaStreamSource(stream).connect(analyser);
      audioRef.current = { stream, context, analyser, samples: new Float32Array(analyser.fftSize) };
      calibrationRef.current = createCalibration();
      setMicOn(true);
      changePhase('ready');
    } catch (reason) {
      const name = reason instanceof DOMException ? reason.name : '';
      const message = name === 'NotAllowedError' ? 'Microphone permission was denied. Allow access in your browser, then try again.' : name === 'NotFoundError' ? 'No microphone was found. Connect one and try again.' : 'The microphone could not start. Check that another app is not using it, then retry.';
      setError(message); changePhase('microphone-error');
    }
  }, [changePhase]);

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
      let sample = initialVoice;
      if (rig) {
        if (rig.context.state === 'suspended' && phaseRef.current === 'playing') changePhase('paused');
        rig.analyser.getFloatTimeDomainData(rig.samples);
        const phaseNow = phaseRef.current;
        const listening = phaseNow === 'ready' || phaseNow === 'countdown' || phaseNow === 'playing';
        const measured = analyzeVoiceLevel(rig.samples, calibrationRef.current.noiseFloor, now);
        if (listening) calibrationRef.current = updateCalibration(calibrationRef.current, measured.level, dt);
        const voiceRange = rangeFromCalibration(calibrationRef.current, sensitivityRef.current);
        // Report the gate the game actually uses, so the meter cannot read "silent"
        // while the same input is producing lift.
        sample = { ...measured, active: measured.level > voiceRange.quiet };
        const targetPower = voicePowerFromCalibration(measured.level, calibrationRef.current, sensitivityRef.current);
        liftRef.current = followVoicePower(liftRef.current, targetPower);
        if (now - lastUiRef.current > 45) { setVoice(sample); setLiftPercent(Math.round(liftRef.current * 100)); setRange(voiceRange); lastUiRef.current = now; }
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

  const levelPercent = Math.min(100, Math.round((voice.level / Math.max(range.loud, 0.001)) * 100));
  const thresholdPercent = Math.min(100, Math.round((range.quiet / Math.max(range.loud, 0.001)) * 100));

  const changeSensitivity = useCallback((next: number) => {
    const clamped = Math.max(SENSITIVITY_MIN, Math.min(SENSITIVITY_MAX, next));
    sensitivityRef.current = clamped;
    setSensitivity(clamped);
    window.localStorage.setItem('humbird-sensitivity', String(clamped));
  }, []);

  const recalibrate = useCallback(() => {
    calibrationRef.current = createCalibration();
    liftRef.current = 0;
  }, []);

  const exitFullscreen = useCallback(async () => {
    const doc = document as FullscreenDocument;
    if (doc.fullscreenElement) await doc.exitFullscreen().catch(() => {});
    else if (doc.webkitFullscreenElement) await doc.webkitExitFullscreen?.();
    immersiveRef.current = false;
    setIsFullscreen(false);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const frame = frameRef.current;
    if (!frame) return;
    if (nativeFullscreenElement() || immersiveRef.current) { await exitFullscreen(); return; }

    const target = frame as FullscreenTarget;
    try {
      if (target.requestFullscreen) await target.requestFullscreen({ navigationUI: 'hide' });
      else if (target.webkitRequestFullscreen) await target.webkitRequestFullscreen();
      else throw new Error('element fullscreen unsupported');
    } catch {
      // No native fullscreen (iPhone Safari): the CSS layer is the whole feature there.
      immersiveRef.current = true;
    }
    setIsFullscreen(true);
    const orientation = window.screen?.orientation as LockableOrientation | undefined;
    await orientation?.lock?.('landscape').catch(() => {});
  }, [exitFullscreen]);

  useEffect(() => {
    const sync = () => {
      if (nativeFullscreenElement()) setIsFullscreen(true);
      else if (!immersiveRef.current) setIsFullscreen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && immersiveRef.current) void exitFullscreen();
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
      window.removeEventListener('keydown', escape);
    };
  }, [exitFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [isFullscreen]);

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
          <h1>Speak up.<br />Fly <em>higher.</em></h1>
          <p className="lede">Every sound gives lift. Speak softly to hover, get louder to climb, and go quiet to glide down.</p>
          {phase === 'intro' && <button className="primary-button" type="button" onClick={enableMicrophone}><span className="button-icon">●</span>Enable microphone<span aria-hidden="true">↗</span></button>}
          {phase === 'microphone-error' && <button className="primary-button" type="button" onClick={enableMicrophone}><span className="button-icon">↻</span>Try microphone again<span aria-hidden="true">↗</span></button>}
          {micOn && phase !== 'intro' && phase !== 'microphone-error' && (
            <div className="range-summary">
              <span>VOICE POWER</span><strong>{liftPercent}%</strong>
              <small>Above 50% climbs · below 50% sinks</small>
              <div className="sensitivity">
                <label htmlFor="sensitivity">MIC SENSITIVITY <b>{sensitivity}</b></label>
                <input
                  id="sensitivity"
                  type="range"
                  min={SENSITIVITY_MIN}
                  max={SENSITIVITY_MAX}
                  step={1}
                  value={sensitivity}
                  onChange={(event) => changeSensitivity(Number(event.target.value))}
                  aria-describedby="sensitivity-hint"
                />
                <p id="sensitivity-hint">Bird too heavy? Slide right — {SENSITIVITY_MAX} lets a whisper fly. Too twitchy? Slide left.</p>
                <button className="text-button" type="button" onClick={recalibrate}>Recalibrate mic</button>
              </div>
            </div>
          )}
          <p className="privacy">Audio is analyzed on this device. Nothing is recorded or uploaded.</p>
        </div>

        <div className={`game-frame ${isFullscreen ? 'is-fullscreen' : ''}`} ref={frameRef}>
          <canvas ref={canvasRef} className="game-canvas" aria-label="HumBird voice-controlled game field" />
          <button
            className="fullscreen-toggle"
            type="button"
            onClick={() => void toggleFullscreen()}
            aria-pressed={isFullscreen}
            aria-label={isFullscreen ? 'Leave fullscreen' : 'Play fullscreen'}
          >
            <span aria-hidden="true">{isFullscreen ? '⤡' : '⤢'}</span>{isFullscreen ? 'Exit' : 'Fullscreen'}
          </button>
          {isFullscreen && <p className="rotate-hint">Rotate your phone for a bigger view</p>}
          {isFullscreen && micOn && (
            <div className="frame-sensitivity">
              <label htmlFor="sensitivity-fullscreen">MIC <b>{sensitivity}</b></label>
              <input
                id="sensitivity-fullscreen"
                type="range"
                min={SENSITIVITY_MIN}
                max={SENSITIVITY_MAX}
                step={1}
                value={sensitivity}
                onChange={(event) => changeSensitivity(Number(event.target.value))}
                aria-label="Microphone sensitivity"
              />
            </div>
          )}
          <div className="score-hud" aria-live="polite"><span>SCORE</span><strong>{score}</strong><small>BEST {highScore}</small></div>
          <div className="pitch-card" aria-live="polite">
            <span>VOICE POWER</span><strong>{micOn ? `${liftPercent}%` : '—'}</strong>
            <div className="level-track" title="Microphone input level"><i style={{ width: `${levelPercent}%` }} /><b className="level-threshold" style={{ left: `${thresholdPercent}%` }} /></div>
            <div className="pitch-scale"><i className={liftPercent > 5 ? 'active' : ''}/><i className={liftPercent > 25 ? 'active' : ''}/><i className={liftPercent > 45 ? 'active' : ''}/><i className={liftPercent > 65 ? 'active' : ''}/><i className={liftPercent > 85 ? 'active' : ''}/></div>
            <small>QUIET <b>HOVER</b> SHOUT</small>
          </div>

          <div className={`game-overlay ${phase === 'playing' ? 'is-hidden' : ''}`}>
            {phase === 'intro' && <div className="game-panel compact"><span className="panel-step">READY WHEN YOU ARE</span><h2>First, meet your mic.</h2><p>Enable it, then speak normally. No special note or sustained hum is required.</p></div>}
            {phase === 'ready' && <div className="game-panel"><span className="panel-step">MICROPHONE READY</span><h2>Say something.</h2><p>Try “ahx,” a sentence, or any vocal sound. Watch voice power react instantly—then get louder to climb.</p><button className="panel-button" type="button" onClick={startFlight}>Start flight</button></div>}
            {phase === 'countdown' && <div className="countdown" aria-live="assertive">{countdown || 'GO'}</div>}
            {phase === 'paused' && <div className="game-panel compact"><span className="panel-step">FLIGHT PAUSED</span><h2>Catch your breath.</h2><p>The game pauses whenever this tab loses focus.</p><button className="panel-button" type="button" onClick={startFlight}>Restart flight</button></div>}
            {phase === 'game-over' && <div className="game-panel game-over-panel"><span className="panel-step">FLIGHT COMPLETE</span><h2>{score > 0 ? 'Beautiful flying.' : 'Almost airborne!'}</h2><div className="final-score"><span>Score <b>{score}</b></span><span>Best <b>{highScore}</b></span></div><button className="panel-button" type="button" onClick={startFlight}>Fly again</button></div>}
            {phase === 'microphone-error' && <div className="game-panel compact"><span className="panel-step error-step">MICROPHONE NEEDED</span><h2>We cannot hear you yet.</h2><p role="alert">{error}</p></div>}
          </div>
        </div>
      </section>

      <section className="how-it-works" aria-label="How to play">
        <article><span>01</span><h2>Use any words</h2><p>Say “ahx,” talk, sing, or hum. Short sounds and normal speech both create lift.</p></article>
        <article><span>02</span><h2>Shape your volume</h2><p>Speak softly to hover, get louder to climb, and let silence bring you back down.</p></article>
        <article><span>03</span><h2>Thread the sky</h2><p>Pass every gate, build your score, and keep your longest flight alive.</p></article>
      </section>
    </main>
  );
}
