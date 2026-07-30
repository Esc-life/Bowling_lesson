/**
 * 10프레임 볼링 점수 계산.
 *
 * 순수 로직 — Three.js도 Rapier도 모른다. 굴림 배열 하나를 진실의
 * 원천으로 두고 프레임 점수를 파생 계산한다. 상태를 프레임별로 쪼개
 * 저장하지 않는 이유는, 스트라이크·스페어 보너스가 "뒤의 굴림"에
 * 의존하기 때문이다. 배열 하나면 look-ahead가 자연스럽다.
 *
 * 이 클래스는 튜토리얼 퀴즈의 정답 계산기로도 쓰인다. 그래서 퀴즈
 * 정답을 손으로 적어 둘 필요가 없고, 규칙 구현과 교육 내용이 어긋날
 * 수 없다.
 */

export const TOTAL_FRAMES = 10;
export const PIN_COUNT = 10;

export type FrameView = {
  /** 1 ~ 10 */
  index: number;
  /** 이 프레임에서 실제로 던진 굴림들 */
  rolls: number[];
  /** 이 프레임에서 얻은 점수(보너스 포함). 아직 확정 불가면 null */
  frameScore: number | null;
  /** 1프레임부터의 누적 점수. 앞에 미확정 프레임이 있으면 null */
  cumulative: number | null;
  isStrike: boolean;
  isSpare: boolean;
  isComplete: boolean;
};

type Segment = { start: number; length: number };

export class Scorecard {
  private readonly _rolls: number[] = [];

  constructor(rolls: readonly number[] = []) {
    for (const r of rolls) this.roll(r);
  }

  /** 굴림 배열로부터 채점표를 만든다 (퀴즈 문항 생성용) */
  static fromRolls(rolls: readonly number[]): Scorecard {
    return new Scorecard(rolls);
  }

  get rolls(): readonly number[] {
    return this._rolls;
  }

  /**
   * 쓰러뜨린 핀 수를 기록한다.
   * 규칙상 불가능한 값이면 던진다 — 조용히 넘기면 물리 쪽 버그가
   * 점수판 안에서 숨어 버린다.
   */
  roll(pins: number): void {
    if (this.isGameOver) {
      throw new Error('게임이 이미 끝났습니다.');
    }
    if (!Number.isInteger(pins)) {
      throw new Error(`쓰러진 핀 수는 정수여야 합니다: ${pins}`);
    }
    const standing = this.pinsStanding;
    if (pins < 0 || pins > standing) {
      throw new Error(`쓰러진 핀 수가 범위를 벗어났습니다: ${pins} (서 있는 핀 ${standing}개)`);
    }
    this._rolls.push(pins);
  }

  // -------------------------------------------------------------------------
  // 프레임 분할
  // -------------------------------------------------------------------------

  /**
   * 굴림 배열을 프레임별 구간으로 나눈다.
   * 1~9프레임은 스트라이크면 1구, 아니면 2구. 10프레임은 나머지 전부.
   */
  private segments(): Segment[] {
    const segs: Segment[] = [];
    let i = 0;

    for (let f = 0; f < TOTAL_FRAMES - 1; f++) {
      if (i >= this._rolls.length) {
        segs.push({ start: i, length: 0 });
        continue;
      }
      if (this._rolls[i] === PIN_COUNT) {
        segs.push({ start: i, length: 1 });
        i += 1;
      } else {
        segs.push({ start: i, length: Math.min(2, this._rolls.length - i) });
        i += 2;
      }
    }

    segs.push({ start: i, length: Math.max(0, this._rolls.length - i) });
    return segs;
  }

  private tenthRolls(): number[] {
    const segs = this.segments();
    return this._rolls.slice(segs[TOTAL_FRAMES - 1]!.start);
  }

  private isTenthComplete(): boolean {
    const t = this.tenthRolls();
    if (t.length >= 3) return true;
    // 2구로 끝나는 것은 스트라이크도 스페어도 아닐 때만
    if (t.length === 2) return t[0]! + t[1]! < PIN_COUNT;
    return false;
  }

  private isFrameComplete(f: number, segs: Segment[]): boolean {
    const seg = segs[f]!;
    if (f === TOTAL_FRAMES - 1) return this.isTenthComplete();
    if (seg.length === 1) return this._rolls[seg.start] === PIN_COUNT;
    return seg.length === 2;
  }

  // -------------------------------------------------------------------------
  // 점수
  // -------------------------------------------------------------------------

