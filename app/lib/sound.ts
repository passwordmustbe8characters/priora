"use client";

// Synthesized via Web Audio instead of shipping audio files — a couple
// of short noise bursts run through a filter/gain envelope read as a
// "type" tick and a "swoosh" convincingly enough without adding assets.
// Note: browsers block audio before any user gesture, so on a cold page
// load these may stay silent until the visitor's first click/keypress —
// that's standard autoplay policy, not a bug; primeAudio() below resumes
// the context as early as possible once that gesture happens.

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext })
    .webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

/** Call on the page's first pointer/key interaction to unlock audio as
 * early as possible, in case it's needed again after this point (the
 * autoplay-blocked case) rather than only ever trying at intro time. */
export function primeAudio() {
  getCtx();
}

/** A short, soft typewriter-key tick — a brief filtered noise burst. */
export function playTypeTick() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  const bufferSize = Math.floor(ctx.sampleRate * 0.03);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2200 + Math.random() * 800;
  filter.Q.value = 1.2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.16, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(now);
  noise.stop(now + 0.03);
}

/** A brief upward-then-settling swept whoosh for the intro's swipe-up. */
export function playSwoosh() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const duration = 0.6;

  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(300, now);
  filter.frequency.exponentialRampToValueAtTime(3400, now + duration * 0.65);
  filter.frequency.exponentialRampToValueAtTime(900, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.24, now + duration * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(now);
  noise.stop(now + duration);
}
