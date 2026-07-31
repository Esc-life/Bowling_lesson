import { describe, it, expect } from 'vitest';
import { Scorecard } from './Scorecard';

/** 굴림 배열을 한 번에 넣고 채점표를 만든다 */
function play(rolls: number[]): Scorecard {
  return Scorecard.fromRolls(rolls);
}

function repeat(value: number, times: number): number[] {
  return new Array<number>(times).fill(value);
}

/** 1~9프레임을 1핀+1핀으로 채운다 (프레임당 2점, 합 18점) */
const NINE_OPEN_FRAMES = repeat(1, 18);

describe('Scorecard — 알려진 게임 전체', () => {
  it('거터 게임은 0점', () => {
    const card = play(repeat(0, 20));
    expect(card.total).toBe(0);
    expect(card.isGameOver).toBe(true);
  });

  it('퍼펙트 게임(12연속 스트라이크)은 300점', () => {
    const card = play(repeat(10, 12));
    expect(card.total).toBe(300);
    expect(card.isGameOver).toBe(true);
  });

  it('모든 프레임 5-5 스페어는 150점', () => {
    const card = play(repeat(5, 21));
    expect(card.total).toBe(150);
    expect(card.isGameOver).toBe(true);
  });

  it('한 프레임도 못 채운 9핀 게임은 90점', () => {
    // 9-0을 10번 = 프레임당 9점
    const card = play(repeat(0, 20).map((_, i) => (i % 2 === 0 ? 9 : 0)));
    expect(card.total).toBe(90);
  });

  it('널리 쓰이는 예시 게임은 133점', () => {
    const card = play([1, 4, 4, 5, 6, 4, 5, 5, 10, 0, 1, 7, 3, 6, 4, 10, 2, 8, 6]);
    expect(card.total).toBe(133);

    const cumulatives = card.frames.map((f) => f.cumulative);
    expect(cumulatives).toEqual([5, 14, 29, 49, 60, 61, 77, 97, 117, 133]);
  });
});

describe('Scorecard — 보너스 계산', () => {
  it('스트라이크는 10 + 다음 두 번', () => {
    const card = play([10, 4, 3]);
    expect(card.frames[0]!.frameScore).toBe(17);
  });

  it('스페어는 10 + 다음 한 번', () => {
    const card = play([6, 4, 5, 2]);
    expect(card.frames[0]!.frameScore).toBe(15);
    expect(card.frames[1]!.frameScore).toBe(7);
  });

  it('오픈 프레임은 두 굴림의 합', () => {
    const card = play([3, 4]);
    expect(card.frames[0]!.frameScore).toBe(7);
    expect(card.frames[0]!.cumulative).toBe(7);
  });

  it('연속 스트라이크는 앞 프레임에 뒤 두 개가 더해진다', () => {
    const card = play([10, 10, 10, 0, 0]);
    expect(card.frames[0]!.frameScore).toBe(30);
    expect(card.frames[1]!.frameScore).toBe(20);
    expect(card.frames[2]!.frameScore).toBe(10);
  });
});

describe('Scorecard — 미확정 점수는 null', () => {
  it('스트라이크 직후에는 프레임 점수를 확정할 수 없다', () => {
    const card = play([10]);
    expect(card.frames[0]!.frameScore).toBeNull();
    expect(card.frames[0]!.cumulative).toBeNull();
    expect(card.total).toBe(0);
  });

  it('스트라이크 후 한 번만 던졌으면 아직 null', () => {
    const card = play([10, 5]);
    expect(card.frames[0]!.frameScore).toBeNull();
  });

  it('스페어 직후에는 아직 null', () => {
    const card = play([7, 3]);
    expect(card.frames[0]!.frameScore).toBeNull();
    expect(card.frames[0]!.isSpare).toBe(true);
  });

  it('앞 프레임이 미확정이면 뒤 프레임 누적도 null', () => {
    const card = play([10, 3, 4]);
    // 1프레임은 10+3+4=17로 확정된다
    expect(card.frames[0]!.cumulative).toBe(17);
    expect(card.frames[1]!.cumulative).toBe(24);
  });

  it('미확정 프레임 뒤의 누적은 전부 null', () => {
    const card = play([3, 4, 10]);
    expect(card.frames[0]!.cumulative).toBe(7);
    expect(card.frames[1]!.cumulative).toBeNull();
    expect(card.frames[2]!.cumulative).toBeNull();
  });
});

