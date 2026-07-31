/**
 * 연습 투구 — 프레임도 점수도 없이 계속 던지는 모드.
 *
 * 매 투구 후 고른 핀 배치로 되돌린다. 핀 일부만 세운 상태에서는
 * FrameMachine이 계산한 "스트라이크!"가 틀리므로(핀 3개를 다 쓰러뜨린
 * 것을 스트라이크라고 부를 수 없다) 기본 배너를 끄고 여기서 문구를 만든다.
 * 튜토리얼 드릴이 쓰는 방식과 같다.
 */

import { ALL_PINS, type PinNumber } from '../rules/pinLayout';

export class PracticeSession {
  private pins: PinNumber[] = [...ALL_PINS];
  private count = 0;
  private knocked = 0;
  private last: number | null = null;

  constructor(rack: readonly PinNumber[] = ALL_PINS) {
    this.setRack(rack);
  }

  get rack(): readonly PinNumber[] {
    return this.pins;
  }

  setRack(rack: readonly PinNumber[]): void {
    const unique = [...new Set(rack)].sort((a, b) => a - b);
    if (unique.length === 0) {
      throw new Error('핀을 최소 하나는 세워야 합니다.');
    }
    this.pins = unique;
    this.reset();
  }

  record(knockedCount: number): void {
    if (knockedCount < 0 || knockedCount > this.pins.length) {
      throw new Error(
        `쓰러뜨릴 수 없는 개수입니다: ${knockedCount} (세운 핀 ${this.pins.length}개)`,
      );
    }
    this.count += 1;
    this.knocked += knockedCount;
    this.last = knockedCount;
  }

  get throws(): number {
    return this.count;
  }

  get knockedTotal(): number {
    return this.knocked;
  }

  get lastKnocked(): number | null {
    return this.last;
  }

  /** 방금 투구를 설명하는 짧은 문구. 아직 안 던졌으면 null */
  get lastMessage(): string | null {
    if (this.last === null) return null;
    if (this.last === 0) return '아쉬워요. 다시 해 볼까요?';
    if (this.last === this.pins.length) return '전부 쓰러뜨렸어요!';
    return `${this.pins.length}개 중 ${this.last}개`;
  }

  reset(): void {
    this.count = 0;
    this.knocked = 0;
    this.last = null;
  }
}
