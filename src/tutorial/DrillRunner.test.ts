import { describe, expect, it } from 'vitest';
import type { ThrowResult } from '../rules/FrameMachine';
import { pocketX } from '../rules/pinLayout';
import type { PinNumber } from '../rules/pinLayout';
import { DrillRunner, type DrillThrowInfo } from './DrillRunner';
import type { Drill } from './types';

function result(partial: Partial<ThrowResult> = {}): ThrowResult {
  return {
    knockedPins: [],
    knockedCount: 0,
    isStrike: false,
    isSpare: false,
    leftSplit: false,
    nextStanding: [],
    fullRackReset: false,
    frameCompleted: false,
    gameOver: false,
    message: null,
    ...partial,
  };
}

function info(partial: Partial<DrillThrowInfo> = {}): DrillThrowInfo {
  return { result: result(), pocketX: null, totalScore: 0, gameOver: false, ...partial };
}

const FULL_RACK: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('DrillRunner — 미러링', () => {
  const d4: Drill = {
    kind: 'drill',
    setup: { standingPins: [7], startX: 0.2 },
    goal: { kind: 'knockAll' },
    attempts: 6,
  };

  it('오른손은 그대로', () => {
    const r = new DrillRunner(d4, 'right');
    expect(r.pins).toEqual([7]);
    expect(r.startX).toBe(0.2);
  });

  it('왼손은 핀 번호와 시작 위치가 뒤집힌다', () => {
    const r = new DrillRunner(d4, 'left');
    expect(r.pins).toEqual([10]);
    expect(r.startX).toBe(-0.2);
  });

  it('왼손 판정도 미러링된 핀을 본다', () => {
    const r = new DrillRunner(d4, 'left');
    // 원본 7번을 쓰러뜨려도 왼손 드릴(10번)에는 실패
    expect(r.recordThrow(info({ result: result({ knockedPins: [7] }) })).hit).toBe(false);
    expect(r.recordThrow(info({ result: result({ knockedPins: [10] }) })).hit).toBe(true);
  });
});

describe('DrillRunner — 횟수 목표', () => {
  const e1: Drill = {
    kind: 'drill',
    setup: { standingPins: FULL_RACK },
    goal: { kind: 'pocketHit', times: 3 },
    attempts: 5,
  };

  it('포켓 x로 판정하고 목표 횟수를 채우면 성공', () => {
    const r = new DrillRunner(e1, 'right');
    const inPocket = info({ pocketX: pocketX('right') });
    expect(r.recordThrow(inPocket).hit).toBe(true);
    expect(r.recordThrow(info({ pocketX: 0.5 })).hit).toBe(false);
    r.recordThrow(inPocket);
    const last = r.recordThrow(inPocket);
    expect(last.finished).toBe(true);
    expect(last.success).toBe(true);
    expect(r.successes).toBe(3);
  });

  it('왼손은 왼손 포켓으로 판정한다', () => {
    const r = new DrillRunner(e1, 'left');
    expect(r.recordThrow(info({ pocketX: pocketX('left') })).hit).toBe(true);
    expect(r.recordThrow(info({ pocketX: pocketX('right') })).hit).toBe(false);
  });

  it('공이 헤드핀에 못 미치면(포켓 x 없음) 실패로 센다', () => {
    const r = new DrillRunner(e1, 'right');
    expect(r.recordThrow(info({ pocketX: null })).hit).toBe(false);
  });

  it('기회를 다 쓰면 실패로 끝난다 — 그래도 진행은 막지 않는다', () => {
    const r = new DrillRunner(e1, 'right');
    let outcome = r.recordThrow(info());
    for (let i = 1; i < 5; i++) outcome = r.recordThrow(info());
    expect(outcome.finished).toBe(true);
    expect(outcome.success).toBe(false);
    expect(outcome.attemptsLeft).toBe(0);
  });

  it('스트라이크 목표는 결과 플래그를 본다', () => {
    const d2: Drill = {
      kind: 'drill',
      setup: { standingPins: FULL_RACK },
      goal: { kind: 'strike', times: 1 },
      attempts: 8,
    };
    const r = new DrillRunner(d2, 'right');
    const outcome = r.recordThrow(info({ result: result({ isStrike: true }) }));
    expect(outcome.finished).toBe(true);
    expect(outcome.success).toBe(true);
  });
});

describe('DrillRunner — 점수 목표 (10프레임 완주)', () => {
  const e2: Drill = {
    kind: 'drill',
    setup: { standingPins: FULL_RACK },
    goal: { kind: 'minScore', score: 40 },
    attempts: 30,
  };

  it('게임이 끝날 때까지는 판정하지 않는다', () => {
    const r = new DrillRunner(e2, 'right');
    expect(r.freshRackEachThrow).toBe(false);
    const mid = r.recordThrow(info({ totalScore: 50, gameOver: false }));
    expect(mid.finished).toBe(false);
  });

  it('게임 종료 시 총점으로 판정한다', () => {
    const win = new DrillRunner(e2, 'right');
    const w = win.recordThrow(info({ totalScore: 41, gameOver: true }));
    expect(w.finished).toBe(true);
    expect(w.success).toBe(true);

    const lose = new DrillRunner(e2, 'right');
    const l = lose.recordThrow(info({ totalScore: 39, gameOver: true }));
    expect(l.finished).toBe(true);
    expect(l.success).toBe(false);
  });
});

describe('DrillRunner — 문구', () => {
  it('목표 문구가 학생용으로 나온다', () => {
    const r = new DrillRunner(
      { kind: 'drill', setup: { standingPins: FULL_RACK }, goal: { kind: 'pocketHit', times: 3 }, attempts: 12 },
      'right',
    );
    expect(r.goalLabel).toContain('포켓');
    expect(r.goalLabel).toContain('3번');
  });

  it('끝난 뒤 recordThrow는 상태를 바꾸지 않는다', () => {
    const r = new DrillRunner(
      { kind: 'drill', setup: { standingPins: [7] }, goal: { kind: 'knockAll' }, attempts: 1 },
      'right',
    );
    r.recordThrow(info());
    const again = r.recordThrow(info({ result: result({ knockedPins: [7] }) }));
    expect(again.finished).toBe(true);
    expect(again.success).toBe(false);
    expect(r.attemptsUsed).toBe(1);
  });
});
