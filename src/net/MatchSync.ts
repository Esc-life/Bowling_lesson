/**
 * "남은 핀" 로그를 재생해 여러 기기에서 똑같은 `MatchMachine`을 만든다.
 *
 * `FrameMachine`/`MatchMachine`은 순수 함수라 같은 순서로 같은 입력을
 * 넣으면 어느 기기에서 돌려도 점수·차례가 완전히 같다. 그래서 서버가
 * 점수를 계산할 필요가 없다 — 각자 "이번 굴림에 남은 핀" 배열을 순서대로
 * 받아 로컬에서 재생하기만 하면 된다(설계는
 * `docs/superpowers/specs/2026-08-01-online-match-design.md`).
 *
 * 네트워크를 전혀 모른다. `RoomChannel`이 이 클래스를 감싸 Supabase
 * Broadcast와 연결한다.
 */

import { MatchMachine, type MatchPlayer } from '../rules/MatchMachine';
import type { PinNumber } from '../rules/pinLayout';

export type RollLogEntry = {
  /** 0부터 시작하는 순번. 매치 안에서 굴림마다 하나씩 늘어난다 */
  seq: number;
  /** 이 굴림을 던진 사람 (검증용 — 실제 차례 판정은 MatchMachine이 한다) */
  playerId: string;
  /** 이 굴림 뒤 아직 서 있는 핀 */
  remaining: PinNumber[];
};

export type ApplyOutcome =
  /** 반영했다 */
  | 'applied'
  /** 이미 반영한 순번 — 중복 배달. 조용히 무시해도 된다 */
  | 'stale'
  /** 기대한 다음 순번보다 앞서 있다 — 사이가 비었다. 재동기화가 필요하다 */
  | 'gap'
  /** 순번은 맞는데 예상한 사람이 아니다 — 로그가 손상됐다. 재동기화가 필요하다 */
  | 'mismatch';

/**
 * 로그를 처음부터 재생해 새 `MatchMachine`을 만든다.
 *
 * `MatchSync.replay()`와 재동기화 스냅샷을 화면(`Game`)에 반영하는 쪽이
 * 둘 다 "로그 → MatchMachine"이 필요해서 함수 하나로 뺐다. `Game`에
 * 넘길 인스턴스는 `MatchSync` 내부 인스턴스와 절대 같은 객체를 공유하면
 * 안 된다 — 공유하면 `MatchSync.apply()`가 `Game`을 거치지 않고 직접
 * 매치를 바꿔, 핀 표시·배너 같은 화면 반영이 조용히 빠진다.
 */
export function buildMatchFromLog(
  participants: readonly MatchPlayer[],
  totalFrames: number,
  entries: readonly RollLogEntry[],
): MatchMachine {
  const match = new MatchMachine(participants, totalFrames);
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  let expected = 0;
  for (const entry of sorted) {
    if (entry.seq !== expected) continue; // 중복·구멍은 건너뛴다
    if (match.isMatchOver) break;
    match.throwBall();
    match.settle(entry.remaining);
    expected += 1;
  }
  return match;
}

export class MatchSync {
  private _match: MatchMachine;
  private applied = 0;

  constructor(
    private readonly participants: readonly MatchPlayer[],
    private readonly totalFrames: number,
  ) {
    this._match = new MatchMachine(participants, totalFrames);
  }

  /** 지금까지 재생된 상태 */
  get match(): MatchMachine {
    return this._match;
  }

  /** 다음에 기대하는 순번 (= 지금까지 반영한 굴림 수) */
  get nextSeq(): number {
    return this.applied;
  }

  get log(): readonly RollLogEntry[] {
    return this._log;
  }

  private _log: RollLogEntry[] = [];

  /** 굴림 하나를 반영한다. 순서를 벗어나면 반영하지 않고 이유를 돌려준다 */
  apply(entry: RollLogEntry): ApplyOutcome {
    if (this._match.isMatchOver || entry.seq < this.applied) return 'stale';
    if (entry.seq > this.applied) return 'gap';
    if (entry.playerId !== this._match.active.id) return 'mismatch';

    this._match.throwBall();
    this._match.settle(entry.remaining);
    this._log.push(entry);
    this.applied += 1;
    return 'applied';
  }

  /**
   * 처음부터 다시 재생한다 (재동기화용). `entries`는 seq 오름차순이 아니어도
   * 되고 중복이 있어도 된다 — 정렬·중복 제거 후 순서대로 적용한다.
   */
  replay(entries: readonly RollLogEntry[]): void {
    this._match = new MatchMachine(this.participants, this.totalFrames);
    this._log = [];
    this.applied = 0;

    const sorted = [...entries].sort((a, b) => a.seq - b.seq);
    for (const entry of sorted) {
      if (entry.seq !== this.applied) continue; // 중복·구멍은 건너뛴다
      if (this._match.isMatchOver) break;
      this._match.throwBall();
      this._match.settle(entry.remaining);
      this._log.push(entry);
      this.applied += 1;
    }
  }
}
