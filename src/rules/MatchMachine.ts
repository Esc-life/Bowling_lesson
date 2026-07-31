/**
 * 여러 명이 번갈아 던지는 매치.
 *
 * 순수 로직 — Three.js도 Rapier도 모른다. FrameMachine을 사람 수만큼
 * 갖고 있다가 지금 차례인 사람에게 위임한다. 점수 계산에는 일절
 * 관여하지 않으므로, 이미 검증된 FrameMachine·Scorecard를 건드리지
 * 않고 다인 플레이를 얹을 수 있다.
 *
 * 1인 경기도 "1명짜리 매치"로 표현한다. 자유 연습과 대전이 같은 코드를
 * 타야 한쪽만 조용히 망가지는 일이 없다.
 *
 * 턴을 넘길 때 ThrowResult.frameCompleted를 쓰면 안 된다. 마지막
 * 프레임에서 스트라이크를 치면 보너스 투구를 위해 핀을 새로 세우는데,
 * 그때도 frameCompleted가 true가 되어 보너스 투구를 다음 사람이 던지게
 * 된다. 프레임 번호가 실제로 바뀌었는지를 본다.
 */

import { FrameMachine, type ThrowResult } from './FrameMachine';
import type { Handedness, PinNumber } from './pinLayout';
import { TOTAL_FRAMES } from './Scorecard';

/** 한 레인에 설 수 있는 인원 — 점수판이 화면에 들어가는 한계이기도 하다 */
export const MAX_PLAYERS = 4;

export type MatchPlayer = {
  id: string;
  name: string;
  handedness: Handedness;
};

export type MatchThrowResult = ThrowResult & {
  /** 이 투구를 던진 사람 */
  playerId: string;
  /** 이 투구로 차례가 넘어갔는가 */
  turnChanged: boolean;
  /** 다음에 던질 사람. 매치가 끝났으면 null */
  nextPlayerId: string | null;
  /** 전원이 마지막 프레임을 끝냈는가 */
  matchOver: boolean;
};

export type Standing = {
  player: MatchPlayer;
  total: number;
  /** 1위부터. 동점은 공동 순위이고 다음 순위를 건너뛴다 */
  rank: number;
};

export class MatchMachine {
  private readonly _players: MatchPlayer[];
  private readonly machines = new Map<string, FrameMachine>();
  private index = 0;

  constructor(players: readonly MatchPlayer[], readonly totalFrames: number = TOTAL_FRAMES) {
    if (players.length === 0) {
      throw new Error('참가자가 최소 1명은 있어야 합니다.');
    }
    if (players.length > MAX_PLAYERS) {
      throw new Error(`참가자는 최대 ${MAX_PLAYERS}명입니다: ${players.length}명`);
    }
    const ids = new Set(players.map((p) => p.id));
    if (ids.size !== players.length) {
      throw new Error('참가자 id가 겹칩니다.');
    }

    this._players = [...players];
    for (const p of this._players) {
      this.machines.set(p.id, new FrameMachine(totalFrames));
    }
  }

  get players(): readonly MatchPlayer[] {
    return this._players;
  }

  get isMultiplayer(): boolean {
    return this._players.length > 1;
  }

  get activeIndex(): number {
    return this.index;
  }

  get active(): MatchPlayer {
    return this._players[this.index]!;
  }

  get activeMachine(): FrameMachine {
    return this.machines.get(this.active.id)!;
  }

  get isMatchOver(): boolean {
    return this._players.every((p) => this.machines.get(p.id)!.isGameOver);
  }

  machineOf(playerId: string): FrameMachine {
    const m = this.machines.get(playerId);
    if (m === undefined) throw new Error(`없는 참가자입니다: ${playerId}`);
    return m;
  }

  throwBall(): void {
    this.activeMachine.throwBall();
  }

  beginSettling(): void {
    this.activeMachine.beginSettling();
  }

  settle(stillStanding: readonly PinNumber[]): MatchThrowResult {
    return this.finish((m) => m.settle(stillStanding));
  }

  settleWithCount(knockedCount: number): MatchThrowResult {
    return this.finish((m) => m.settleWithCount(knockedCount));
  }

  /**
   * 굴림 하나를 처리하고 차례를 넘길지 정한다.
   *
   * 프레임 번호가 바뀌었거나 그 사람의 경기가 끝났으면 넘긴다.
   * frameCompleted를 쓰지 않는 이유는 파일 상단 주석에 있다.
   */
  private finish(roll: (m: FrameMachine) => ThrowResult): MatchThrowResult {
    if (this.isMatchOver) {
      throw new Error('매치가 이미 끝났습니다.');
    }

    const player = this.active;
    const machine = this.activeMachine;
    const frameBefore = machine.currentFrame;

    const result = roll(machine);

    const playerDone = machine.isGameOver;
    const turnChanged = playerDone || machine.currentFrame !== frameBefore;
    if (turnChanged) this.advance();

    const matchOver = this.isMatchOver;
    return {
      ...result,
      playerId: player.id,
      turnChanged,
      nextPlayerId: matchOver ? null : this.active.id,
      matchOver,
    };
  }

  /** 아직 안 끝난 다음 사람으로 넘긴다 */
  private advance(): void {
    if (this.isMatchOver) return;
    for (let step = 1; step <= this._players.length; step++) {
      const next = (this.index + step) % this._players.length;
      if (!this.machines.get(this._players[next]!.id)!.isGameOver) {
        this.index = next;
        return;
      }
    }
  }

  reset(): void {
    for (const m of this.machines.values()) m.reset();
    this.index = 0;
  }

  get ranking(): Standing[] {
    const rows = this._players
      .map((player) => ({ player, total: this.machines.get(player.id)!.scorecard.total }))
      .sort((a, b) => b.total - a.total);

    let rank = 0;
    let prevTotal: number | null = null;
    return rows.map((row, i) => {
      if (prevTotal === null || row.total !== prevTotal) {
        rank = i + 1;
        prevTotal = row.total;
      }
      return { ...row, rank };
    });
  }
}

/** 자유 연습·튜토리얼 드릴에서 쓰는 1명짜리 매치 */
export function soloMatch(name: string = '나', totalFrames: number = TOTAL_FRAMES): MatchMachine {
  return new MatchMachine([{ id: 'solo', name, handedness: 'right' }], totalFrames);
}
