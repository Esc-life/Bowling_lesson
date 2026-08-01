/**
 * 드래그 스윙 입력.
 *
 * Pointer Events를 쓰므로 마우스·터치패드·태블릿·펜이 전부 자동으로 지원된다.
 * 교실에는 마우스 없는 노트북이 많으니 중요한 부분이다.
 *
 * 조작 흐름
 *  1. 던지기 전에 좌우로 살짝 끌면 파울라인 위의 서는 위치가 움직인다
 *  2. 아래로 당기면 파워가 차오른다 (많이 당길수록 세게)
 *  3. 손을 뗄 때의 좌우 움직임이 회전이 된다 → 공이 휜다
 *
 * Three.js도 Rapier도 모른다. 순수한 ThrowInput만 내보내므로, 나중에
 * 게이지 방식 입력을 추가해도 게임 코드는 그대로다.
 */

import { DIFFICULTY, THROW, type DifficultyName } from '../config';
import { clamp } from '../util/random';

export type ThrowInput = {
  /** 파울라인에서의 좌우 시작 위치 (m) */
  startX: number;
  /** 0~1 */
  power: number;
  /** 발사 각도 (라디안, 월드 +X = 화면 왼쪽이 양수) */
  angle: number;
  /** 옆회전 (rad/s, 진행 방향 Z축. 양수 = 화면 오른쪽으로 휜다) */
  spin: number;
};

export type DragState = {
  active: boolean;
  startX: number;
  power: number;
  angle: number;
  spin: number;
};

type Sample = { x: number; y: number; t: number };

/** 회전 계산에 쓰는 최근 구간 (ms) */
const SPIN_WINDOW_MS = 120;
/** 이 거리(px)보다 적게 당기고 놓으면 던지지 않는다 — 실수 클릭 방지 */
const MIN_DRAG_PX = 18;

export class DragInput {
  private readonly samples: Sample[] = [];
  private dragging = false;
  private origin: Sample | null = null;
  private _startX = 0;
  private _state: DragState = { active: false, startX: 0, power: 0, angle: 0, spin: 0 };

  /** 지금 던질 수 있는가 — 게임이 결정한다 */
  enabled = false;
  difficulty: DifficultyName = 'easy';

  private onThrowCallback: ((input: ThrowInput) => void) | null = null;
  private onChangeCallback: ((state: DragState) => void) | null = null;

  private readonly handlers: { type: string; fn: (e: Event) => void }[] = [];

  constructor(private readonly element: HTMLElement) {
    // { passive: false } + preventDefault: 캔버스 위 드래그가 브라우저의
    // 터치 스크롤/풀투리프레시로 새는 것을 막는다. CSS의 touch-action: none
    // (SceneSetup.ts)만으로는 일부 모바일 브라우저에서 충분하지 않았다.
    this.bind('pointerdown', (e) => this.onDown(e as PointerEvent));
    this.bind('pointermove', (e) => this.onMove(e as PointerEvent));
    this.bind('pointerup', (e) => this.onUp(e as PointerEvent));
    this.bind('pointercancel', () => this.cancel());
    this.bind('lostpointercapture', () => this.cancel());
  }

  private bind(type: string, fn: (e: Event) => void): void {
    this.element.addEventListener(type, fn, { passive: false });
    this.handlers.push({ type, fn });
  }

  onThrow(fn: (input: ThrowInput) => void): void {
    this.onThrowCallback = fn;
  }

  onChange(fn: (state: DragState) => void): void {
    this.onChangeCallback = fn;
  }

  get state(): Readonly<DragState> {
    return this._state;
  }

  get startX(): number {
    return this._startX;
  }

  /** 새 투구를 준비한다 (서는 위치는 유지 — 아이가 매번 다시 맞추지 않게) */
  reset(): void {
    this.dragging = false;
    this.origin = null;
    this.samples.length = 0;
    this.emitState({ active: false, startX: this._startX, power: 0, angle: 0, spin: 0 });
  }

  setStartX(x: number): void {
    this._startX = clamp(x, -THROW.maxStartX, THROW.maxStartX);
    this.emitState({ ...this._state, startX: this._startX });
  }

  /** 키보드로 서는 위치 조정 (A/D, ←/→) */
  nudgeStartX(delta: number): void {
    this.setStartX(this._startX + delta);
  }

  private onDown(e: PointerEvent): void {
    if (!this.enabled) return;
    e.preventDefault();
    this.dragging = true;
    this.origin = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    this.samples.length = 0;
    this.samples.push(this.origin);
    this.element.setPointerCapture(e.pointerId);
    this.emitState({ active: true, startX: this._startX, power: 0, angle: 0, spin: 0 });
  }

