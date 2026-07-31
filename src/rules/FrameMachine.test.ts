import { describe, it, expect } from 'vitest';
import { FrameMachine } from './FrameMachine';
import { ALL_PINS, type PinNumber } from './pinLayout';

/** 서 있는 핀 중 앞에서 n개를 쓰러뜨린다 */
function knock(m: FrameMachine, n: number) {
  m.throwBall();
  return m.settle(m.standingPins.slice(n));
}

/** 지정한 핀만 남기고 나머지를 쓰러뜨린다 */
function leave(m: FrameMachine, remaining: PinNumber[]) {
  m.throwBall();
  return m.settle(remaining);
}

describe('FrameMachine — 핀 배치 규칙', () => {
  it('시작하면 핀 10개가 서 있다', () => {
    const m = new FrameMachine();
    expect(m.standingPins).toEqual([...ALL_PINS]);
    expect(m.phase).toBe('aiming');
  });

  it('스트라이크를 치면 핀 10개를 새로 세운다', () => {
    const m = new FrameMachine();
    const r = knock(m, 10);
    expect(r.isStrike).toBe(true);
    expect(r.fullRackReset).toBe(true);
    expect(r.nextStanding).toEqual([...ALL_PINS]);
    expect(m.currentFrame).toBe(2);
  });

  it('1구에서 일부만 쓰러뜨리면 서 있던 핀만 그대로 남는다', () => {
    const m = new FrameMachine();
    const r = leave(m, [7, 10]);
    expect(r.isStrike).toBe(false);
    expect(r.knockedCount).toBe(8);
    expect(r.fullRackReset).toBe(false);
    expect(r.nextStanding).toEqual([7, 10]);
    expect(m.standingPins).toEqual([7, 10]);
    expect(m.currentFrame).toBe(1);
    expect(m.ballInFrame).toBe(2);
  });

  it('스페어를 처리하면 다시 10개를 세운다', () => {
    const m = new FrameMachine();
    leave(m, [7, 10]);
    const r = knock(m, 2);
    expect(r.isSpare).toBe(true);
    expect(r.fullRackReset).toBe(true);
    expect(r.nextStanding).toEqual([...ALL_PINS]);
    expect(m.currentFrame).toBe(2);
  });

  it('2구에서도 못 치우면 오픈 프레임으로 넘어가며 10개를 세운다', () => {
    const m = new FrameMachine();
    leave(m, [7, 10]);
    const r = leave(m, [10]);
    expect(r.isSpare).toBe(false);
    expect(r.knockedCount).toBe(1);
    expect(r.fullRackReset).toBe(true);
    expect(m.currentFrame).toBe(2);
  });

  it('한 핀도 못 쓰러뜨려도 핀은 그대로 서 있다', () => {
    const m = new FrameMachine();
    const r = leave(m, [...ALL_PINS]);
    expect(r.knockedCount).toBe(0);
    expect(r.nextStanding).toEqual([...ALL_PINS]);
    expect(m.ballInFrame).toBe(2);
  });

  it('2구의 스트라이크는 스트라이크가 아니다 (스페어다)', () => {
    const m = new FrameMachine();
    leave(m, [7, 10]);
    const r = knock(m, 2);
    expect(r.isStrike).toBe(false);
    expect(r.isSpare).toBe(true);
  });
});

describe('FrameMachine — 점수 연결', () => {
  it('스트라이크 뒤 두 굴림이 앞 프레임에 더해진다', () => {
    const m = new FrameMachine();
    knock(m, 10);
    leave(m, [...ALL_PINS.slice(4)]); // 4개 쓰러뜨림
    knock(m, 3);
    expect(m.scorecard.frames[0]!.frameScore).toBe(17);
  });

  it('퍼펙트 게임은 300점', () => {
    const m = new FrameMachine();
    for (let i = 0; i < 12; i++) knock(m, 10);
    expect(m.scorecard.total).toBe(300);
    expect(m.isGameOver).toBe(true);
    expect(m.phase).toBe('gameOver');
  });

  it('거터 게임은 0점이고 20번 던진다', () => {
    const m = new FrameMachine();
    let throws = 0;
    while (!m.isGameOver) {
      leave(m, [...m.standingPins]);
      throws++;
    }
    expect(throws).toBe(20);
    expect(m.scorecard.total).toBe(0);
  });
});

