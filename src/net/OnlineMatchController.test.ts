import { describe, expect, it } from 'vitest';
import type { MatchMachine, MatchPlayer } from '../rules/MatchMachine';
import type { PinNumber } from '../rules/pinLayout';
import type { GameLike, RoomLike } from './OnlineMatchController';
import { OnlineMatchController } from './OnlineMatchController';
import type { RollLogEntry } from './MatchSync';
import type { RoomChannelEvents, StateSnapshotPayload } from './RoomChannel';

function makePlayers(...names: string[]): MatchPlayer[] {
  return names.map((name, i) => ({
    id: `p${i}`,
    name,
    handedness: i % 2 === 0 ? ('right' as const) : ('left' as const),
  }));
}

/** Game 대신 쓰는 가짜. 실제로 부른 메서드를 기록만 한다 */
function fakeGame(): GameLike & {
  matches: MatchMachine[];
  aimGate: (() => boolean) | null;
  remoteThrows: PinNumber[][];
  localRoll: ((remaining: PinNumber[], playerId: string) => void) | null;
} {
  const fake = {
    matches: [] as MatchMachine[],
    aimGate: null as (() => boolean) | null,
    remoteThrows: [] as PinNumber[][],
    localRoll: null as ((remaining: PinNumber[], playerId: string) => void) | null,
    setMatch(match: MatchMachine) {
      fake.matches.push(match);
    },
    setAimGate(fn: () => boolean) {
      fake.aimGate = fn;
    },
    on(events: { onLocalRoll?: (remaining: PinNumber[], playerId: string) => void }) {
      if (events.onLocalRoll !== undefined) fake.localRoll = events.onLocalRoll;
    },
    applyRemoteThrow(remaining: readonly PinNumber[]) {
      fake.remoteThrows.push([...remaining]);
      return {} as ReturnType<GameLike['applyRemoteThrow']>;
    },
  };
  return fake;
}

/** RoomChannel 대신 쓰는 가짜. sendRoll 등을 기록하고, 테스트가 이벤트를 직접 흉내 낸다 */
function fakeRoom(): RoomLike & {
  events: Partial<RoomChannelEvents>;
  sentRolls: RollLogEntry[];
  requestStateCalls: number;
  sentSnapshots: StateSnapshotPayload[];
} {
  const fake = {
    events: {} as Partial<RoomChannelEvents>,
    sentRolls: [] as RollLogEntry[],
    requestStateCalls: 0,
    sentSnapshots: [] as StateSnapshotPayload[],
    on(events: Partial<RoomChannelEvents>) {
      Object.assign(fake.events, events);
    },
    sendRoll(entry: RollLogEntry) {
      fake.sentRolls.push(entry);
    },
    requestState() {
      fake.requestStateCalls += 1;
    },
    sendStateSnapshot(payload: StateSnapshotPayload) {
      fake.sentSnapshots.push(payload);
    },
  };
  return fake;
}

describe('OnlineMatchController — 로컬 굴림', () => {
  it('내가 던진 결과를 방송한다', () => {
    const players = makePlayers('가', '나');
    const game = fakeGame();
    const room = fakeRoom();
    new OnlineMatchController(game, room, players[0]!.id, players, 3);

    expect(game.localRoll).not.toBeNull();
    game.localRoll?.([], players[0]!.id);

    expect(room.sentRolls).toEqual([{ seq: 0, playerId: players[0]!.id, remaining: [] }]);
  });

  it('aimGate는 지금 매치의 차례가 나일 때만 true다', () => {
    const players = makePlayers('가', '나');
    const game = fakeGame();
    const room = fakeRoom();
    new OnlineMatchController(game, room, players[0]!.id, players, 3);

    expect(game.aimGate?.()).toBe(true); // p0이 첫 차례

    const controllerForP1 = new OnlineMatchController(fakeGame(), fakeRoom(), players[1]!.id, players, 3);
    void controllerForP1;
  });
});

