/**
 * 드릴 진행 판정. 순수 로직 — DOM도 물리도 모른다.
 *
 * 커리큘럼의 드릴은 오른손 기준으로 쓰여 있다. 여기서 학생의 손에 맞게
 * 핀 배치와 목표를 미러링하고, 투구 결과를 받아 성공/실패를 센다.
 *
 * 판정 재료는 게임이 이미 계산해 둔 것만 쓴다:
 *   - FrameMachine.settle()의 ThrowResult (넘어진 핀, 스트라이크 여부)
 *   - 공이 헤드핀 라인을 지난 순간의 x (포켓 판정)
 *   - Scorecard 총점 (minScore)
 * 드릴마다 새 판정 코드를 만들기 시작하면 유지보수가 무너진다.
 */

import type { ThrowResult } from '../rules/FrameMachine';
import {
  forHand,
  isPocketHit,
  type Handedness,
  type PinNumber,
} from '../rules/pinLayout';
import type { Drill, DrillGoal } from './types';

/** 한 번의 투구가 확정되었을 때 게임에서 건네받는 정보 */
export type DrillThrowInfo = {
  result: ThrowResult;
  /** 공이 헤드핀 라인을 지난 순간의 x. 지나지 못했으면 null */
  pocketX: number | null;
  totalScore: number;
  gameOver: boolean;
};

export type DrillOutcome = {
  /** 이번 투구가 목표를 이뤘는가 (횟수 목표에서의 1회 성공) */
  hit: boolean;
  /** 드릴이 끝났는가 (성공했거나 기회를 다 썼거나) */
  finished: boolean;
  /** 끝났다면 성공인가 */
  success: boolean;
  attemptsLeft: number;
};

export class DrillRunner {
  /** 학생의 손에 맞게 미러링된 핀 배치 */
  readonly pins: PinNumber[];
  /** 미러링된 시작 위치 (지정이 없으면 undefined) */
  readonly startX: number | undefined;

  private successCount = 0;
  private attemptCount = 0;
  private done = false;
  private succeeded = false;

  constructor(
    readonly drill: Drill,
    readonly hand: Handedness,
  ) {
    this.pins = forHand(drill.setup.standingPins, hand);
    // 시작 위치는 월드 x 좌표라 미러링 = 부호 반전
    this.startX =
      drill.setup.startX === undefined
        ? undefined
        : hand === 'right'
          ? drill.setup.startX
          : -drill.setup.startX;
  }

  /**
   * 시도할 때마다 핀을 처음 배치로 되돌리는 드릴인가.
   *
   * minScore(10프레임 완주)와 spare는 프레임 규칙 그대로 진행해야 하므로
   * 되돌리지 않는다. 나머지는 매 시도 같은 상황에서 다시 던진다.
   */
  get freshRackEachThrow(): boolean {
    const kind = this.drill.goal.kind;
    return kind !== 'minScore' && kind !== 'spare';
  }

  /** 몇 번 성공해야 하는가 */
  get target(): number {
    const goal = this.drill.goal;
    if (goal.kind === 'pocketHit' || goal.kind === 'strike') return goal.times;
    return 1;
  }

  get successes(): number {
    return this.successCount;
  }

  get attemptsUsed(): number {
    return this.attemptCount;
  }

  get attemptsMax(): number {
    return this.drill.attempts;
  }

  get isFinished(): boolean {
    return this.done;
  }

  get isSuccess(): boolean {
    return this.succeeded;
  }

  get hint(): string | undefined {
    return this.drill.setup.hint;
  }

  /** 목표를 학생용 문구로 */
  get goalLabel(): string {
    const goal = this.drill.goal;
    switch (goal.kind) {
      case 'knockAll':
        return '서 있는 핀을 다 쓰러뜨려요';
      case 'knockPins':
        return `${forHand(goal.pins, this.hand).join('번, ')}번 핀을 쓰러뜨려요`;
      case 'pocketHit':
        return goal.times === 1 ? '포켓에 넣어요' : `포켓에 ${goal.times}번 넣어요`;
      case 'strike':
        return goal.times === 1 ? '스트라이크를 만들어요' : `스트라이크 ${goal.times}번!`;
      case 'spare':
        return '스페어를 만들어요';
      case 'minScore':
        return `10프레임을 끝까지 던져 ${goal.score}점을 넘겨요`;
    }
  }

  /** 투구 결과 하나를 기록한다 */
  recordThrow(info: DrillThrowInfo): DrillOutcome {
    if (this.done) {
      return {
        hit: false,
        finished: true,
        success: this.succeeded,
        attemptsLeft: Math.max(0, this.drill.attempts - this.attemptCount),
      };
    }

    this.attemptCount++;
    const hit = evaluateHit(this.drill.goal, this.pins, this.hand, info);
    if (hit) this.successCount++;

    const goal = this.drill.goal;
    if (goal.kind === 'minScore') {
      // 게임이 끝나야 점수가 확정된다. 기회(투구 수)를 다 쓰면 거기서 마감.
      if (info.gameOver) {
        this.done = true;
        this.succeeded = info.totalScore >= goal.score;
      } else if (this.attemptCount >= this.drill.attempts) {
        this.done = true;
        this.succeeded = false;
      }
    } else if (this.successCount >= this.target) {
      this.done = true;
      this.succeeded = true;
    } else if (this.attemptCount >= this.drill.attempts) {
      this.done = true;
      this.succeeded = false;
    }

    return {
      hit,
      finished: this.done,
      success: this.succeeded,
      attemptsLeft: Math.max(0, this.drill.attempts - this.attemptCount),
    };
  }
}

function evaluateHit(
  goal: DrillGoal,
  drillPins: readonly PinNumber[],
  hand: Handedness,
  info: DrillThrowInfo,
): boolean {
  switch (goal.kind) {
    case 'knockAll':
      return drillPins.every((p) => info.result.knockedPins.includes(p));
    case 'knockPins':
      return forHand(goal.pins, hand).every((p) => info.result.knockedPins.includes(p));
    case 'pocketHit':
      return info.pocketX !== null && isPocketHit(info.pocketX, hand);
    case 'strike':
      return info.result.isStrike;
    case 'spare':
      return info.result.isSpare;
    case 'minScore':
      // 회당 성공 개념이 없다 — 종료 시 총점으로만 판정한다
      return false;
  }
}