  private onMove(e: PointerEvent): void {
    if (!this.dragging || this.origin === null) return;
    e.preventDefault();
    this.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    // 오래된 표본은 버린다 (회전은 마지막 순간만 본다)
    while (this.samples.length > 2 && e.timeStamp - this.samples[0]!.t > 400) {
      this.samples.shift();
    }
    this.emitState(this.computeState(e.clientX, e.clientY, e.timeStamp));
  }

  private onUp(e: PointerEvent): void {
    if (!this.dragging || this.origin === null) return;

    const dragged = Math.hypot(e.clientX - this.origin.x, e.clientY - this.origin.y);
    const state = this.computeState(e.clientX, e.clientY, e.timeStamp);

    this.dragging = false;
    this.origin = null;
    this.samples.length = 0;

    if (dragged < MIN_DRAG_PX || state.power <= 0.02) {
      // 실수 클릭 — 던지지 않는다
      this.emitState({ active: false, startX: this._startX, power: 0, angle: 0, spin: 0 });
      return;
    }

    this.emitState({ active: false, startX: this._startX, power: 0, angle: 0, spin: 0 });
    this.onThrowCallback?.({
      startX: this._startX,
      power: state.power,
      angle: state.angle,
      spin: state.spin,
    });
  }

  private cancel(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.origin = null;
    this.samples.length = 0;
    this.emitState({ active: false, startX: this._startX, power: 0, angle: 0, spin: 0 });
  }

  /**
   * 드래그 상태 → 파워·각도·회전.
   *
   * 아래로 당긴 거리가 파워, 좌우로 벗어난 정도가 각도, 놓기 직전의
   * 좌우 속도가 회전이다.
   */
  private computeState(x: number, y: number, t: number): DragState {
    const origin = this.origin;
    if (origin === null) {
      return { active: false, startX: this._startX, power: 0, angle: 0, spin: 0 };
    }

    const dx = x - origin.x;
    const dy = y - origin.y;
    const scale = DIFFICULTY[this.difficulty];

    // 아래로 당긴 거리만 파워로 센다. 위로 밀면 파워 0.
    const pullPx = Math.max(0, dy);
    const fullPowerPx = window.innerHeight * THROW.fullPowerDragFraction;
    const power = clamp(pullPx / fullPowerPx, 0, 1);

    // 각도: 당긴 방향의 좌우 성분. 당긴 거리 대비 비율로 계산해야
    // 조금 당길 때 각도가 과민하게 튀지 않는다.
    const maxAngle = ((THROW.maxAngleDeg * Math.PI) / 180) * scale.angle;
    const lateralRatio = pullPx > 8 ? clamp(-dx / pullPx, -1, 1) : 0;
    const angle = lateralRatio * maxAngle;

    // 당김 기울기 (px 좌우 / px 아래). 스핀 계산에서 조준 성분을 빼는 데 쓴다.
    const aimSlope = pullPx > 8 ? clamp(dx / pullPx, -1, 1) : 0;
    const spin = this.computeSpin(t, aimSlope) * scale.spin;

    return { active: this.dragging, startX: this._startX, power, angle, spin };
  }

  /**
   * 최근 SPIN_WINDOW_MS 구간의 좌우 속도 → 회전.
   *
   * 좌우 속도를 그대로 쓰면 안 된다: 각도를 주려고 비스듬히 당기는 동안에도
   * 좌우 속도가 계속 생기므로, 조준만 했는데 공이 휜다. 당김 기울기(조준선)
   * 만큼의 좌우 속도는 빼고, 거기서 벗어난 만큼 — 놓기 직전의 '꺾기'만 —
   * 회전으로 센다. 직선으로 비스듬히 당기면 스핀 0, 끝에서 옆으로 꺾으면
   * 꺾은 방향으로 휜다.
   */
  private computeSpin(now: number, aimSlope: number): number {
    const recent = this.samples.filter((s) => now - s.t <= SPIN_WINDOW_MS);
    if (recent.length < 2) return 0;

    const first = recent[0]!;
    const last = recent[recent.length - 1]!;
    const dt = (last.t - first.t) / 1000;
    if (dt <= 0) return 0;

    const vx = (last.x - first.x) / dt;
    const vy = (last.y - first.y) / dt;
    const flick = vx - aimSlope * Math.max(0, vy);

    // px/s → rad/s. 화면 폭의 절반을 1초에 지나가면 최대 회전.
    const normalized = clamp(flick / (window.innerWidth * 0.5), -1, 1);
    return normalized * THROW.maxSpin;
  }

  private emitState(state: DragState): void {
    this._state = state;
    this.onChangeCallback?.(state);
  }

  /** 파워 0~1 → 실제 속도 (m/s) */
  static powerToSpeed(power: number): number {
    return THROW.minSpeed + (THROW.maxSpeed - THROW.minSpeed) * power;
  }

  dispose(): void {
    for (const { type, fn } of this.handlers) {
      this.element.removeEventListener(type, fn);
    }
    this.handlers.length = 0;
  }
}
