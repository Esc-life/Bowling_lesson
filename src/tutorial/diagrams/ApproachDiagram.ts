/**
 * 네 걸음 어프로치 애니메이션 (측면 스틱 피겨).
 *
 * 3D 캐릭터 리깅은 비용 대비 교육 효과가 낮다. 옆에서 본 막대 사람이
 * 네 걸음 걷는 동안 팔이 앞 → 아래 → 뒤 → 앞으로 도는 것만 보이면 된다.
 * 재생 버튼과 문지르기 슬라이더를 함께 둔다 — 아이마다 보는 속도가 다르다.
 */

import { circle, createDiagramCanvas, text, type Canvas2D } from '../../scene/canvas2d';

const W = 320;
const H = 230;
const GROUND_Y = 186;
const FOUL_X = 252;
const DURATION_MS = 4600;
/** 공을 놓는 순간의 진행도 */
const RELEASE_T = 0.88;

/** (t, 팔 각도°) — 똑바로 아래가 0, 앞(+x)이 양수 */
const ARM_KEYS: readonly [number, number][] = [
  [0, 40],     // 1걸음: 공을 앞으로 밀기
  [0.3, 0],    // 2걸음: 팔이 내려온다
  [0.65, -70], // 3걸음: 뒤로 크게
  [RELEASE_T, 8],  // 4걸음: 앞으로 돌아와 놓기
  [1, 52],     // 팔을 앞으로 쭉
];

function armAngle(t: number): number {
  for (let i = 1; i < ARM_KEYS.length; i++) {
    const [t1, a1] = ARM_KEYS[i]!;
    const [t0, a0] = ARM_KEYS[i - 1]!;
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      // 살짝 부드럽게 (ease in-out)
      const e = f * f * (3 - 2 * f);
      return a0 + (a1 - a0) * e;
    }
  }
  return ARM_KEYS[ARM_KEYS.length - 1]![1];
}

function stepLabel(t: number): string {
  if (t < 0.28) return '1걸음 — 공을 앞으로 밀어요';
  if (t < 0.52) return '2걸음 — 팔이 아래로 내려와요';
  if (t < 0.78) return '3걸음 — 팔이 뒤로 올라가요';
  if (t < 0.95) return '4걸음 — 공을 놓아요';
  return '팔을 앞으로 쭉 뻗어요!';
}

export class ApproachDiagram {
  readonly element: HTMLElement;

  private readonly c: Canvas2D;
  private readonly slider: HTMLInputElement;
  private readonly playBtn: HTMLButtonElement;
  private t = 0;
  private raf = 0;
  private playing = false;
  private completedOnce = false;

  constructor(private readonly onComplete?: () => void) {
    this.element = document.createElement('div');
    this.element.className = 'diagram diagram--approach';

    this.c = createDiagramCanvas(W, H);
    this.element.appendChild(this.c.canvas);

    const controls = document.createElement('div');
    controls.className = 'approach-controls';

    this.playBtn = document.createElement('button');
    this.playBtn.type = 'button';
    this.playBtn.className = 'text-btn';
    this.playBtn.textContent = '▶ 재생';
    this.playBtn.addEventListener('click', () => {
      if (this.playing) this.stopPlaying();
      else this.play();
    });

    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.min = '0';
    this.slider.max = '1000';
    this.slider.value = '0';
    this.slider.addEventListener('input', () => {
      this.stopPlaying();
      this.t = Number(this.slider.value) / 1000;
      this.draw();
    });

    controls.appendChild(this.playBtn);
    controls.appendChild(this.slider);
    this.element.appendChild(controls);

    this.draw();
  }

  play(): void {
    this.stopPlaying();
    if (this.t >= 1) this.t = 0;
    this.playing = true;
    this.playBtn.textContent = '⏸ 멈춤';
    const start = performance.now() - this.t * DURATION_MS;
    const loop = (now: number): void => {
      if (!this.playing) return;
      this.t = Math.min((now - start) / DURATION_MS, 1);
      this.slider.value = String(Math.round(this.t * 1000));
      this.draw();
      if (this.t >= 1) {
        this.stopPlaying();
        if (!this.completedOnce) {
          this.completedOnce = true;
          this.onComplete?.();
        }
        return;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stopPlaying(): void {
    this.playing = false;
    this.playBtn.textContent = this.t >= 1 ? '▶ 다시 보기' : '▶ 재생';
    cancelAnimationFrame(this.raf);
  }

  dispose(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }

  private draw(): void {
    const { ctx } = this.c;
    const t = this.t;

    ctx.clearRect(0, 0, W, H);

    // 배경과 바닥
    ctx.fillStyle = '#1a2027';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#5c4632';
    ctx.fillRect(0, GROUND_Y, FOUL_X, H - GROUND_Y);
    ctx.fillStyle = '#a87d50';
    ctx.fillRect(FOUL_X, GROUND_Y, W - FOUL_X, H - GROUND_Y);

    // 파울선
    ctx.strokeStyle = '#e04848';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(FOUL_X, GROUND_Y - 2);
    ctx.lineTo(FOUL_X, H);
    ctx.stroke();
    text(ctx, '파울선', FOUL_X, GROUND_Y - 12, { size: 11, color: '#ff9d9d' });

    // 걸음 위치 — 네 걸음 동안 전진하고 마지막에 미끄러지듯 멈춘다
    const walk = Math.min(t / RELEASE_T, 1);
    const hipX = 46 + walk * 150;
    const bob = Math.abs(Math.sin(walk * Math.PI * 4)) * 3;
    const hipY = 120 + bob - (t > RELEASE_T ? 6 : 0);
    const shoulderY = hipY - 44;

    ctx.strokeStyle = '#e8ecf2';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    // 다리 두 개 — 걸음마다 번갈아 나간다
    const stride = Math.sin(walk * Math.PI * 4) * 0.55;
    for (const dir of [stride, -stride]) {
      ctx.beginPath();
      ctx.moveTo(hipX, hipY);
      ctx.lineTo(hipX + Math.sin(dir) * 34, GROUND_Y);
      ctx.stroke();
    }

    // 몸통과 머리 (놓는 순간 앞으로 숙인다)
    const lean = t > 0.7 ? (t - 0.7) * 30 : 0;
    const shoulderX = hipX + lean * 0.4;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(shoulderX, shoulderY);
    ctx.stroke();
    ctx.fillStyle = '#e8ecf2';
    circle(ctx, shoulderX + lean * 0.15, shoulderY - 16, 11);
    ctx.fill();

    // 공 든 팔
    const a = (armAngle(t) * Math.PI) / 180;
    const armLen = 40;
    const handX = shoulderX + Math.sin(a) * armLen;
    const handY = shoulderY + Math.cos(a) * armLen;
    ctx.strokeStyle = '#4fc3f7';
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(handX, handY);
    ctx.stroke();

    // 공 — 놓기 전에는 손에, 놓은 뒤에는 바닥을 굴러간다
    const ballR = 9;
    ctx.fillStyle = '#3a66c9';
    if (t < RELEASE_T) {
      circle(ctx, handX, handY + ballR, ballR);
    } else {
      const roll = (t - RELEASE_T) / (1 - RELEASE_T);
      circle(ctx, handX + roll * (W - handX - 16), GROUND_Y - ballR, ballR);
    }
    ctx.fill();

    // 지금 몇 걸음인지
    text(ctx, stepLabel(t), W / 2, 22, { size: 15, weight: '700', color: '#ffd166' });
  }
}