describe('Scorecard — 10프레임 특례', () => {
  it('스트라이크면 보너스 두 번을 더 던진다', () => {
    const card = play([...NINE_OPEN_FRAMES, 10]);
    expect(card.isGameOver).toBe(false);
    expect(card.pinsStanding).toBe(10);

    const withOne = play([...NINE_OPEN_FRAMES, 10, 10]);
    expect(withOne.isGameOver).toBe(false);

    const done = play([...NINE_OPEN_FRAMES, 10, 10, 10]);
    expect(done.isGameOver).toBe(true);
    expect(done.total).toBe(18 + 30);
  });

  it('스페어면 보너스 한 번을 더 던진다', () => {
    const two = play([...NINE_OPEN_FRAMES, 5, 5]);
    expect(two.isGameOver).toBe(false);

    const done = play([...NINE_OPEN_FRAMES, 5, 5, 7]);
    expect(done.isGameOver).toBe(true);
    expect(done.total).toBe(18 + 17);
  });

  it('오픈 프레임이면 두 번으로 끝난다', () => {
    const card = play([...NINE_OPEN_FRAMES, 4, 3]);
    expect(card.isGameOver).toBe(true);
    expect(card.total).toBe(18 + 7);
  });

  it('스트라이크 뒤 0을 던져도 세 번째 공이 있다', () => {
    const card = play([...NINE_OPEN_FRAMES, 10, 0]);
    expect(card.isGameOver).toBe(false);
    expect(card.pinsStanding).toBe(10);
  });

  it('스트라이크 뒤 3핀이면 남은 핀은 7개', () => {
    const card = play([...NINE_OPEN_FRAMES, 10, 3]);
    expect(card.pinsStanding).toBe(7);
  });

  it('X-X-X는 30점', () => {
    const card = play([...NINE_OPEN_FRAMES, 10, 10, 10]);
    expect(card.frames[9]!.frameScore).toBe(30);
  });
});

describe('Scorecard — 현재 위치', () => {
  it('새 게임은 1프레임 1구, 핀 10개', () => {
    const card = play([]);
    expect(card.currentFrame).toBe(1);
    expect(card.ballInFrame).toBe(1);
    expect(card.pinsStanding).toBe(10);
  });

  it('4핀을 쓰러뜨리면 남은 핀은 6개이고 같은 프레임 2구', () => {
    const card = play([4]);
    expect(card.currentFrame).toBe(1);
    expect(card.ballInFrame).toBe(2);
    expect(card.pinsStanding).toBe(6);
  });

  it('스트라이크면 바로 다음 프레임으로 넘어가고 핀은 10개', () => {
    const card = play([10]);
    expect(card.currentFrame).toBe(2);
    expect(card.ballInFrame).toBe(1);
    expect(card.pinsStanding).toBe(10);
  });

  it('9프레임까지 채우면 10프레임으로 넘어간다', () => {
    const card = play(NINE_OPEN_FRAMES);
    expect(card.currentFrame).toBe(10);
    expect(card.ballInFrame).toBe(1);
  });

  it('10프레임 3구째를 셀 수 있다', () => {
    const card = play([...NINE_OPEN_FRAMES, 10, 10]);
    expect(card.currentFrame).toBe(10);
    expect(card.ballInFrame).toBe(3);
  });

  it('게임이 끝나면 서 있는 핀은 0개', () => {
    const card = play(repeat(0, 20));
    expect(card.pinsStanding).toBe(0);
  });
});

