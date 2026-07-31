import { describe, it, expect } from 'vitest';
import { MatchMachine, soloMatch, type MatchPlayer } from './MatchMachine';

function makePlayers(...names: string[]): MatchPlayer[] {
  return names.map((name, i) => ({
    id: `p${i}`,
    name,
    handedness: i % 2 === 0 ? ('right' as const) : ('left' as const),
  }));
}

/** 현재 플레이어가 프레임 하나를 오픈(0+0)으로 끝낸다 */
function openFrame(m: MatchMachine): void {
  m.settleWithCount(0);
  m.settleWithCount(0);
}

describe('MatchMachine — 생성', () => {
  it('참가자가 없으면 거부한다', () => {
    expect(() => new MatchMachine([])).toThrow();
  });

  it('5명 이상은 거부한다', () => {
    expect(() => new MatchMachine(makePlayers('가', '나', '다', '라', '마'))).toThrow();
  });

  it('같은 id가 두 번 오면 거부한다', () => {
    const dup: MatchPlayer[] = [
      { id: 'x', name: '가', handedness: 'right' },
      { id: 'x', name: '나', handedness: 'left' },
    ];
    expect(() => new MatchMachine(dup)).toThrow();
  });

  it('1명짜리 매치는 멀티플레이가 아니다', () => {
    const m = soloMatch('연습');
    expect(m.isMultiplayer).toBe(false);
    expect(m.players).toHaveLength(1);
    expect(m.totalFrames).toBe(10);
  });

  it('soloMatch는 넘긴 손을 그대로 보존한다', () => {
    const m = soloMatch('민준', 3, 'left');
    expect(m.active.handedness).toBe('left');
    expect(m.active.name).toBe('민준');
    expect(m.totalFrames).toBe(3);
  });

  it('soloMatch의 손 기본값은 오른손이다', () => {
    expect(soloMatch().active.handedness).toBe('right');
  });

  it('reset 후에도 손이 유지된다 — restart가 손을 되돌리면 안 된다', () => {
    const m = soloMatch('민준', 3, 'left');
    m.settleWithCount(10);
    m.reset();
    expect(m.active.handedness).toBe('left');
  });
});

describe('MatchMachine — 턴 순서', () => {
  it('프레임을 끝내면 다음 사람에게 넘어간다', () => {
    const m = new MatchMachine(makePlayers('가', '나'), 3);
    expect(m.active.name).toBe('가');

    m.settleWithCount(0);
    expect(m.active.name).toBe('가'); // 아직 2구가 남았다

    const r = m.settleWithCount(0);
    expect(r.turnChanged).toBe(true);
    expect(r.nextPlayerId).toBe('p1');
    expect(m.active.name).toBe('나');
  });

  it('스트라이크는 1구에 프레임이 끝나므로 바로 턴이 넘어간다', () => {
    const m = new MatchMachine(makePlayers('가', '나'), 3);
    const r = m.settleWithCount(10);
    expect(r.isStrike).toBe(true);
    expect(r.turnChanged).toBe(true);
    expect(m.active.name).toBe('나');
  });

  it('마지막 프레임 스트라이크 뒤 보너스 투구는 턴이 넘어가지 않는다', () => {
    // 이것이 frameCompleted를 턴 신호로 쓰면 안 되는 이유다.
    const m = new MatchMachine(makePlayers('가', '나'), 3);
    openFrame(m); // 가 1프레임
    openFrame(m); // 나 1프레임
    openFrame(m); // 가 2프레임
    openFrame(m); // 나 2프레임
    expect(m.active.name).toBe('가');

    const r = m.settleWithCount(10); // 가의 3프레임(마지막) 스트라이크
    expect(r.turnChanged).toBe(false);
    expect(m.active.name).toBe('가');

    m.settleWithCount(10); // 보너스 1
    expect(m.active.name).toBe('가');

    const last = m.settleWithCount(10); // 보너스 2 — 가는 여기서 끝
    expect(last.turnChanged).toBe(true);
    expect(m.active.name).toBe('나');
  });

  it('끝난 사람은 건너뛴다', () => {
    const m = new MatchMachine(makePlayers('가', '나'), 1);
    openFrame(m); // 가 종료
    expect(m.active.name).toBe('나');
    openFrame(m); // 나 종료
    expect(m.isMatchOver).toBe(true);
  });
});

describe('MatchMachine — 매치 종료와 순위', () => {
  it('전원이 끝나야 매치가 끝난다', () => {
    const m = new MatchMachine(makePlayers('가', '나', '다'), 1);
    openFrame(m);
    expect(m.isMatchOver).toBe(false);
    openFrame(m);
    expect(m.isMatchOver).toBe(false);
    openFrame(m);
    expect(m.isMatchOver).toBe(true);
  });

  it('총점 내림차순으로 순위를 매긴다', () => {
    const m = new MatchMachine(makePlayers('가', '나'), 1);
    m.settleWithCount(3);
    m.settleWithCount(4); // 가 = 7점
    m.settleWithCount(1);
    m.settleWithCount(1); // 나 = 2점

    const r = m.ranking;
    expect(r[0]!.player.name).toBe('가');
    expect(r[0]!.total).toBe(7);
    expect(r[0]!.rank).toBe(1);
    expect(r[1]!.player.name).toBe('나');
    expect(r[1]!.rank).toBe(2);
  });

  it('동점은 공동 순위이고 다음 순위를 건너뛴다', () => {
    const m = new MatchMachine(makePlayers('가', '나', '다'), 1);
    m.settleWithCount(3);
    m.settleWithCount(4); // 가 = 7
    m.settleWithCount(3);
    m.settleWithCount(4); // 나 = 7
    m.settleWithCount(1);
    m.settleWithCount(0); // 다 = 1

    const ranks = m.ranking.map((s) => s.rank);
    expect(ranks).toEqual([1, 1, 3]);
  });

  it('게임이 끝난 뒤 던지면 거부한다', () => {
    const m = new MatchMachine(makePlayers('가'), 1);
    openFrame(m);
    expect(() => m.settleWithCount(0)).toThrow();
  });
});

describe('MatchMachine — 점수 격리와 리셋', () => {
  it('사람마다 점수판이 따로 간다', () => {
    // totalFrames=1이면 그 프레임이 곧 "마지막 프레임"이라 스트라이크가
    // 보너스 투구를 요구한다(위의 함정과 동일한 상황). 그러면 턴이 넘어가지
    // 않아 이 테스트의 의도(점수판 격리)를 확인할 수 없으므로 2프레임으로 둔다.
    const m = new MatchMachine(makePlayers('가', '나'), 2);
    m.settleWithCount(10); // 가 스트라이크
    m.settleWithCount(0);
    m.settleWithCount(0); // 나 거터

    expect(m.machineOf('p0').scorecard.rolls).toEqual([10]);
    expect(m.machineOf('p1').scorecard.rolls).toEqual([0, 0]);
  });

  it('reset은 첫 사람부터 다시 시작한다', () => {
    const m = new MatchMachine(makePlayers('가', '나'), 3);
    m.settleWithCount(10);
    expect(m.active.name).toBe('나');

    m.reset();
    expect(m.active.name).toBe('가');
    expect(m.activeIndex).toBe(0);
    expect(m.isMatchOver).toBe(false);
    expect(m.machineOf('p0').scorecard.rolls).toEqual([]);
  });

  it('없는 id를 물으면 거부한다', () => {
    const m = soloMatch();
    expect(() => m.machineOf('없음')).toThrow();
  });
});