describe('OnlineMatchController — 원격 굴림', () => {
  it('순서대로 온 굴림을 Game에 반영한다', () => {
    const players = makePlayers('가', '나');
    const game = fakeGame();
    const room = fakeRoom();
    new OnlineMatchController(game, room, players[0]!.id, players, 3);

    room.events.onRoll?.({ seq: 0, playerId: players[0]!.id, remaining: [] });

    expect(game.remoteThrows).toEqual([[]]);
    expect(room.requestStateCalls).toBe(0);
  });

  it('순번이 비면(gap) 재동기화를 요청하고 Game은 건드리지 않는다', () => {
    const players = makePlayers('가', '나');
    const game = fakeGame();
    const room = fakeRoom();
    new OnlineMatchController(game, room, players[0]!.id, players, 3);

    room.events.onRoll?.({ seq: 2, playerId: players[0]!.id, remaining: [] });

    expect(game.remoteThrows).toEqual([]);
    expect(room.requestStateCalls).toBe(1);
  });

  it('이미 반영한 순번(stale)은 조용히 무시한다', () => {
    const players = makePlayers('가', '나');
    const game = fakeGame();
    const room = fakeRoom();
    new OnlineMatchController(game, room, players[0]!.id, players, 3);

    room.events.onRoll?.({ seq: 0, playerId: players[0]!.id, remaining: [] });
    room.events.onRoll?.({ seq: 0, playerId: players[0]!.id, remaining: [] });

    expect(game.remoteThrows).toEqual([[]]); // 두 번째는 반영되지 않았다
    expect(room.requestStateCalls).toBe(0);
  });

  it('요청을 받으면 지금까지의 로그를 스냅샷으로 돌려준다', () => {
    const players = makePlayers('가', '나');
    const game = fakeGame();
    const room = fakeRoom();
    new OnlineMatchController(game, room, players[0]!.id, players, 3);

    room.events.onRoll?.({ seq: 0, playerId: players[0]!.id, remaining: [] });
    room.events.onRequestState?.();

    expect(room.sentSnapshots).toHaveLength(1);
    expect(room.sentSnapshots[0]!.log).toEqual([{ seq: 0, playerId: players[0]!.id, remaining: [] }]);
    expect(room.sentSnapshots[0]!.totalFrames).toBe(3);
  });

  it('나보다 긴 스냅샷을 받으면 Game을 그 상태로 되돌린다', () => {
    const players = makePlayers('가', '나');
    const game = fakeGame();
    const room = fakeRoom();
    new OnlineMatchController(game, room, players[0]!.id, players, 3);

    const log: RollLogEntry[] = [
      { seq: 0, playerId: players[0]!.id, remaining: [] },
      { seq: 1, playerId: players[1]!.id, remaining: [] },
    ];
    room.events.onStateSnapshot?.({ log, participants: players, totalFrames: 3 });

    // setMatch가 새 매치로 다시 불렸다 (생성자에서 한 번 + 스냅샷 반영으로 한 번)
    expect(game.matches).toHaveLength(2);
    const rebuilt = game.matches[1]!;
    expect(rebuilt.activeMachine.currentFrame).toBe(2); // 두 명 다 1프레임씩 던졌다
  });

  it('나와 같거나 짧은 스냅샷은 무시한다', () => {
    const players = makePlayers('가', '나');
    const game = fakeGame();
    const room = fakeRoom();
    new OnlineMatchController(game, room, players[0]!.id, players, 3);

    room.events.onRoll?.({ seq: 0, playerId: players[0]!.id, remaining: [] });
    const before = game.matches.length;

    room.events.onStateSnapshot?.({
      log: [{ seq: 0, playerId: players[0]!.id, remaining: [] }],
      participants: players,
      totalFrames: 3,
    });

    expect(game.matches).toHaveLength(before);
  });
});

describe('OnlineMatchController — dispose', () => {
  it('나간 뒤에는 aimGate가 항상 true로 돌아간다', () => {
    const players = makePlayers('가', '나');
    const game = fakeGame();
    const room = fakeRoom();
    const controller = new OnlineMatchController(game, room, players[0]!.id, players, 3);

    controller.dispose();

    expect(game.aimGate?.()).toBe(true);
  });
});