describe('Scorecard — 잘못된 입력 방어', () => {
  it('핀 10개보다 많이 쓰러뜨릴 수 없다', () => {
    expect(() => play([11])).toThrow();
  });

  it('음수는 안 된다', () => {
    expect(() => play([-1])).toThrow();
  });

  it('정수가 아니면 안 된다', () => {
    expect(() => play([3.5])).toThrow();
  });

  it('한 프레임에서 두 굴림의 합이 10을 넘을 수 없다', () => {
    expect(() => play([5, 6])).toThrow();
  });

  it('게임이 끝난 뒤에는 던질 수 없다', () => {
    const card = play(repeat(0, 20));
    expect(() => card.roll(0)).toThrow();
  });

  it('10프레임 스트라이크 뒤에는 다시 10개까지 쓰러뜨릴 수 있다', () => {
    expect(() => play([...NINE_OPEN_FRAMES, 10, 10, 10])).not.toThrow();
  });

  it('10프레임 1구가 3핀이면 2구는 7핀을 넘을 수 없다', () => {
    expect(() => play([...NINE_OPEN_FRAMES, 3, 8])).toThrow();
  });
});

describe('Scorecard — 프레임 표시 정보', () => {
  it('프레임은 항상 10개이고 번호가 붙는다', () => {
    const card = play([]);
    expect(card.frames).toHaveLength(10);
    expect(card.frames.map((f) => f.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('스트라이크 프레임의 굴림은 한 개만 담긴다', () => {
    const card = play([10, 4, 4]);
    expect(card.frames[0]!.rolls).toEqual([10]);
    expect(card.frames[0]!.isStrike).toBe(true);
    expect(card.frames[1]!.rolls).toEqual([4, 4]);
  });

  it('10프레임 보너스 굴림까지 한 프레임에 담긴다', () => {
    const card = play([...NINE_OPEN_FRAMES, 10, 5, 4]);
    expect(card.frames[9]!.rolls).toEqual([10, 5, 4]);
  });

  it('아직 던지지 않은 프레임은 비어 있고 미완료', () => {
    const card = play([3, 4]);
    expect(card.frames[1]!.rolls).toEqual([]);
    expect(card.frames[1]!.isComplete).toBe(false);
    expect(card.frames[0]!.isComplete).toBe(true);
  });
});

describe('Scorecard — 짧은 경기 (프레임 수 지정)', () => {
  it('3프레임 거터 게임은 6굴림에 끝난다', () => {
    const card = new Scorecard(repeat(0, 6), 3);
    expect(card.totalFrames).toBe(3);
    expect(card.total).toBe(0);
    expect(card.isGameOver).toBe(true);
    expect(card.frames).toHaveLength(3);
  });

  it('3프레임 경기의 마지막 프레임에도 보너스 투구가 붙는다', () => {
    // 1,2프레임 오픈(1+1) → 3프레임 스트라이크 → 보너스 2번
    const card = new Scorecard([1, 1, 1, 1, 10, 10, 10], 3);
    expect(card.isGameOver).toBe(true);
    // 2 + 2 + (10+10+10) = 34
    expect(card.total).toBe(34);
    expect(card.frames[2]!.frameScore).toBe(30);
  });

  it('마지막 프레임 스트라이크 뒤에는 핀을 새로 세운다', () => {
    const card = new Scorecard([1, 1, 1, 1, 10], 3);
    expect(card.isGameOver).toBe(false);
    expect(card.pinsStanding).toBe(10);
    expect(card.currentFrame).toBe(3);
  });

  it('3프레임 퍼펙트는 5연속 스트라이크로 90점', () => {
    const card = new Scorecard(repeat(10, 5), 3);
    expect(card.total).toBe(90);
    expect(card.isGameOver).toBe(true);
  });

  it('5프레임 경기도 같은 규칙으로 동작한다', () => {
    const card = new Scorecard(repeat(10, 7), 5);
    expect(card.total).toBe(150);
    expect(card.isGameOver).toBe(true);
    expect(card.frames).toHaveLength(5);
  });

  it('인자를 주지 않으면 10프레임이다 (기존 동작)', () => {
    const card = new Scorecard();
    expect(card.totalFrames).toBe(10);
  });

  it('fromRolls도 프레임 수를 받는다', () => {
    const card = Scorecard.fromRolls([10, 10, 10, 10, 10], 3);
    expect(card.total).toBe(90);
  });

  it('프레임 수가 1 미만이면 거부한다', () => {
    expect(() => new Scorecard([], 0)).toThrow();
  });
});
