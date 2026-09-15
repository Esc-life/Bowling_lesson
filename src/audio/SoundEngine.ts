/**
 * 효과음 — 전부 코드로 합성한다.
 *
 * 이 프로젝트는 텍스처도 이미지 파일 없이 절차적으로 만든다(scene/Textures.ts).
 * 소리도 같은 원칙이다 — 외부 mp3/wav가 없으니 저장소 용량도, 라이선스 문제도
 * 없고, 물리 값(속도 등)에 그대로 반응하는 소리를 만들기도 더 쉽다.
 *
 * 브라우저는 사용자 제스처 전에는 오디오 재생을 막는다. main.ts가 첫
 * pointerdown/keydown에서 한 번 unlock()을 부른다 — 그 전에 재생 요청이 와도
 * (예: 딥링크로 열리자마자 재생되는 시연) 조용히 무시된다.
 */

import { settings } from '../settings';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext;
  if (Ctor === undefined) return null;
  if (ctx === null) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
  }
  return ctx;
}

/** 모든 효과음의 재료 — 잡음(흰소음) 1장을 만들어 재사용한다 */
function getNoiseBuffer(context: AudioContext): AudioBuffer {
  if (noiseBuffer !== null) return noiseBuffer;
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

function enabled(): boolean {
  return settings.value.soundOn;
}

// ---------------------------------------------------------------- 핀 충돌

/** intensity: 0(살짝 스침)~1(정통으로 세게 맞음) */
function pinHit(intensity: number): void {
  const context = ensureContext();
  if (context === null || master === null || !enabled()) return;
  const t = Math.min(1, Math.max(0, intensity));
  const now = context.currentTime;

  // 몸통 — 필터링한 잡음으로 뭉툭한 "퍽" 충격을 만든다
  const noise = context.createBufferSource();
  noise.buffer = getNoiseBuffer(context);
  const bandpass = context.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 250 + t * 400;
  bandpass.Q.value = 0.8;
  const noiseGain = context.createGain();
  noiseGain.gain.setValueAtTime(0.12 + t * 0.35, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  noise.connect(bandpass).connect(noiseGain).connect(master);
  noise.start(now);
  noise.stop(now + 0.14);

  // 딱 — 짧게 떨어지는 클릭으로 타격감을 더한다
  const click = context.createOscillator();
  click.type = 'triangle';
  click.frequency.setValueAtTime(900 + t * 300, now);
  click.frequency.exponentialRampToValueAtTime(120, now + 0.05);
  const clickGain = context.createGain();
  clickGain.gain.setValueAtTime(0.05 + t * 0.15, now);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  click.connect(clickGain).connect(master);
  click.start(now);
  click.stop(now + 0.07);
}

// ---------------------------------------------------------------- 굴러가는 소리

let rollSource: AudioBufferSourceNode | null = null;
let rollFilter: BiquadFilterNode | null = null;
let rollGain: GainNode | null = null;

/** 공을 놓는 순간 한 번 부른다. rollUpdate로 속도를 계속 먹여야 소리가 커진다 */
function rollStart(): void {
  const context = ensureContext();
  if (context === null || master === null || !enabled()) return;
  rollStop();

  const source = context.createBufferSource();
  source.buffer = getNoiseBuffer(context);
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 200;
  const gain = context.createGain();
  gain.gain.value = 0;
  source.connect(filter).connect(gain).connect(master);
  source.start();

  rollSource = source;
  rollFilter = filter;
  rollGain = gain;
}

/** speed: 공의 현재 속력 (m/s). 매 프레임 불러도 된다 */
function rollUpdate(speed: number): void {
  if (rollGain === null || rollFilter === null || ctx === null) return;
  if (!enabled()) {
    rollGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    return;
  }
  const t = Math.min(1, Math.max(0, speed / 9));
  rollGain.gain.setTargetAtTime(0.04 + t * 0.22, ctx.currentTime, 0.08);
  rollFilter.frequency.setTargetAtTime(180 + t * 500, ctx.currentTime, 0.08);
}

/** 공이 멈추거나(정지 판정) 다음 조준으로 돌아갈 때 부른다 */
function rollStop(): void {
  const source = rollSource;
  const gain = rollGain;
  const context = ctx;
  rollSource = null;
  rollFilter = null;
  rollGain = null;
  if (source === null || context === null) return;

  if (gain !== null) gain.gain.setTargetAtTime(0, context.currentTime, 0.05);
  // 바로 stop()하면 gain 페이드가 끊겨 "뚝" 끊기는 소리가 난다 — 페이드가
  // 끝날 시간을 준 뒤에 정지한다.
  window.setTimeout(() => {
    try {
      source.stop();
    } catch {
      /* 이미 멈췄으면 무시 */
    }
  }, 200);
}

// ---------------------------------------------------------------- 거터

function gutter(): void {
  const context = ensureContext();
  if (context === null || master === null || !enabled()) return;
  const now = context.currentTime;

  const noise = context.createBufferSource();
  noise.buffer = getNoiseBuffer(context);
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(500, now);
  filter.frequency.exponentialRampToValueAtTime(110, now + 0.3);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  noise.connect(filter).connect(gain).connect(master);
  noise.start(now);
  noise.stop(now + 0.4);
}

// ---------------------------------------------------------------- 스트라이크·스페어

function chime(notesHz: readonly number[], gapSec: number, gainPeak: number): void {
  const context = ensureContext();
  if (context === null || master === null || !enabled()) return;
  const destination = master;
  const now = context.currentTime;
  notesHz.forEach((freq, i) => {
    const start = now + i * gapSec;
    const osc = context.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(gainPeak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
    osc.connect(gain).connect(destination);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}

/** 도-미-솔-도(옥타브 위) — 밝게 올라가는 4음 */
function strike(): void {
  chime([523.25, 659.25, 783.99, 1046.5], 0.09, 0.2);
}

/** 솔-도(옥타브 위) — 스트라이크보다 짧고 차분하게 */
function spare(): void {
  chime([392.0, 783.99], 0.11, 0.16);
}

// ---------------------------------------------------------------- 잠금 해제

/** 브라우저의 자동재생 제한을 푼다. 첫 사용자 제스처 핸들러에서 한 번 부르면 된다 */
function unlock(): void {
  const context = ensureContext();
  if (context === null) return;
  if (context.state === 'suspended') void context.resume();
}

export const Sound = {
  unlock,
  pinHit,
  rollStart,
  rollUpdate,
  rollStop,
  gutter,
  strike,
  spare,
};
