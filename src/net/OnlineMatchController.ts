/**
 * 온라인 대전이 진행되는 동안 `Game`과 `RoomChannel`을 잇는다.
 *
 * `MatchSync`(순수, 네트워크를 모름)가 "지금까지 반영한 로그"의 정답을
 * 들고 있고, 이 클래스는 그 판정에 따라 `Game`을 갱신하거나 방송하거나
 * 재동기화를 요청한다. `Game._match`와 `MatchSync`의 내부 매치는 **절대
 * 같은 객체를 공유하지 않는다** — 공유하면 `MatchSync.apply()`가 `Game`을
 * 거치지 않고 매치를 바꿔 버려 핀 표시·배너가 조용히 안 나온다
 * (`buildMatchFromLog`의 주석 참고).
 */

import type { Game } from '../core/Game';
import { MatchMachine, type MatchPlayer } from '../rules/MatchMachine';
import type { PinNumber } from '../rules/pinLayout';
import { buildMatchFromLog, MatchSync, type RollLogEntry } from './MatchSync';
import type { RoomChannel, StateSnapshotPayload } from './RoomChannel';

/** 이 컨트롤러가 `Game`/`RoomChannel`에서 실제로 쓰는 부분만 — 테스트에서 가짜로 대신할 수 있게 좁혀 둔다 */
export type GameLike = Pick<Game, 'setMatch' | 'setAimGate' | 'on' | 'applyRemoteThrow'>;
export type RoomLike = Pick<RoomChannel, 'on' | 'sendRoll' | 'requestState' | 'sendStateSnapshot'>;

export class OnlineMatchController {
  private readonly sync: MatchSync;

  constructor(
    private readonly game: GameLike,
    private readonly room: RoomLike,
    private readonly selfId: string,
    participants: readonly MatchPlayer[],
    totalFrames: number,
  ) {
    this.sync = new MatchSync(participants, totalFrames);
    this.game.setMatch(new MatchMachine(participants, totalFrames));
    this.game.setAimGate(() => this.sync.match.active.id === this.selfId);

    this.game.on({ onLocalRoll: (remaining, playerId) => this.handleLocalRoll(remaining, playerId) });
    this.room.on({
      onRoll: (entry) => this.handleRemoteRoll(entry),
      onRequestState: () => this.handleRequestState(),
      onStateSnapshot: (payload) => this.handleStateSnapshot(payload),
    });
  }

  /** 온라인 대전을 나갈 때 — Game을 다시 로컬 전용 상태로 되돌린다 */
  dispose(): void {
    this.game.setAimGate(() => true);
    this.game.on({ onLocalRoll: () => {} });
    this.room.on({ onRoll: () => {}, onRequestState: () => {}, onStateSnapshot: () => {} });
  }

  private handleLocalRoll(remaining: PinNumber[], playerId: string): void {
    const entry: RollLogEntry = { seq: this.sync.nextSeq, playerId, remaining };
    const outcome = this.sync.apply(entry);
    if (outcome === 'applied') {
      this.room.sendRoll(entry);
      return;
    }
    // 로컬에서 방금 물리로 확정한 굴림인데 반영되지 않았다 — sync가 Game과
    // 어긋났다는 뜻이다. 조용히 삼키면 다른 사람 화면과 점수가 갈라지므로
    // 재동기화를 요청한다(내가 응답자 목록에 있으면 나 자신도 응답하지만,
    // 이 상황 자체가 버그 신호라 로그를 남긴다).
    console.error('[온라인 대전] 로컬 굴림을 반영하지 못했습니다:', outcome, entry);
    this.room.requestState();
  }

  private handleRemoteRoll(entry: RollLogEntry): void {
    const outcome = this.sync.apply(entry);
    if (outcome === 'applied') {
      this.game.applyRemoteThrow(entry.remaining);
      return;
    }
    if (outcome === 'stale') return; // 이미 반영한 굴림 — 조용히 무시
    this.room.requestState(); // gap 또는 mismatch
  }

  private handleRequestState(): void {
    this.room.sendStateSnapshot({
      log: [...this.sync.log],
      participants: [...this.sync.match.players],
      totalFrames: this.sync.match.totalFrames,
    });
  }

  private handleStateSnapshot(payload: StateSnapshotPayload): void {
    if (payload.log.length <= this.sync.nextSeq) return; // 내가 이미 그만큼 갖고 있다

    this.sync.replay(payload.log);
    // Game에는 별도 인스턴스를 준다 — 이유는 파일 상단 주석 참고
    const forGame = buildMatchFromLog(this.sync.match.players, this.sync.match.totalFrames, this.sync.log);
    this.game.setMatch(forGame);
  }
}
