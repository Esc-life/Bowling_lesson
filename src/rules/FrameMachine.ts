/**
 * 턴/볼/프레임 진행 상태머신.
 *
 * 순수 로직 — Three.js도 Rapier도 모른다. 물리 계층은 "정지한 뒤 아직
 * 서 있는 핀 번호"만 넘겨 주고, 여기서 점수 기록과 다음 핀 배치를 결정한다.
 *
 * 가장 틀리기 쉬운 규칙: 같은 프레임의 2구에서는 넘어진 핀만 치우고
 * 서 있던 핀은 그대로 둔다. 새 프레임이거나 스트라이크·스페어를 쳤을
 * 때만 10개를 새로 세운다.
 */

import { Scorecard, PIN_COUNT, TOTAL_FRAMES } from './Scorecard';
import { ALL_PINS, isSplit, type PinNumber } from './pinLayout';

export type GamePhase =
  /** 조준 중 — 던질 수 있다 */
  | 'aiming'
  /** 공이 굴러가는 중 */
  | 'thrown'
  /** 공과 핀이 멈추기를 기다리는 중 */
  | 'settling'
  /** 게임 종료 */
  | 'gameOver';

export type ThrowResult = {
  /** 이번 굴림에 넘어진 핀 */
  knockedPins: PinNumber[];
  knockedCount: number;
  isStrike: boolean;
  isSpare: boolean;
  /** 남은 핀이 스플릿인가 (HUD 문구용) */
  leftSplit: boolean;
  /** 다음 굴림에 세울 핀 */
  nextStanding: PinNumber[];
  /** 핀 10개를 새로 세우는가 */
  fullRackReset: boolean;
  frameCompleted: boolean;
  gameOver: boolean;
  /** 화면에 띄울 짧은 문구. 없으면 null */
  message: string | null;
};

export class FrameMachine {
  private card: Scorecard;
  private _standing: PinNumber[];
  private _phase: GamePhase;
  private _lastResult: ThrowResult | null = null;

  constructor(private readonly frames: number = TOTAL_FRAMES) {
    this.card = new Scorecard([], frames);
    this._standing = [...ALL_PINS];
    this._phase = 'aiming';
  }

  get scorecard(): Scorecard {
    return this.card;
  }

  /** 이 경기의 총 프레임 수 */
  get totalFrames(): number {
    return this.frames;
  }

  get phase(): GamePhase {
    return this._phase;
  }

  /** 지금 레인에 서 있는 핀 */
  get standingPins(): readonly PinNumber[] {
    return this._standing;
  }

  get currentFrame(): number {
    return this.card.currentFrame;
  }

  get ballInFrame(): number {
    return this.card.ballInFrame;
  }

  get isGameOver(): boolean {
    return this.card.isGameOver;
  }

  get lastResult(): ThrowResult | null {
    return this._lastResult;
  }

  /** 공을 던졌다 */
  throwBall(): void {
    if (this._phase !== 'aiming') {
      throw new Error(`지금은 던질 수 없습니다 (상태: ${this._phase})`);
    }
    this._phase = 'thrown';
  }

  /** 공이 핀덱을 지나 결과를 기다리는 중 */
  beginSettling(): void {
    if (this._phase === 'thrown') this._phase = 'settling';
  }

  /**
   * 물리가 멈춘 뒤 호출한다.
   * @param stillStanding 아직 서 있는 핀 번호 (현재 서 있던 핀의 부분집합이어야 한다)
   */
  settle(stillStanding: readonly PinNumber[]): ThrowResult {
    if (this._phase !== 'thrown' && this._phase !== 'settling') {
      throw new Error(`정지 처리할 상태가 아닙니다 (상태: ${this._phase})`);
    }

    const standingBefore = new Set(this._standing);
    const remaining = [...new Set(stillStanding)].sort((a, b) => a - b) as PinNumber[];

    for (const pin of remaining) {
      if (!standingBefore.has(pin)) {
        // 넘어져 있던 핀이 다시 서는 일은 없다. 물리 쪽 버그를 여기서 잡는다.
        throw new Error(`서 있지 않던 핀이 남았다고 보고되었습니다: ${pin}번`);
      }
    }

    const knockedPins = this._standing.filter((p) => !remaining.includes(p));
    const wasFullRack = standingBefore.size === PIN_COUNT;
    const isStrike = wasFullRack && knockedPins.length === PIN_COUNT;
    const isSpare = !isStrike && remaining.length === 0;

    this.card.roll(knockedPins.length);

    const gameOver = this.card.isGameOver;
    const expected = this.card.pinsStanding;

    let nextStanding: PinNumber[];
    let fullRackReset: boolean;

    if (gameOver) {
      nextStanding = [];
      fullRackReset = false;
    } else if (expected === PIN_COUNT) {
      nextStanding = [...ALL_PINS];
      fullRackReset = true;
    } else {
      // 같은 프레임 2구 — 서 있던 핀만 그대로 둔다
      if (remaining.length !== expected) {
        throw new Error(
          `핀 개수가 규칙과 어긋납니다: 남은 핀 ${remaining.length}개, 규칙상 ${expected}개`,
        );
      }
      nextStanding = remaining;
      fullRackReset = false;
    }

    const result: ThrowResult = {
      knockedPins,
      knockedCount: knockedPins.length,
      isStrike,
      isSpare,
      leftSplit: isSplit(remaining),
      nextStanding,
      fullRackReset,
      frameCompleted: fullRackReset || gameOver,
      gameOver,
      message: buildMessage(isStrike, isSpare, knockedPins.length, remaining),
    };

    this._standing = nextStanding;
    this._phase = gameOver ? 'gameOver' : 'aiming';
    this._lastResult = result;
    return result;
  }

  /**
   * 물리를 건너뛰고 쓰러진 핀 수만 넣는다.
   *
   * `?debug=1`에서 숫자 키로 점수 로직을 검증할 때 쓴다. 10프레임 전체를
   * 물리 대기 없이 통과시킬 수 있어야 점수판 버그를 빠르게 잡는다.
   */
  settleWithCount(knockedCount: number): ThrowResult {
    if (knockedCount < 0 || knockedCount > this._standing.length) {
      throw new Error(
        `쓰러뜨릴 수 없는 개수입니다: ${knockedCount} (서 있는 핀 ${this._standing.length}개)`,
      );
    }
    if (this._phase === 'aiming') this._phase = 'thrown';
    const remaining = this._standing.slice(knockedCount);
    return this.settle(remaining);
  }

  /** 처음부터 다시 */
  reset(): void {
    this.card = new Scorecard([], this.frames);
    this._standing = [...ALL_PINS];
    this._phase = 'aiming';
    this._lastResult = null;
  }
}

function buildMessage(
  isStrike: boolean,
  isSpare: boolean,
  knocked: number,
  remaining: readonly PinNumber[],
): string | null {
  if (isStrike) return '스트라이크!';
  if (isSpare) return '스페어!';
  if (knocked === 0) return '아쉬워요. 다시 해 볼까요?';
  if (isSplit(remaining)) return '핀이 떨어져 있어요. 하나라도 맞혀 봐요!';
  return null;
}