  /** 프레임 하나의 점수. 보너스가 아직 안 나왔으면 null */
  private frameScoreAt(f: number, segs: Segment[]): number | null {
    const seg = segs[f]!;
    if (seg.length === 0) return null;

    const r = this._rolls;
    const a = r[seg.start];
    if (a === undefined) return null;

    if (f === TOTAL_FRAMES - 1) {
      if (!this.isTenthComplete()) return null;
      return this.tenthRolls().reduce((s, v) => s + v, 0);
    }

    // 스트라이크: 10 + 다음 두 번
    if (a === PIN_COUNT) {
      const b = r[seg.start + 1];
      const c = r[seg.start + 2];
      if (b === undefined || c === undefined) return null;
      return PIN_COUNT + b + c;
    }

    const b = r[seg.start + 1];
    if (b === undefined) return null;

    // 스페어: 10 + 다음 한 번
    if (a + b === PIN_COUNT) {
      const c = r[seg.start + 2];
      if (c === undefined) return null;
      return PIN_COUNT + c;
    }

    // 오픈 프레임: 그냥 합
    return a + b;
  }

  /** 10개 프레임의 표시용 정보 */
  get frames(): FrameView[] {
    const segs = this.segments();
    const views: FrameView[] = [];
    let running = 0;
    let broken = false;

    for (let f = 0; f < TOTAL_FRAMES; f++) {
      const seg = segs[f]!;
      const rolls = this._rolls.slice(seg.start, seg.start + seg.length);
      const frameScore = this.frameScoreAt(f, segs);

      let cumulative: number | null = null;
      if (!broken && frameScore !== null) {
        running += frameScore;
        cumulative = running;
      } else if (frameScore === null) {
        broken = true;
      }

      const a = rolls[0];
      const b = rolls[1];
      const isStrike = a === PIN_COUNT;
      const isSpare = !isStrike && a !== undefined && b !== undefined && a + b === PIN_COUNT;

      views.push({
        index: f + 1,
        rolls,
        frameScore,
        cumulative,
        isStrike,
        isSpare,
        isComplete: this.isFrameComplete(f, segs),
      });
    }

    return views;
  }

  /** 지금까지 확정된 총점 */
  get total(): number {
    let running = 0;
    const segs = this.segments();
    for (let f = 0; f < TOTAL_FRAMES; f++) {
      const s = this.frameScoreAt(f, segs);
      if (s === null) break;
      running += s;
    }
    return running;
  }

  // -------------------------------------------------------------------------
  // 현재 위치
  // -------------------------------------------------------------------------

  /** 지금 던지고 있는 프레임 (1~10). 게임이 끝났으면 10 */
  get currentFrame(): number {
    const segs = this.segments();
    for (let f = 0; f < TOTAL_FRAMES; f++) {
      if (!this.isFrameComplete(f, segs)) return f + 1;
    }
    return TOTAL_FRAMES;
  }

  /** 이 프레임에서 몇 번째 공인가 (1~3). 10프레임에서만 3이 나온다 */
  get ballInFrame(): number {
    const segs = this.segments();
    const f = this.currentFrame - 1;
    return segs[f]!.length + 1;
  }

  /**
   * 다음 굴림에서 서 있어야 할 핀 개수.
   * FrameMachine이 핀을 몇 개 세울지 결정할 때도 이 값을 쓴다.
   */
  get pinsStanding(): number {
    if (this.isGameOver) return 0;

    const frame = this.currentFrame;

    if (frame < TOTAL_FRAMES) {
      const segs = this.segments();
      const seg = segs[frame - 1]!;
      if (seg.length === 0) return PIN_COUNT;
      return PIN_COUNT - this._rolls[seg.start]!;
    }

    // 10프레임: 스트라이크나 스페어를 치면 핀을 새로 세운다
    const t = this.tenthRolls();
    if (t.length === 0) return PIN_COUNT;
    if (t.length === 1) {
      return t[0] === PIN_COUNT ? PIN_COUNT : PIN_COUNT - t[0]!;
    }
    // 3구째
    if (t[0] === PIN_COUNT) {
      return t[1] === PIN_COUNT ? PIN_COUNT : PIN_COUNT - t[1]!;
    }
    return PIN_COUNT; // 스페어 뒤 보너스 투구
  }

  get isGameOver(): boolean {
    const segs = this.segments();
    for (let f = 0; f < TOTAL_FRAMES - 1; f++) {
      if (!this.isFrameComplete(f, segs)) return false;
    }
    return this.isTenthComplete();
  }

  /** 마지막 굴림이 스트라이크였는가 (연출용) */
  get lastWasStrike(): boolean {
    return this._rolls.at(-1) === PIN_COUNT && this.wasFirstBallOfRack(-1);
  }

  private wasFirstBallOfRack(offset: number): boolean {
    const idx = this._rolls.length + offset;
    const segs = this.segments();
    for (const seg of segs) {
      if (seg.start === idx) return true;
    }
    return false;
  }
}
