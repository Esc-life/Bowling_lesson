import { describe, expect, it } from 'vitest';
import { MatchMachine, type MatchPlayer } from '../rules/MatchMachine';
import { buildMatchFromLog, MatchSync, type RollLogEntry } from './MatchSync';

function makePlayers(...names: string[]): MatchPlayer[] {
  return names.map((name, i) => ({
    id: `p${i}`,
    name,
    handedness: i % 2 === 0 ? ('right' as const) : ('left' as const),
  }));
}

/**
 * 매 굴림마다 서 있는 핀을 전부 쓰러뜨리는(=매번 스트라이크) 로그를 만든다.
 * 점수 계산 자체는 `MatchMachine.test.ts`가 이미 촘촘히 검증하므로, 여기서는
 * "같은 로그를 재생하면 같은 결과가 나오는가"만 본다 — 내용은 단순할수록 좋다.
 */
function buildAllStrikesLog(
  participants: readonly MatchPlayer[],
  totalFrames: number,
): { log: RollLogEntry[]; truth: MatchMachine } {
  const truth = new MatchMachine(participants, totalFrames);
  const log: RollLogEntry[] = [];
  let seq = 0;
  while (!truth.isMatchOver) {
    const playerId = truth.active.id;
    truth.throwBall();
    truth.settle([]);
    log.push({ seq, playerId, remaining: [] });
    seq += 1;
  }
  return { log, truth };
}

describe('MatchSync — 순서대로 반영', () => {
  it('로그를 순서대로 적용하면 원본과 같은 점수·차례가 된다', () => {
    const players = makePlayers('가', '나');
    const { log, truth } = buildAllStrikesLog(players, 3);

    const sync = new MatchSync(players, 3);
    for (const entry of log) {
      expect(sync.apply(entry)).toBe('applied');
    }

    expect(sync.match.isMatchOver).toBe(true);
    expect(sync.match.ranking).toEqual(truth.ranking);
    expect(sync.nextSeq).toBe(log.length);
  });

  it('세 명이 섞인 매치도 로그 하나로 동일하게 재현된다', () => {
    const players = makePlayers('가', '나', '다');
    const { log, truth } = buildAllStrikesLog(players, 5);

    const sync = new MatchSync(players, 5);
    for (const entry of log) sync.apply(entry);

    expect(sync.match.ranking).toEqual(truth.ranking);
  });
});

describe('MatchSync — 중복·순서 이상', () => {
  it('이미 반영한 순번이 다시 오면 stale이고 상태가 바뀌지 않는다', () => {
    const players = makePlayers('가', '나');
    const { log } = buildAllStrikesLog(players, 3);

    const sync = new MatchSync(players, 3);
    sync.apply(log[0]!);
    const before = sync.match.ranking;

    expect(sync.apply(log[0]!)).toBe('stale');
    expect(sync.match.ranking).toEqual(before);
    expect(sync.nextSeq).toBe(1);
  });

  it('순번이 비어 있으면 gap이고 반영하지 않는다', () => {
    const players = makePlayers('가', '나');
    const { log } = buildAllStrikesLog(players, 3);

    const sync = new MatchSync(players, 3);
    sync.apply(log[0]!);
    // log[1]을 건너뛰고 log[2]를 바로 적용하려 한다
    expect(sync.apply(log[2]!)).toBe('gap');
    expect(sync.nextSeq).toBe(1);
  });

  it('순번은 맞는데 다른 사람이 던진 것으로 되어 있으면 mismatch', () => {
    const players = makePlayers('가', '나');
    const { log } = buildAllStrikesLog(players, 3);

    const sync = new MatchSync(players, 3);
    const corrupted: RollLogEntry = { ...log[0]!, playerId: '없는사람' };
    expect(sync.apply(corrupted)).toBe('mismatch');
    expect(sync.nextSeq).toBe(0);
  });

  it('매치가 끝난 뒤에 오는 굴림은 stale이다', () => {
    const players = makePlayers('가', '나');
    const { log } = buildAllStrikesLog(players, 3);

    const sync = new MatchSync(players, 3);
    for (const entry of log) sync.apply(entry);

    const extra: RollLogEntry = { seq: log.length, playerId: players[0]!.id, remaining: [] };
    expect(sync.apply(extra)).toBe('stale');
  });
});

describe('MatchSync — replay', () => {
  it('뒤섞이고 중복된 로그를 넣어도 순서대로 정리해 처음부터 다시 만든다', () => {
    const players = makePlayers('가', '나');
    const { log, truth } = buildAllStrikesLog(players, 3);

    const shuffled = [...log, log[0]!, log[1]!].reverse();

    const sync = new MatchSync(players, 3);
    sync.replay(shuffled);

    expect(sync.match.ranking).toEqual(truth.ranking);
    expect(sync.nextSeq).toBe(log.length);
  });

  it('일부만 있는 로그로 replay하면 그만큼만 반영된다', () => {
    const players = makePlayers('가', '나');
    const { log } = buildAllStrikesLog(players, 5);

    const partial = log.slice(0, 3);
    const sync = new MatchSync(players, 5);
    sync.replay(partial);

    expect(sync.nextSeq).toBe(3);
    expect(sync.match.isMatchOver).toBe(false);
  });

  it('replay 뒤에도 apply로 이어서 반영할 수 있다', () => {
    const players = makePlayers('가', '나');
    const { log, truth } = buildAllStrikesLog(players, 3);

    const sync = new MatchSync(players, 3);
    sync.replay(log.slice(0, 2));
    for (const entry of log.slice(2)) {
      expect(sync.apply(entry)).toBe('applied');
    }

    expect(sync.match.ranking).toEqual(truth.ranking);
  });
});

describe('buildMatchFromLog', () => {
  it('로그로 만든 MatchMachine이 MatchSync가 재생한 것과 같다', () => {
    const players = makePlayers('가', '나');
    const { log } = buildAllStrikesLog(players, 3);

    const sync = new MatchSync(players, 3);
    for (const entry of log) sync.apply(entry);

    const built = buildMatchFromLog(players, 3, log);
    expect(built.ranking).toEqual(sync.match.ranking);
  });

  it('MatchSync 내부 인스턴스와 다른 객체다 — Game에 안전하게 넘길 수 있다', () => {
    const players = makePlayers('가', '나');
    const { log } = buildAllStrikesLog(players, 3);

    const sync = new MatchSync(players, 3);
    for (const entry of log) sync.apply(entry);

    const built = buildMatchFromLog(players, 3, log);
    expect(built).not.toBe(sync.match);
  });
});

describe('MatchSync — 두 기기 시뮬레이션', () => {
  it('같은 로그를 다른 인스턴스 두 개에 적용하면 완전히 같은 결과가 나온다', () => {
    const players = makePlayers('가', '나', '다');
    const { log } = buildAllStrikesLog(players, 10);

    const deviceA = new MatchSync(players, 10);
    const deviceB = new MatchSync(players, 10);
    for (const entry of log) {
      deviceA.apply(entry);
      deviceB.apply(entry);
    }

    expect(deviceA.match.ranking).toEqual(deviceB.match.ranking);
    for (const p of players) {
      expect(deviceA.match.machineOf(p.id).scorecard.total).toBe(
        deviceB.match.machineOf(p.id).scorecard.total,
      );
    }
  });
});