describe('FrameMachine — 10프레임', () => {
  /** 1~9프레임을 1핀씩만 쓰러뜨려 채운다 */
  function fillNineFrames(m: FrameMachine) {
    while (m.currentFrame < 10) knock(m, 1);
  }

  it('스트라이크를 치면 보너스 투구가 있고 핀이 새로 세워진다', () => {
    const m = new FrameMachine();
    fillNineFrames(m);
    const r = knock(m, 10);
    expect(r.gameOver).toBe(false);
    expect(r.fullRackReset).toBe(true);
    expect(m.standingPins).toHaveLength(10);
  });

  it('X-X-X로 끝나면 게임이 종료된다', () => {
    const m = new FrameMachine();
    fillNineFrames(m);
    knock(m, 10);
    knock(m, 10);
    const r = knock(m, 10);
    expect(r.gameOver).toBe(true);
    expect(m.phase).toBe('gameOver');
  });

  it('오픈 프레임이면 두 번으로 끝난다', () => {
    const m = new FrameMachine();
    fillNineFrames(m);
    knock(m, 4);
    const r = knock(m, 3);
    expect(r.gameOver).toBe(true);
  });

  it('게임이 끝나면 더 던질 수 없다', () => {
    const m = new FrameMachine();
    fillNineFrames(m);
    knock(m, 4);
    knock(m, 3);
    expect(() => m.throwBall()).toThrow();
  });
});

describe('FrameMachine — 잘못된 보고 방어', () => {
  it('넘어졌던 핀이 다시 서 있다고 하면 거부한다', () => {
    const m = new FrameMachine();
    leave(m, [7, 10]);
    m.throwBall();
    expect(() => m.settle([7, 10, 1])).toThrow(/서 있지 않던 핀/);
  });

  it('조준 상태에서 정지 처리를 할 수 없다', () => {
    const m = new FrameMachine();
    expect(() => m.settle([...ALL_PINS])).toThrow();
  });

  it('던진 상태에서 또 던질 수 없다', () => {
    const m = new FrameMachine();
    m.throwBall();
    expect(() => m.throwBall()).toThrow();
  });

  it('같은 핀이 중복 보고되어도 한 번으로 센다', () => {
    const m = new FrameMachine();
    m.throwBall();
    const r = m.settle([7, 7, 10]);
    expect(r.nextStanding).toEqual([7, 10]);
    expect(r.knockedCount).toBe(8);
  });
});

describe('FrameMachine — 디버그용 개수 입력', () => {
  it('물리 없이 10프레임을 통과할 수 있다', () => {
    const m = new FrameMachine();
    while (!m.isGameOver) {
      m.settleWithCount(m.standingPins.length);
    }
    expect(m.scorecard.total).toBe(300);
  });

  it('서 있는 핀보다 많이 쓰러뜨릴 수 없다', () => {
    const m = new FrameMachine();
    m.settleWithCount(4);
    expect(() => m.settleWithCount(7)).toThrow();
  });

  it('개수 입력으로도 스페어 상황이 정확하다', () => {
    const m = new FrameMachine();
    m.settleWithCount(8);
    expect(m.standingPins).toHaveLength(2);
    const r = m.settleWithCount(2);
    expect(r.isSpare).toBe(true);
  });
});

describe('FrameMachine — 문구', () => {
  it('스트라이크와 스페어에 문구가 붙는다', () => {
    const m = new FrameMachine();
    expect(knock(m, 10).message).toBe('스트라이크!');
    leave(m, [7, 10]);
    expect(knock(m, 2).message).toBe('스페어!');
  });

  it('스플릿이 남으면 격려 문구가 나온다', () => {
    const m = new FrameMachine();
    const r = leave(m, [7, 10]);
    expect(r.leftSplit).toBe(true);
    expect(r.message).toContain('떨어져');
  });

  it('한 개도 못 맞히면 격려 문구가 나온다', () => {
    const m = new FrameMachine();
    const r = leave(m, [...ALL_PINS]);
    expect(r.message).toContain('아쉬워요');
  });
});

describe('FrameMachine — 리셋', () => {
  it('리셋하면 처음 상태로 돌아간다', () => {
    const m = new FrameMachine();
    knock(m, 10);
    knock(m, 5);
    m.reset();
    expect(m.currentFrame).toBe(1);
    expect(m.ballInFrame).toBe(1);
    expect(m.scorecard.total).toBe(0);
    expect(m.standingPins).toEqual([...ALL_PINS]);
    expect(m.phase).toBe('aiming');
  });
});

describe('FrameMachine — 짧은 경기', () => {
  it('3프레임 경기는 3프레임을 끝내면 종료된다', () => {
    const m = new FrameMachine(3);
    expect(m.totalFrames).toBe(3);
    for (let i = 0; i < 6; i++) {
      m.settleWithCount(0);
    }
    expect(m.isGameOver).toBe(true);
    expect(m.phase).toBe('gameOver');
  });

  it('reset 후에도 프레임 수를 유지한다', () => {
    const m = new FrameMachine(3);
    m.settleWithCount(10);
    m.reset();
    expect(m.totalFrames).toBe(3);
    expect(m.currentFrame).toBe(1);
    expect(m.isGameOver).toBe(false);
  });

  it('인자가 없으면 10프레임이다', () => {
    expect(new FrameMachine().totalFrames).toBe(10);
  });
});
