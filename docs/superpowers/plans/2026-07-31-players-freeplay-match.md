# 플레이어 · 자유 연습 · 다인 매치 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 플레이어별 이름·진행률 저장, 전체 수료 후 열리는 자유 연습, 같은 기기에서 2~4명이 번갈아 하는 매치를 만든다. 온라인 실시간 대전은 이 계획에 없다(별도 3단계).

**Architecture:** `FrameMachine`을 사람 수만큼 감싸는 순수 클래스 `MatchMachine`을 새로 얹는다. `FrameMachine`과 `Scorecard`의 점수 계산 로직은 건드리지 않아 기존 183개 테스트가 그대로 통과한다. 1인 경기는 "1명짜리 매치"라서 자유 연습과 대전이 같은 코드 경로를 탄다. 저장은 `localStorage` 한 키(`bowling3d.players.v1`)에 플레이어 배열로 모은다.

**Tech Stack:** Vite + TypeScript(strict) + Three.js + Rapier, Vitest(`environment: 'node'`)

**스펙:** `docs/superpowers/specs/2026-07-31-players-freeplay-match-design.md`

## Global Constraints

- 언어: 모든 주석·문서·UI 문구는 **한국어**. 대상은 초등 고학년(10~12세)이므로 쉬운 말을 쓴다.
- `src/rules/FrameMachine.ts`의 기존 로직과 `Scorecard`의 점수 계산은 **수정 금지**. `Scorecard`는 프레임 수 파라미터화만 허용한다.
- 테스트 환경이 `environment: 'node'`라 **`localStorage`와 DOM이 없다**. 저장소를 다루는 코드는 주입 가능한 `StorageLike`를 받아야 테스트할 수 있다. DOM을 만지는 UI 클래스는 유닛 테스트하지 않고 타입 검사·빌드·브라우저 실기로 검증한다.
- 인원은 **2~4명**, 프레임 수는 **3 / 5 / 10** 중 하나.
- 이름은 **1~12자**, 앞뒤 공백 제거, 빈 이름·중복 금지.
- 좌우 규칙: `투구자의 오른쪽 = 월드 -X = 화면 오른쪽` (기존 규칙, 바꾸지 않는다).
- 방향 중립 문구 규칙: 드릴·연습 안내에 "왼쪽/오른쪽"을 쓰지 않는다. 핀 배치는 미러링되지만 글은 미러링되지 않는다.
- 검증 명령: `npm test` · `npm run typecheck` · `npm run build`
- 커밋 메시지는 한국어 한 줄 요약 + 필요하면 본문.

## 파일 구성

**신규**

| 파일 | 책임 |
|---|---|
| `src/players/types.ts` | `Player`, `StorageLike` 타입 |
| `src/players/PlayerStore.ts` | 플레이어 CRUD · 영속화 · 구버전 이관 |
| `src/players/PlayerStore.test.ts` | 위 테스트 |
| `src/players/unlock.ts` | 순수. 수료 판정 → 자유 연습·대전 해금과 사유 문구 |
| `src/players/unlock.test.ts` | 위 테스트 |
| `src/rules/MatchMachine.ts` | 순수. 턴 순서 · 매치 종료 · 순위 |
| `src/rules/MatchMachine.test.ts` | 위 테스트 |
| `src/practice/PracticeSession.ts` | 순수. 연습 투구 랙·카운터·문구 |
| `src/practice/PracticeSession.test.ts` | 위 테스트 |
| `src/ui/PlayerPicker.ts` | 플레이어 선택 · 생성(이름+손) · 삭제 |
| `src/ui/PracticeSetup.ts` | 자유 연습 종류 고르기 + 핀 배치 고르기 |
| `src/ui/MatchSetup.ts` | 참가자 고르기 + 프레임 수 고르기 |

**수정**

| 파일 | 변경 |
|---|---|
| `src/rules/Scorecard.ts` | `TOTAL_FRAMES` 모듈 상수 → 생성자 인자(기본 10) |
| `src/rules/FrameMachine.ts` | 생성자에 `totalFrames` 추가해 `Scorecard`로 전달 (로직 불변) |
| `src/core/Game.ts` | `machine: FrameMachine` → `match: MatchMachine` 위임, `setHandedness()` 공개 |
| `src/settings.ts` | `handedness` 제거 |
| `src/ui/Scoreboard.ts` | 마지막 프레임을 `10` 대신 `frames.length`로 판정, 다인 표시 |
| `src/ui/AreaMenu.ts` | 홈 역할 — 자유 연습·대전 버튼과 잠금 표시 추가 |
| `src/ui/HandPicker.ts` | 삭제. 손 고르기는 `PlayerPicker` 생성 화면으로 |
| `src/tutorial/Progress.ts` | `localStorage` 직접 접근 제거, `PlayerStore` 경유 |
| `src/ui/TutorialUI.ts` | `settings.hand` → 현재 플레이어의 손 |
| `src/main.ts` | 부트스트랩 순서 변경, 딥링크 `?player=` 추가 |
| `src/styles.css` | 새 화면 스타일 |

---

## Task 1: `Scorecard` 프레임 수 파라미터화

3프레임·5프레임 경기를 만들려면 `TOTAL_FRAMES = 10` 모듈 상수를 인스턴스 값으로 빼야 한다. 이 상수는 `Scorecard.ts` 밖에서 쓰이지 않으므로 변경 범위가 파일 하나로 닫힌다.

**Files:**
- Modify: `src/rules/Scorecard.ts`
- Test: `src/rules/Scorecard.test.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `new Scorecard(rolls: readonly number[] = [], totalFrames: number = 10)`
  - `Scorecard.fromRolls(rolls: readonly number[], totalFrames?: number): Scorecard`
  - `scorecard.totalFrames: number` (getter)
  - `TOTAL_FRAMES = 10`은 **기본값 상수로 남긴다** (export 유지)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/rules/Scorecard.test.ts` 맨 아래에 추가:

```typescript
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
npm test -- src/rules/Scorecard.test.ts
```

Expected: FAIL — `totalFrames` 속성이 없고 두 번째 인자가 무시되어 10프레임으로 계산된다.

- [ ] **Step 3: `Scorecard`를 고친다**

`src/rules/Scorecard.ts`에서 **모든 `TOTAL_FRAMES` 참조를 `this.total_`로 바꾼다.** 아래가 바뀌는 지점 전부다(이 외에는 손대지 않는다).

파일 상단 주석과 상수:

```typescript
/**
 * 볼링 점수 계산 (기본 10프레임).
 *
 * 순수 로직 — Three.js도 Rapier도 모른다. 굴림 배열 하나를 진실의
 * 원천으로 두고 프레임 점수를 파생 계산한다. 상태를 프레임별로 쪼개
 * 저장하지 않는 이유는, 스트라이크·스페어 보너스가 "뒤의 굴림"에
 * 의존하기 때문이다. 배열 하나면 look-ahead가 자연스럽다.
 *
 * 프레임 수를 인자로 받는 이유: 대전에서 3·5프레임 짧은 경기를 고를 수
 * 있어야 한다. 마지막 프레임의 보너스 투구 규칙은 프레임 수와 무관하게
 * 그대로 적용되므로, 짧은 경기도 마지막 칸까지 점수가 확정된다.
 *
 * 이 클래스는 튜토리얼 퀴즈의 정답 계산기로도 쓰인다. 그래서 퀴즈
 * 정답을 손으로 적어 둘 필요가 없고, 규칙 구현과 교육 내용이 어긋날
 * 수 없다.
 */

/** 정식 경기의 프레임 수 — 지정하지 않았을 때의 기본값 */
export const TOTAL_FRAMES = 10;
export const PIN_COUNT = 10;
```

생성자와 `fromRolls`:

```typescript
export class Scorecard {
  private readonly _rolls: number[] = [];
  private readonly total_: number;

  constructor(rolls: readonly number[] = [], totalFrames: number = TOTAL_FRAMES) {
    if (!Number.isInteger(totalFrames) || totalFrames < 1) {
      throw new Error(`프레임 수는 1 이상의 정수여야 합니다: ${totalFrames}`);
    }
    this.total_ = totalFrames;
    for (const r of rolls) this.roll(r);
  }

  /** 굴림 배열로부터 채점표를 만든다 (퀴즈 문항 생성용) */
  static fromRolls(rolls: readonly number[], totalFrames: number = TOTAL_FRAMES): Scorecard {
    return new Scorecard(rolls, totalFrames);
  }

  get totalFrames(): number {
    return this.total_;
  }
```

나머지 치환 — **의미는 바꾸지 말고 이름만 바꾼다**:

| 위치 | 변경 전 | 변경 후 |
|---|---|---|
| `segments()` 루프 | `f < TOTAL_FRAMES - 1` | `f < this.total_ - 1` |
| `tenthRolls()` | `segs[TOTAL_FRAMES - 1]!` | `segs[this.total_ - 1]!` |
| `isFrameComplete()` | `f === TOTAL_FRAMES - 1` | `f === this.total_ - 1` |
| `frameScoreAt()` | `f === TOTAL_FRAMES - 1` | `f === this.total_ - 1` |
| `frames` getter 루프 | `f < TOTAL_FRAMES` | `f < this.total_` |
| `total` getter 루프 | `f < TOTAL_FRAMES` | `f < this.total_` |
| `currentFrame` 루프 | `f < TOTAL_FRAMES` / `return TOTAL_FRAMES` | `f < this.total_` / `return this.total_` |
| `pinsStanding` | `frame < TOTAL_FRAMES` | `frame < this.total_` |
| `isGameOver` 루프 | `f < TOTAL_FRAMES - 1` | `f < this.total_ - 1` |

`tenthRolls` / `isTenthComplete`는 이름이 "10프레임"을 뜻하므로 **`lastFrameRolls` / `isLastFrameComplete`로 바꾸고** 호출부 4곳을 함께 고친다. 이름이 거짓말을 하면 다음 사람이 3프레임 경기를 디버깅할 때 헤맨다.

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
npm test
```

Expected: PASS — 새 테스트 8개 + 기존 183개 전부 통과. **기존 테스트가 하나라도 깨지면 치환을 잘못한 것이다.** 되돌려서 다시 한다.

- [ ] **Step 5: 커밋**

```bash
git add src/rules/Scorecard.ts src/rules/Scorecard.test.ts
git commit -m "Scorecard 프레임 수를 생성자 인자로 뺌 (기본 10)"
```

---

## Task 2: `FrameMachine`에 프레임 수 전달

**Files:**
- Modify: `src/rules/FrameMachine.ts:49-53`, `src/rules/FrameMachine.ts:183-188`
- Test: `src/rules/FrameMachine.test.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: `new Scorecard(rolls, totalFrames)` (Task 1)
- Produces:
  - `new FrameMachine(totalFrames: number = 10)`
  - `frameMachine.totalFrames: number` (getter)
  - `reset()`은 같은 `totalFrames`를 유지한다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/rules/FrameMachine.test.ts` 맨 아래에 추가:

```typescript
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
npm test -- src/rules/FrameMachine.test.ts
```

Expected: FAIL — `totalFrames` 없음, 3프레임 경기가 6굴림에 끝나지 않음.

- [ ] **Step 3: `FrameMachine`을 고친다**

생성자만 바꾼다. `settle()` 로직은 **한 줄도 건드리지 않는다.**

```typescript
export class FrameMachine {
  private card: Scorecard;
  private _standing: PinNumber[];
  private _phase: GamePhase;
  private _lastResult: ThrowResult | null = null;

  constructor(private readonly frames: number = TOTAL_FRAMES) {
    this.card = new Scorecard([], frames);
    this._standing = [...ALL_PINS];
    this._phase = 'aiming';
  }

  get totalFrames(): number {
    return this.frames;
  }
```

`reset()`:

```typescript
  /** 처음부터 다시 */
  reset(): void {
    this.card = new Scorecard([], this.frames);
    this._standing = [...ALL_PINS];
    this._phase = 'aiming';
    this._lastResult = null;
  }
```

import에 `TOTAL_FRAMES`를 추가한다:

```typescript
import { Scorecard, PIN_COUNT, TOTAL_FRAMES } from './Scorecard';
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
npm test && npm run typecheck
```

Expected: PASS 전부.

- [ ] **Step 5: 커밋**

```bash
git add src/rules/FrameMachine.ts src/rules/FrameMachine.test.ts
git commit -m "FrameMachine이 프레임 수를 받아 Scorecard로 넘기게 함"
```

---

## Task 3: `MatchMachine` — 다인 매치 상태머신

이 계획에서 가장 중요한 파일이다. **함정이 하나 있다:** `ThrowResult.frameCompleted`는 `fullRackReset || gameOver`인데, 마지막 프레임에서 스트라이크를 치면 보너스 투구를 위해 핀을 새로 세우므로 `fullRackReset === true`가 된다. 이걸 턴 넘김 신호로 쓰면 **마지막 프레임에서 보너스 투구를 다음 사람이 던지게 된다.** 그래서 `currentFrame`이 실제로 바뀌었는지로 판정한다.

**Files:**
- Create: `src/rules/MatchMachine.ts`
- Test: `src/rules/MatchMachine.test.ts`

**Interfaces:**
- Consumes: `FrameMachine`(Task 2), `ThrowResult`, `PinNumber`, `Handedness`
- Produces:

```typescript
export type MatchPlayer = { id: string; name: string; handedness: Handedness };
export type MatchThrowResult = ThrowResult & {
  playerId: string;
  turnChanged: boolean;
  nextPlayerId: string | null;
  matchOver: boolean;
};
export type Standing = { player: MatchPlayer; total: number; rank: number };

export class MatchMachine {
  constructor(players: readonly MatchPlayer[], totalFrames?: number);
  readonly totalFrames: number;
  get players(): readonly MatchPlayer[];
  get isMultiplayer(): boolean;
  get activeIndex(): number;
  get active(): MatchPlayer;
  get activeMachine(): FrameMachine;
  get isMatchOver(): boolean;
  machineOf(playerId: string): FrameMachine;
  throwBall(): void;
  beginSettling(): void;
  settle(stillStanding: readonly PinNumber[]): MatchThrowResult;
  settleWithCount(knockedCount: number): MatchThrowResult;
  reset(): void;
  get ranking(): Standing[];
}
export function soloMatch(name?: string, totalFrames?: number): MatchMachine;
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/rules/MatchMachine.test.ts`:

```typescript
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
    const m = new MatchMachine(makePlayers('가', '나'), 1);
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
npm test -- src/rules/MatchMachine.test.ts
```

Expected: FAIL — `Cannot find module './MatchMachine'`

- [ ] **Step 3: `MatchMachine`을 만든다**

`src/rules/MatchMachine.ts`:

```typescript
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
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
npm test && npm run typecheck
```

Expected: PASS 전부.

- [ ] **Step 5: 커밋**

```bash
git add src/rules/MatchMachine.ts src/rules/MatchMachine.test.ts
git commit -m "MatchMachine 추가 — 여러 명이 번갈아 던지는 매치 상태머신"
```

---

## Task 4: `PlayerStore` — 플레이어 저장소와 구버전 이관

**Files:**
- Create: `src/players/types.ts`, `src/players/PlayerStore.ts`
- Test: `src/players/PlayerStore.test.ts`

**Interfaces:**
- Consumes: `ProgressState`, `emptyProgress`(`../tutorial/TutorialFlow`), `Handedness`
- Produces:

```typescript
export type Player = {
  id: string;
  name: string;
  handedness: Handedness;
  progress: ProgressState;
  createdAt: number;
};
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
export type NameCheck = { ok: true; name: string } | { ok: false; reason: string };
export function checkName(raw: string, existing: readonly Player[]): NameCheck;
export const MAX_NAME_LENGTH = 12;

export class PlayerStore {
  constructor(storage?: StorageLike);
  get players(): readonly Player[];
  get current(): Player | null;
  get pendingMigration(): boolean;
  select(id: string): void;
  create(rawName: string, handedness: Handedness): Player;
  remove(id: string): void;
  saveProgress(id: string, progress: ProgressState): void;
  findByName(name: string): Player | null;
  subscribe(fn: (store: PlayerStore) => void): () => void;
}
export function memoryStorage(seed?: Record<string, string>): StorageLike;
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/players/PlayerStore.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PlayerStore, checkName, memoryStorage } from './PlayerStore';
import { emptyProgress } from '../tutorial/TutorialFlow';

describe('checkName', () => {
  it('앞뒤 공백을 지운다', () => {
    const r = checkName('  민준  ', []);
    expect(r).toEqual({ ok: true, name: '민준' });
  });

  it('빈 이름을 거부한다', () => {
    expect(checkName('   ', []).ok).toBe(false);
  });

  it('12자를 넘으면 거부한다', () => {
    expect(checkName('가'.repeat(13), []).ok).toBe(false);
    expect(checkName('가'.repeat(12), []).ok).toBe(true);
  });

  it('중복 이름을 거부한다', () => {
    const store = new PlayerStore(memoryStorage());
    store.create('민준', 'right');
    const r = checkName('민준', store.players);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('이미');
  });

  it('공백만 다른 이름도 중복으로 본다', () => {
    const store = new PlayerStore(memoryStorage());
    store.create('민준', 'right');
    expect(checkName(' 민준 ', store.players).ok).toBe(false);
  });
});

describe('PlayerStore — 생성과 선택', () => {
  it('처음에는 아무도 없다', () => {
    const store = new PlayerStore(memoryStorage());
    expect(store.players).toHaveLength(0);
    expect(store.current).toBeNull();
  });

  it('만들면 현재 플레이어가 된다', () => {
    const store = new PlayerStore(memoryStorage());
    const p = store.create('민준', 'left');
    expect(p.name).toBe('민준');
    expect(p.handedness).toBe('left');
    expect(store.current?.id).toBe(p.id);
  });

  it('잘못된 이름은 거부한다', () => {
    const store = new PlayerStore(memoryStorage());
    expect(() => store.create('  ', 'right')).toThrow();
  });

  it('저장소에 남아 다시 읽힌다', () => {
    const storage = memoryStorage();
    const first = new PlayerStore(storage);
    const p = first.create('민준', 'right');

    const second = new PlayerStore(storage);
    expect(second.players).toHaveLength(1);
    expect(second.current?.id).toBe(p.id);
  });

  it('없는 id를 고르면 거부한다', () => {
    const store = new PlayerStore(memoryStorage());
    expect(() => store.select('없음')).toThrow();
  });
});

describe('PlayerStore — 삭제', () => {
  it('지우면 목록에서 사라진다', () => {
    const store = new PlayerStore(memoryStorage());
    const a = store.create('가', 'right');
    store.create('나', 'right');
    store.remove(a.id);
    expect(store.players.map((p) => p.name)).toEqual(['나']);
  });

  it('현재 플레이어를 지우면 다른 사람이 현재가 된다', () => {
    const store = new PlayerStore(memoryStorage());
    store.create('가', 'right');
    const b = store.create('나', 'right');
    store.remove(b.id);
    expect(store.current?.name).toBe('가');
  });

  it('마지막 한 명을 지우면 현재가 없어진다', () => {
    const store = new PlayerStore(memoryStorage());
    const a = store.create('가', 'right');
    store.remove(a.id);
    expect(store.players).toHaveLength(0);
    expect(store.current).toBeNull();
  });
});

describe('PlayerStore — 진행률', () => {
  it('사람마다 진행률이 따로 간다', () => {
    const store = new PlayerStore(memoryStorage());
    const a = store.create('가', 'right');
    const b = store.create('나', 'right');

    store.saveProgress(a.id, { ...emptyProgress(), completedLessons: ['A1', 'A2'] });

    expect(store.players.find((p) => p.id === a.id)!.progress.completedLessons).toEqual(['A1', 'A2']);
    expect(store.players.find((p) => p.id === b.id)!.progress.completedLessons).toEqual([]);
  });

  it('진행률도 저장소에 남는다', () => {
    const storage = memoryStorage();
    const first = new PlayerStore(storage);
    const a = first.create('가', 'right');
    first.saveProgress(a.id, { ...emptyProgress(), completedLessons: ['B1'] });

    const second = new PlayerStore(storage);
    expect(second.current!.progress.completedLessons).toEqual(['B1']);
  });
});

describe('PlayerStore — 구버전 이관', () => {
  const legacy = {
    'bowling3d.progress.v1': JSON.stringify({
      completedLessons: ['A1', 'A2', 'A3'],
      quizScores: { A2: { correct: 2, total: 3 } },
      currentLessonId: 'B1',
    }),
    'bowling3d.settings.v1': JSON.stringify({ handedness: 'left', difficulty: 'easy' }),
  };

  it('옛 진행률이 있으면 이관 대기 상태가 된다', () => {
    const store = new PlayerStore(memoryStorage(legacy));
    expect(store.pendingMigration).toBe(true);
    expect(store.players).toHaveLength(0);
  });

  it('첫 플레이어를 만들면 옛 진행률과 손을 물려받는다', () => {
    const store = new PlayerStore(memoryStorage(legacy));
    const p = store.create('민준', 'right'); // 화면에서 고른 손보다 옛 설정이 우선
    expect(p.progress.completedLessons).toEqual(['A1', 'A2', 'A3']);
    expect(p.progress.quizScores['A2']).toEqual({ correct: 2, total: 3 });
    expect(p.handedness).toBe('left');
  });

  it('이관 후에는 옛 키를 지우고 대기 상태가 풀린다', () => {
    const storage = memoryStorage(legacy);
    const store = new PlayerStore(storage);
    store.create('민준', 'right');
    expect(store.pendingMigration).toBe(false);
    expect(storage.getItem('bowling3d.progress.v1')).toBeNull();
  });

  it('두 번째 플레이어는 옛 진행률을 받지 않는다', () => {
    const store = new PlayerStore(memoryStorage(legacy));
    store.create('민준', 'right');
    const second = store.create('서연', 'right');
    expect(second.progress.completedLessons).toEqual([]);
  });

  it('옛 데이터가 없으면 이관 대기가 아니다', () => {
    expect(new PlayerStore(memoryStorage()).pendingMigration).toBe(false);
  });
});

describe('PlayerStore — 깨진 데이터', () => {
  it('JSON이 아니면 빈 목록으로 시작한다', () => {
    const store = new PlayerStore(memoryStorage({ 'bowling3d.players.v1': '{{{' }));
    expect(store.players).toHaveLength(0);
  });

  it('모양이 이상한 항목은 걸러낸다', () => {
    const storage = memoryStorage({
      'bowling3d.players.v1': JSON.stringify({
        players: [
          { id: 'a', name: '가', handedness: 'right', progress: emptyProgress(), createdAt: 1 },
          { id: 'b' },
          null,
          { id: 'c', name: '', handedness: 'right', progress: emptyProgress(), createdAt: 2 },
        ],
        lastPlayerId: 'a',
      }),
    });
    const store = new PlayerStore(storage);
    expect(store.players.map((p) => p.name)).toEqual(['가']);
  });

  it('lastPlayerId가 없는 사람을 가리키면 첫 사람을 고른다', () => {
    const storage = memoryStorage({
      'bowling3d.players.v1': JSON.stringify({
        players: [
          { id: 'a', name: '가', handedness: 'right', progress: emptyProgress(), createdAt: 1 },
        ],
        lastPlayerId: '없음',
      }),
    });
    expect(new PlayerStore(storage).current?.name).toBe('가');
  });
});

describe('PlayerStore — 구독', () => {
  it('바뀔 때마다 알린다', () => {
    const store = new PlayerStore(memoryStorage());
    let calls = 0;
    const off = store.subscribe(() => { calls++; });
    store.create('가', 'right');
    expect(calls).toBe(1);
    off();
    store.create('나', 'right');
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
npm test -- src/players/PlayerStore.test.ts
```

Expected: FAIL — `Cannot find module './PlayerStore'`

- [ ] **Step 3: 타입 파일을 만든다**

`src/players/types.ts`:

```typescript
/**
 * 플레이어 저장에 쓰는 타입.
 *
 * 계정이 아니다. 공용 PC 한 대에서 여러 학생이 이름만 구분해 쓰는 것이
 * 목적이라 비밀번호도 서버도 없다.
 */

import type { Handedness } from '../rules/pinLayout';
import type { ProgressState } from '../tutorial/TutorialFlow';

export type Player = {
  id: string;
  name: string;
  /** 만들 때 고른 손. 포켓·화살표·드릴 목표가 전부 이 값에 맞춰진다 */
  handedness: Handedness;
  progress: ProgressState;
  createdAt: number;
};

/**
 * localStorage와 같은 모양의 최소 인터페이스.
 *
 * 테스트가 environment: 'node'에서 돌기 때문에 localStorage가 없다.
 * 주입할 수 있게 열어 두면 저장 로직을 그대로 테스트할 수 있다.
 */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
```

- [ ] **Step 4: `PlayerStore`를 만든다**

`src/players/PlayerStore.ts`:

```typescript
/**
 * 플레이어 목록 저장소.
 *
 * 진행률을 사람별로 나눈다. 공용 PC에서 왼손잡이와 오른손잡이가 번갈아
 * 쓰는데 손 설정과 진도가 전역이면 서로 계속 덮어쓴다.
 *
 * 옛 버전은 진행률을 기기당 하나(bowling3d.progress.v1)로 저장했다.
 * 그 데이터가 남아 있으면 첫 플레이어를 만들 때 그대로 물려주고 옛 키를
 * 지운다. 쓰던 학생이 진도를 잃지 않아야 한다.
 */

import type { Handedness } from '../rules/pinLayout';
import { emptyProgress, type ProgressState } from '../tutorial/TutorialFlow';
import type { Player, StorageLike } from './types';

export type { Player, StorageLike } from './types';

const STORAGE_KEY = 'bowling3d.players.v1';
const LEGACY_PROGRESS_KEY = 'bowling3d.progress.v1';
const LEGACY_SETTINGS_KEY = 'bowling3d.settings.v1';

export const MAX_NAME_LENGTH = 12;

export type NameCheck = { ok: true; name: string } | { ok: false; reason: string };

/** 이름이 쓸 수 있는지 본다. 통과하면 공백을 지운 이름을 돌려준다 */
export function checkName(raw: string, existing: readonly Player[]): NameCheck {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, reason: '이름을 적어 주세요.' };
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, reason: `이름은 ${MAX_NAME_LENGTH}자까지 쓸 수 있어요.` };
  }
  if (existing.some((p) => p.name === name)) {
    return { ok: false, reason: '이미 있는 이름이에요. 다른 이름을 지어 주세요.' };
  }
  return { ok: true, name };
}

/** 테스트와 사생활 보호 모드에서 쓰는 메모리 저장소 */
export function memoryStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function browserStorage(): StorageLike {
  try {
    // 사생활 보호 모드에서는 접근만으로도 던질 수 있다
    const probe = '__bowling3d_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return memoryStorage();
  }
}

function isProgressState(v: unknown): v is ProgressState {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o['completedLessons']) && typeof o['quizScores'] === 'object';
}

function sanitizePlayer(v: unknown): Player | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const id = o['id'];
  const name = o['name'];
  const hand = o['handedness'];
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof name !== 'string' || name.trim().length === 0) return null;
  if (hand !== 'left' && hand !== 'right') return null;
  return {
    id,
    name: name.trim(),
    handedness: hand,
    progress: isProgressState(o['progress']) ? (o['progress'] as ProgressState) : emptyProgress(),
    createdAt: typeof o['createdAt'] === 'number' ? o['createdAt'] : 0,
  };
}

function newId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

type Listener = (store: PlayerStore) => void;

export class PlayerStore {
  private list: Player[] = [];
  private currentId: string | null = null;
  private legacy: { progress: ProgressState; handedness: Handedness | null } | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly storage: StorageLike = browserStorage()) {
    this.load();
    if (this.list.length === 0) this.legacy = this.readLegacy();
  }

  get players(): readonly Player[] {
    return this.list;
  }

  get current(): Player | null {
    return this.list.find((p) => p.id === this.currentId) ?? null;
  }

  /** 옛 진행률이 남아 있어 첫 플레이어가 물려받을 수 있는가 */
  get pendingMigration(): boolean {
    return this.legacy !== null;
  }

  select(id: string): void {
    if (!this.list.some((p) => p.id === id)) {
      throw new Error(`없는 플레이어입니다: ${id}`);
    }
    this.currentId = id;
    this.persist();
  }

  create(rawName: string, handedness: Handedness): Player {
    const check = checkName(rawName, this.list);
    if (!check.ok) throw new Error(check.reason);

    // 옛 데이터를 물려받는다. 손도 옛 설정이 있으면 그쪽을 믿는다 —
    // 지금까지 그 설정으로 배워 왔기 때문이다.
    const inherited = this.legacy;
    const player: Player = {
      id: newId(),
      name: check.name,
      handedness: inherited?.handedness ?? handedness,
      progress: inherited?.progress ?? emptyProgress(),
      createdAt: Date.now(),
    };

    if (inherited !== null) {
      this.legacy = null;
      this.storage.removeItem(LEGACY_PROGRESS_KEY);
    }

    this.list.push(player);
    this.currentId = player.id;
    this.persist();
    return player;
  }

  remove(id: string): void {
    this.list = this.list.filter((p) => p.id !== id);
    if (this.currentId === id) {
      this.currentId = this.list[0]?.id ?? null;
    }
    this.persist();
  }

  saveProgress(id: string, progress: ProgressState): void {
    const player = this.list.find((p) => p.id === id);
    if (player === undefined) throw new Error(`없는 플레이어입니다: ${id}`);
    player.progress = progress;
    this.persist();
  }

  findByName(name: string): Player | null {
    const trimmed = name.trim();
    return this.list.find((p) => p.name === trimmed) ?? null;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  // ---------------------------------------------------------------------------

  private load(): void {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw === null) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // 깨진 데이터 — 빈 목록으로 시작한다
    }
    if (typeof parsed !== 'object' || parsed === null) return;

    const o = parsed as Record<string, unknown>;
    const players = Array.isArray(o['players']) ? o['players'] : [];
    this.list = players
      .map(sanitizePlayer)
      .filter((p): p is Player => p !== null);

    const last = o['lastPlayerId'];
    this.currentId =
      typeof last === 'string' && this.list.some((p) => p.id === last)
        ? last
        : (this.list[0]?.id ?? null);
  }

  private readLegacy(): { progress: ProgressState; handedness: Handedness | null } | null {
    const raw = this.storage.getItem(LEGACY_PROGRESS_KEY);
    if (raw === null) return null;

    let progress: unknown;
    try {
      progress = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!isProgressState(progress)) return null;

    let handedness: Handedness | null = null;
    const settingsRaw = this.storage.getItem(LEGACY_SETTINGS_KEY);
    if (settingsRaw !== null) {
      try {
        const s = JSON.parse(settingsRaw) as Record<string, unknown>;
        const h = s['handedness'];
        if (h === 'left' || h === 'right') handedness = h;
      } catch {
        /* 설정이 깨졌으면 손은 화면에서 고른 값을 쓴다 */
      }
    }

    return { progress: progress as ProgressState, handedness };
  }

  private persist(): void {
    try {
      this.storage.setItem(
        STORAGE_KEY,
        JSON.stringify({ players: this.list, lastPlayerId: this.currentId }),
      );
    } catch {
      /* 저장 실패해도 수업은 계속되어야 한다 */
    }
    for (const fn of this.listeners) fn(this);
  }
}

/** 앱 전역에서 쓰는 인스턴스 */
export const players = new PlayerStore();
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

```bash
npm test && npm run typecheck
```

Expected: PASS 전부.

- [ ] **Step 6: 커밋**

```bash
git add src/players/
git commit -m "PlayerStore 추가 — 플레이어별 이름·손·진행률 저장과 구버전 이관"
```

---

## Task 5: `unlock` — 해금 판정

**Files:**
- Create: `src/players/unlock.ts`
- Test: `src/players/unlock.test.ts`

**Interfaces:**
- Consumes: `Player`(Task 4), `TutorialFlow`, `allLessons`
- Produces:

```typescript
export type LessonCount = { done: number; total: number };
export function lessonCount(player: Player): LessonCount;
export function isGraduated(player: Player): boolean;
export function practiceLockReason(player: Player): string | null;
export function matchLockReason(players: readonly Player[]): string | null;
```

`null`이면 열려 있다는 뜻이다. 문구를 그대로 화면에 띄운다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/players/unlock.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { allLessons } from '../tutorial/curriculum';
import { emptyProgress } from '../tutorial/TutorialFlow';
import type { Player } from './types';
import { isGraduated, lessonCount, matchLockReason, practiceLockReason } from './unlock';

function player(name: string, completed: string[]): Player {
  return {
    id: name,
    name,
    handedness: 'right',
    progress: { ...emptyProgress(), completedLessons: completed },
    createdAt: 0,
  };
}

const ALL = allLessons().map((l) => l.lessonId);

describe('lessonCount', () => {
  it('전체 레슨 수를 센다', () => {
    expect(lessonCount(player('가', [])).total).toBe(ALL.length);
    expect(lessonCount(player('가', [])).done).toBe(0);
  });

  it('완료한 수를 센다', () => {
    expect(lessonCount(player('가', ALL.slice(0, 3))).done).toBe(3);
  });

  it('커리큘럼에 없는 레슨은 세지 않는다', () => {
    expect(lessonCount(player('가', ['없는레슨'])).done).toBe(0);
  });
});

describe('practiceLockReason', () => {
  it('다 못 배웠으면 남은 개수를 알려 준다', () => {
    const reason = practiceLockReason(player('가', ALL.slice(0, 7)));
    expect(reason).not.toBeNull();
    expect(reason).toContain(String(ALL.length));
    expect(reason).toContain('7');
  });

  it('하나만 남아도 잠겨 있다', () => {
    expect(practiceLockReason(player('가', ALL.slice(0, ALL.length - 1)))).not.toBeNull();
  });

  it('전부 배우면 열린다', () => {
    expect(practiceLockReason(player('가', ALL))).toBeNull();
    expect(isGraduated(player('가', ALL))).toBe(true);
  });
});

describe('matchLockReason', () => {
  it('2명 미만이면 잠긴다', () => {
    expect(matchLockReason([player('가', ALL)])).not.toBeNull();
  });

  it('5명 이상이면 잠긴다', () => {
    const five = ['가', '나', '다', '라', '마'].map((n) => player(n, ALL));
    expect(matchLockReason(five)).not.toBeNull();
  });

  it('전원 수료한 2~4명이면 열린다', () => {
    expect(matchLockReason([player('가', ALL), player('나', ALL)])).toBeNull();
    const four = ['가', '나', '다', '라'].map((n) => player(n, ALL));
    expect(matchLockReason(four)).toBeNull();
  });

  it('한 명이라도 못 배웠으면 그 사람 이름을 알려 준다', () => {
    const reason = matchLockReason([player('가', ALL), player('나', [])]);
    expect(reason).not.toBeNull();
    expect(reason).toContain('나');
  });

  it('여러 명이 못 배웠으면 이름을 모두 알려 준다', () => {
    const reason = matchLockReason([player('가', []), player('나', []), player('다', ALL)]);
    expect(reason).toContain('가');
    expect(reason).toContain('나');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
npm test -- src/players/unlock.test.ts
```

Expected: FAIL — `Cannot find module './unlock'`

- [ ] **Step 3: `unlock.ts`를 만든다**

`src/players/unlock.ts`:

```typescript
/**
 * 자유 연습·대전이 열렸는지 판정한다.
 *
 * 순수 함수만 둔다. 화면은 "왜 잠겼는지"를 그대로 보여 주기만 하면 된다.
 * 잠긴 버튼을 감추지 않고 이유와 함께 보여 주는 것이 이 앱의 방침이다 —
 * 목표가 보여야 배울 마음이 생기고, 감추면 있는 줄도 모른다.
 */

import { allLessons } from '../tutorial/curriculum';
import { TutorialFlow } from '../tutorial/TutorialFlow';
import { MAX_PLAYERS } from '../rules/MatchMachine';
import type { Player } from './types';

/** 한 레인에 설 수 있는 최소 인원 */
export const MIN_MATCH_PLAYERS = 2;

export type LessonCount = { done: number; total: number };

export function lessonCount(player: Player): LessonCount {
  // TutorialFlow가 커리큘럼에 없는 레슨 ID를 걸러 준다
  const flow = new TutorialFlow(player.progress);
  const total = allLessons().length;
  const done = allLessons().filter((l) => flow.isCompleted(l.lessonId)).length;
  return { done, total };
}

export function isGraduated(player: Player): boolean {
  const { done, total } = lessonCount(player);
  return done >= total;
}

/** 자유 연습이 잠긴 이유. 열려 있으면 null */
export function practiceLockReason(player: Player): string | null {
  if (isGraduated(player)) return null;
  const { done, total } = lessonCount(player);
  return `${total}개 중 ${done}개를 배웠어요. 다 배우면 열려요.`;
}

/** 대전이 잠긴 이유. 열려 있으면 null */
export function matchLockReason(participants: readonly Player[]): string | null {
  if (participants.length < MIN_MATCH_PLAYERS) {
    return `대전은 ${MIN_MATCH_PLAYERS}명부터 할 수 있어요.`;
  }
  if (participants.length > MAX_PLAYERS) {
    return `대전은 ${MAX_PLAYERS}명까지 할 수 있어요.`;
  }
  const notYet = participants.filter((p) => !isGraduated(p));
  if (notYet.length > 0) {
    const names = notYet.map((p) => p.name).join(', ');
    return `${names}는 아직 다 배우지 않았어요.`;
  }
  return null;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
npm test && npm run typecheck
```

Expected: PASS 전부.

- [ ] **Step 5: 커밋**

```bash
git add src/players/unlock.ts src/players/unlock.test.ts
git commit -m "해금 판정 추가 — 자유 연습은 전체 수료, 대전은 참가자 전원 수료"
```

---

## Task 6: `PracticeSession` — 연습 투구 상태

프레임도 점수도 없이 계속 던지는 모드. 매 투구 후 고른 핀 배치로 되돌린다. 기존 드릴과 같은 방식(`Game.setupDrill`)을 쓰므로 물리 쪽 변경이 없다.

**Files:**
- Create: `src/practice/PracticeSession.ts`
- Test: `src/practice/PracticeSession.test.ts`

**Interfaces:**
- Consumes: `PinNumber`, `ALL_PINS`(`../rules/pinLayout`)
- Produces:

```typescript
export class PracticeSession {
  constructor(rack?: readonly PinNumber[]);
  get rack(): readonly PinNumber[];
  setRack(rack: readonly PinNumber[]): void;
  record(knockedCount: number): void;
  get throws(): number;
  get knockedTotal(): number;
  get lastKnocked(): number | null;
  get lastMessage(): string | null;
  reset(): void;
}
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/practice/PracticeSession.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PracticeSession } from './PracticeSession';

describe('PracticeSession', () => {
  it('기본 랙은 핀 10개다', () => {
    expect(new PracticeSession().rack).toHaveLength(10);
  });

  it('빈 랙은 거부한다', () => {
    expect(() => new PracticeSession([])).toThrow();
  });

  it('랙을 정렬해 보관한다', () => {
    const s = new PracticeSession([7, 1, 3]);
    expect(s.rack).toEqual([1, 3, 7]);
  });

  it('같은 핀이 두 번 오면 한 번만 센다', () => {
    expect(new PracticeSession([1, 1, 3]).rack).toEqual([1, 3]);
  });

  it('투구 횟수와 누적 핀을 센다', () => {
    const s = new PracticeSession();
    s.record(7);
    s.record(10);
    expect(s.throws).toBe(2);
    expect(s.knockedTotal).toBe(17);
    expect(s.lastKnocked).toBe(10);
  });

  it('랙보다 많이 쓰러뜨렸다고 하면 거부한다', () => {
    const s = new PracticeSession([1, 3]);
    expect(() => s.record(3)).toThrow();
  });

  it('전부 쓰러뜨리면 다르게 알려 준다', () => {
    const s = new PracticeSession([1, 3]);
    s.record(2);
    expect(s.lastMessage).toContain('전부');
  });

  it('일부만 쓰러뜨리면 개수를 알려 준다', () => {
    const s = new PracticeSession();
    s.record(7);
    expect(s.lastMessage).toBe('10개 중 7개');
  });

  it('하나도 못 맞히면 다시 해 보자고 한다', () => {
    const s = new PracticeSession();
    s.record(0);
    expect(s.lastMessage).toContain('다시');
  });

  it('랙을 바꾸면 기록이 초기화된다', () => {
    const s = new PracticeSession();
    s.record(5);
    s.setRack([1, 2, 3]);
    expect(s.throws).toBe(0);
    expect(s.lastKnocked).toBeNull();
  });

  it('reset은 기록만 지우고 랙은 남긴다', () => {
    const s = new PracticeSession([1, 3]);
    s.record(1);
    s.reset();
    expect(s.throws).toBe(0);
    expect(s.rack).toEqual([1, 3]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
npm test -- src/practice/PracticeSession.test.ts
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: `PracticeSession`을 만든다**

`src/practice/PracticeSession.ts`:

```typescript
/**
 * 연습 투구 — 프레임도 점수도 없이 계속 던지는 모드.
 *
 * 매 투구 후 고른 핀 배치로 되돌린다. 핀 일부만 세운 상태에서는
 * FrameMachine이 계산한 "스트라이크!"가 틀리므로(핀 3개를 다 쓰러뜨린
 * 것을 스트라이크라고 부를 수 없다) 기본 배너를 끄고 여기서 문구를 만든다.
 * 튜토리얼 드릴이 쓰는 방식과 같다.
 */

import { ALL_PINS, type PinNumber } from '../rules/pinLayout';

export class PracticeSession {
  private pins: PinNumber[] = [...ALL_PINS];
  private count = 0;
  private knocked = 0;
  private last: number | null = null;

  constructor(rack: readonly PinNumber[] = ALL_PINS) {
    this.setRack(rack);
  }

  get rack(): readonly PinNumber[] {
    return this.pins;
  }

  setRack(rack: readonly PinNumber[]): void {
    const unique = [...new Set(rack)].sort((a, b) => a - b);
    if (unique.length === 0) {
      throw new Error('핀을 최소 하나는 세워야 합니다.');
    }
    this.pins = unique;
    this.reset();
  }

  record(knockedCount: number): void {
    if (knockedCount < 0 || knockedCount > this.pins.length) {
      throw new Error(
        `쓰러뜨릴 수 없는 개수입니다: ${knockedCount} (세운 핀 ${this.pins.length}개)`,
      );
    }
    this.count += 1;
    this.knocked += knockedCount;
    this.last = knockedCount;
  }

  get throws(): number {
    return this.count;
  }

  get knockedTotal(): number {
    return this.knocked;
  }

  get lastKnocked(): number | null {
    return this.last;
  }

  /** 방금 투구를 설명하는 짧은 문구. 아직 안 던졌으면 null */
  get lastMessage(): string | null {
    if (this.last === null) return null;
    if (this.last === 0) return '아쉬워요. 다시 해 볼까요?';
    if (this.last === this.pins.length) return '전부 쓰러뜨렸어요!';
    return `${this.pins.length}개 중 ${this.last}개`;
  }

  reset(): void {
    this.count = 0;
    this.knocked = 0;
    this.last = null;
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
npm test && npm run typecheck
```

Expected: PASS 전부.

- [ ] **Step 5: 커밋**

```bash
git add src/practice/
git commit -m "PracticeSession 추가 — 프레임 없는 연습 투구 상태"
```

---

## Task 7: `Game`이 `MatchMachine`을 쓰게 하고 손 설정을 분리

여기서부터 기존 코드를 재배선한다. **`machine` getter를 남겨 두어** `main.ts`·`TutorialUI`·`DebugPanel`이 그대로 동작하게 한다.

**Files:**
- Modify: `src/core/Game.ts`, `src/settings.ts`
- Test: 없음 (Game은 Three.js·Rapier에 묶여 있어 node 환경에서 인스턴스를 만들 수 없다. 타입 검사와 이후 브라우저 실기로 검증한다.)

**Interfaces:**
- Consumes: `MatchMachine`, `soloMatch`(Task 3)
- Produces:
  - `game.match: MatchMachine` (getter)
  - `game.machine: FrameMachine` (getter — `match.activeMachine`. 기존 호출부 호환용)
  - `game.setMatch(match: MatchMachine): void`
  - `game.setHandedness(hand: Handedness): void`
  - `settings.value`에서 `handedness` 제거, `settings.hand`·`settings.needsHandChoice` 제거

- [ ] **Step 1: `settings.ts`에서 손을 뺀다**

`src/settings.ts`에서 아래를 바꾼다:

```typescript
/**
 * 전역 표시 설정 (난이도, 관찰 옵션).
 *
 * 투구 손은 여기 없다. 공용 PC에서 왼손잡이와 오른손잡이가 번갈아 쓰면
 * 전역 설정이 서로 덮어써 버린다. 손은 플레이어마다 저장한다
 * (players/PlayerStore.ts).
 *
 * 스키마 버전을 키에 넣어 두면 나중에 설정 항목이 바뀌어도 옛 저장
 * 데이터가 앱을 깨뜨리지 않는다. 모르는 값은 조용히 기본값으로 되돌린다.
 */

import { DIFFICULTY, type DifficultyName } from './config';

const STORAGE_KEY = 'bowling3d.settings.v2';

export type Settings = {
  difficulty: DifficultyName;
  /** 관찰 모드: 핀 번호 표시 */
  showPinNumbers: boolean;
  /** 관찰 모드: 오일 구간 표시 */
  showOilZone: boolean;
  /** 관찰 모드: 공 궤적 표시 */
  showTrajectory: boolean;
};

const DEFAULTS: Settings = {
  difficulty: 'easy',
  showPinNumbers: false,
  showOilZone: false,
  showTrajectory: false,
};
```

- `isHandedness` 함수와 `import type { Handedness }`를 지운다.
- `sanitize()`에서 `handedness` 줄을 지운다.
- `needsHandChoice` getter와 `hand` getter를 지운다.
- `STORAGE_KEY`를 `v2`로 올린다. **v1은 지우지 않는다** — `PlayerStore`가 이관할 때 옛 손 설정을 읽어야 한다.
- `clear()`는 그대로 둔다.

- [ ] **Step 2: `Game`을 고친다**

`src/core/Game.ts`:

import에 추가:

```typescript
import { MatchMachine, soloMatch } from '../rules/MatchMachine';
```

필드 교체 — `readonly machine = new FrameMachine();`를 지우고:

```typescript
export class Game {
  readonly scene: SceneSetup;
  readonly input: DragInput;

  /** 지금 진행 중인 매치. 자유 연습은 1명짜리 매치다 */
  private _match: MatchMachine = soloMatch();
```

getter를 추가한다(`on()` 메서드 근처, 클래스 앞부분):

```typescript
  get match(): MatchMachine {
    return this._match;
  }

  /**
   * 지금 차례인 사람의 프레임 상태.
   *
   * HUD·점수판·튜토리얼이 1인 시절부터 쓰던 이름이라 그대로 남긴다.
   * 매치가 1명이면 예전과 완전히 같게 동작한다.
   */
  get machine(): FrameMachine {
    return this._match.activeMachine;
  }

  /** 매치를 갈아 끼운다 (자유 연습 시작, 대전 시작) */
  setMatch(match: MatchMachine): void {
    this._match = match;
    this.setHandedness(match.active.handedness);
    this.trajectory.clearAll();
    this.bodies.setPins([...ALL_PINS]);
    this.beginAiming();
  }

  /** 투구 손을 바꾼다 — 대전에서 차례가 넘어갈 때마다 부른다 */
  setHandedness(hand: Handedness): void {
    if (hand === this.hand) return;
    this.hand = hand;
    this.lane.setHandedness(hand);
    this.syncMeshes();
  }
```

`ALL_PINS`를 `../rules/pinLayout`에서 import한다.

생성자에서 손 관련 구독을 걷어낸다. 아래 두 줄:

```typescript
    settings.subscribe((s) => this.applySettings(s.handedness ?? 'right'));
    this.applySettings(this.hand);
```

을 이렇게 바꾼다:

```typescript
    settings.subscribe(() => this.applyDisplaySettings());
    this.applyDisplaySettings();
```

`applySettings(hand)`를 `applyDisplaySettings()`로 바꾼다 — 손 처리는 `setHandedness`가 맡는다:

```typescript
  private applyDisplaySettings(): void {
    const s = settings.value;
    this.input.difficulty = s.difficulty;
    this.pins.setNumbersVisible(s.showPinNumbers);
    this.lane.setOilZoneVisible(s.showOilZone);
    this.trajectory.setVisible(s.showTrajectory);
  }
```

`restart()`에서 `this.machine.reset()`을 매치 리셋으로 바꾼다:

```typescript
  restart(): void {
    this._match.reset();
    this.setHandedness(this._match.active.handedness);
    this.trajectory.clearAll();
    this.beginAiming();
  }
```

- [ ] **Step 3: 투구 결과 처리를 매치 경유로 바꾼다**

`Game.ts`에서 `this.machine.throwBall()` / `beginSettling()` / `settle(...)`를 호출하는 곳을 찾는다:

```bash
grep -n "this\.machine\." src/core/Game.ts
```

각각 `this._match.throwBall()` / `this._match.beginSettling()` / `this._match.settle(...)`로 바꾼다. `settle`의 반환값은 `MatchThrowResult`이고 `ThrowResult`를 포함하므로 `onThrowResolved` 콜백 타입은 `MatchThrowResult`로 넓힌다:

```typescript
import type { MatchThrowResult } from '../rules/MatchMachine';

export type GameEvents = {
  /** 한 번의 투구 결과가 확정되었을 때 */
  onThrowResolved: (result: MatchThrowResult) => void;
  /** 조준 가능 상태가 되었을 때 */
  onReady: () => void;
  /** 상태 표시가 바뀔 때마다 (프레임/파워/위치) */
  onStateChanged: () => void;
};
```

**차례가 넘어가면 그 사람의 손으로 바꾼다.** `settle` 결과를 이벤트로 넘기기 직전에:

```typescript
    if (result.turnChanged && !result.matchOver) {
      this.setHandedness(this._match.active.handedness);
    }
```

`debugKnock(count)`도 `this._match.settleWithCount(count)`를 쓰도록 바꾼다.

- [ ] **Step 4: 타입 검사로 남은 호출부를 찾는다**

```bash
npm run typecheck
```

Expected: `settings.hand` / `settings.needsHandChoice` / `s.handedness`를 쓰는 곳에서 에러가 난다 — `src/main.ts`, `src/ui/TutorialUI.ts`가 나올 것이다. **이 태스크에서는 고치지 않는다.** Task 8·9에서 각각 고친다. 지금은 에러 목록을 기록만 한다.

임시로 통과시키려 하지 말고, 다음 스텝에서 이어서 고친다.

- [ ] **Step 5: 커밋 (타입 에러가 남아 있는 상태)**

중간 상태를 커밋하지 않는다. **Task 8까지 마친 뒤 한 번에 커밋한다.** 이 스텝은 건너뛰고 Task 8로 넘어간다.

---

## Task 8: `TutorialUI`·`Progress`를 플레이어 경유로 바꾸고 타입을 통과시킨다

Task 7이 남긴 타입 에러를 여기서 전부 없앤다. 이 태스크가 끝나면 `npm run typecheck`와 `npm test`가 통과해야 한다.

**Files:**
- Modify: `src/tutorial/Progress.ts`, `src/ui/TutorialUI.ts`, `src/main.ts`
- Delete: `src/ui/HandPicker.ts`

**Interfaces:**
- Consumes: `players`(Task 4), `game.setHandedness`(Task 7)
- Produces:
  - `Progress.load(): ProgressState` — 현재 플레이어의 진행률
  - `Progress.save(state): void` — 현재 플레이어에 저장
  - `Progress.clear(): void` — 현재 플레이어의 진행률만 비운다

- [ ] **Step 1: `Progress`를 `PlayerStore` 경유로 바꾼다**

`src/tutorial/Progress.ts` 전체를 교체한다:

```typescript
/**
 * 진행률 저장/복원 — 현재 플레이어의 것.
 *
 * 실제 저장은 PlayerStore가 한다. 이 모듈은 "지금 누구인지"를 아는
 * 얇은 창구다. 튜토리얼 코드가 플레이어 개념을 몰라도 되게 하려고 남긴다.
 *
 * 현재 플레이어가 없으면(플레이어 선택 화면 이전) 빈 진행률을 돌려주고
 * 저장은 조용히 버린다. 튜토리얼이 그 상태로 열릴 일은 없지만,
 * 열려도 앱이 깨지지는 않아야 한다.
 */

import { players } from '../players/PlayerStore';
import { emptyProgress, type ProgressState } from './TutorialFlow';

export const Progress = {
  load(): ProgressState {
    return players.current?.progress ?? emptyProgress();
  },

  save(state: ProgressState): void {
    const current = players.current;
    if (current === null) return;
    players.saveProgress(current.id, state);
  },

  /** 이 플레이어의 진도만 비운다. 다른 플레이어는 그대로다 */
  clear(): void {
    const current = players.current;
    if (current === null) return;
    players.saveProgress(current.id, emptyProgress());
  },
};
```

- [ ] **Step 2: `TutorialUI`에서 `settings.hand`를 걷어낸다**

`src/ui/TutorialUI.ts`에서 `settings.hand`를 쓰는 곳(6군데)을 현재 플레이어의 손으로 바꾼다.

import 추가:

```typescript
import { players } from '../players/PlayerStore';
```

클래스에 private getter를 하나 둔다:

```typescript
  /** 지금 배우는 사람의 손. 포켓·화살표·드릴 목표가 전부 여기에 맞춰진다 */
  private get hand(): Handedness {
    return players.current?.handedness ?? 'right';
  }
```

`Handedness`를 `../rules/pinLayout`에서 import한다. 그리고 치환한다:

| 위치 | 변경 전 | 변경 후 |
|---|---|---|
| `new TutorialPanel(...)` | `settings.hand` | `this.hand` |
| `demo-hook` 액션 | `settings.hand === 'right' ? 12 : -12` | `this.hand === 'right' ? 12 : -12` |
| `openLesson` | `this.panel.setHand(settings.hand)` | `this.panel.setHand(this.hand)` |
| `startDrill` | `new DrillRunner(drill, settings.hand)` | `new DrillRunner(drill, this.hand)` |
| `demoThrow` | `settings.hand === 'right' ? 0.15 : -0.15` | `this.hand === 'right' ? 0.15 : -0.15` |

손 구독을 플레이어 구독으로 바꾼다:

```typescript
    // 변경 전: settings.subscribe((s) => this.panel.setHand(s.handedness ?? 'right'));
    players.subscribe(() => this.panel.setHand(this.hand));
```

초기화 리셋 핸들러에서 `settings.clear()`를 지운다 — 이제 전역 설정에 손이 없으므로 지우면 관찰 옵션만 날아간다:

```typescript
        Progress.clear();
        // settings.clear(); ← 지운다. 손은 플레이어에 있고, 관찰 옵션은 남겨 둔다.
```

- [ ] **Step 3: `main.ts`의 손 선택 부분을 임시로 걷어낸다**

`src/main.ts`에서 `HandPicker` 관련 블록(40~56줄 부근)을 통째로 지운다. `?hand=` 딥링크 처리도 함께 지운다 — Task 11에서 플레이어 선택 화면과 함께 되살린다.

지울 부분:

```typescript
  // ?hand=left/right 로 선택 화면을 건너뛸 수 있다
  const handParam = params.get('hand');
  if (handParam === 'left' || handParam === 'right') {
    settings.update({ handedness: handParam });
  }

  if (settings.needsHandChoice) {
    await new Promise<void>((resolve) => {
      const picker = new HandPicker((hand) => {
        settings.update({ handedness: hand });
        picker.hide();
        resolve();
      });
      ui.appendChild(picker.element);
      loading.classList.add('is-hidden');
    });
  }
```

`import { HandPicker } from './ui/HandPicker';`와 쓰이지 않게 된 `import { settings }`도 정리한다(`settings.subscribe`는 남아 있으므로 확인 후 판단한다).

`onThrowResolved` 콜백의 타입을 바꾼다:

```typescript
import type { MatchThrowResult } from './rules/MatchMachine';
// ...
    onThrowResolved: (result: MatchThrowResult) => {
```

- [ ] **Step 4: `HandPicker`를 지운다**

```bash
git rm src/ui/HandPicker.ts
```

- [ ] **Step 5: 타입 검사와 테스트를 통과시킨다**

```bash
npm run typecheck && npm test && npm run build
```

Expected: 전부 PASS. 에러가 남으면 그 파일의 `settings.hand`·`handedness` 참조를 위 방식대로 마저 고친다.

- [ ] **Step 6: 커밋**

```bash
git add -A src/core/Game.ts src/settings.ts src/tutorial/Progress.ts src/ui/TutorialUI.ts src/main.ts src/ui/HandPicker.ts
git commit -m "손 설정을 플레이어별로 옮기고 Game이 MatchMachine에 위임하게 함"
```

---

## Task 9: `Scoreboard` 다인 표시와 마지막 프레임 일반화

`Scoreboard`에 `frame.index === 10`이 두 군데 박혀 있다. 3프레임 경기에서 3프레임이 3칸으로 그려지지 않고 스페어 표기가 틀린다.

**Files:**
- Modify: `src/ui/Scoreboard.ts`, `src/styles.css`

**Interfaces:**
- Consumes: `MatchMachine`, `Standing`(Task 3)
- Produces:
  - `scoreboard.render(card: Scorecard, options?)` — 기존 그대로 (퀴즈가 쓴다)
  - `scoreboard.renderMatch(match: MatchMachine): void` — 신규

- [ ] **Step 1: 마지막 프레임 판정을 고친다**

`rollSymbol`이 프레임 수를 알아야 한다. 시그니처를 바꾼다:

```typescript
/** 굴림 하나를 볼링 표기법으로 (X, /, -) */
function rollSymbol(frame: FrameView, index: number, totalFrames: number): string {
  const value = frame.rolls[index];
  if (value === undefined) return '';
  if (value === 10) return 'X';
  if (index > 0) {
    const prev = frame.rolls[index - 1]!;
    // 마지막 프레임에서 스트라이크 뒤의 굴림은 새 랙이므로 스페어 표기를 하지 않는다
    const isFreshRack = frame.index === totalFrames && prev === 10;
    if (!isFreshRack && prev + value === 10) return '/';
  }
  if (value === 0) return '-';
  return String(value);
}
```

`render`에서:

```typescript
  render(card: Scorecard, options: ScoreboardOptions = {}): void {
    const frames = card.frames;
    const totalFrames = card.totalFrames;
    const rows: string[] = [];

    for (const frame of frames) {
      const isLast = frame.index === totalFrames;
      const slots = isLast ? 3 : 2;
      const cells: string[] = [];
      for (let i = 0; i < slots; i++) {
        cells.push(`<span class="roll">${rollSymbol(frame, i, totalFrames)}</span>`);
      }
      // ...
      const classes = ['frame'];
      if (isLast) classes.push('frame--tenth');
```

`frame--tenth` 클래스 이름은 CSS가 쓰고 있으므로 그대로 둔다 (이름만 낡았지 뜻은 "마지막 프레임"이다). 주석을 한 줄 단다:

```typescript
      // frame--tenth: 마지막 프레임(3칸)을 뜻한다. 3프레임 경기면 3프레임이 여기 해당한다.
```

- [ ] **Step 2: 다인 렌더링을 추가한다**

`Scoreboard` 클래스에 메서드를 더한다:

```typescript
  /**
   * 매치 전체를 그린다. 사람마다 한 줄씩, 지금 차례인 사람을 강조한다.
   *
   * 1명짜리 매치(자유 연습)에서는 이름 줄을 접어 1인 화면과 같게 보인다.
   */
  renderMatch(match: MatchMachine): void {
    if (!match.isMultiplayer) {
      this.element.classList.remove('scoreboard--match');
      this.render(match.activeMachine.scorecard, {
        activeFrame: match.activeMachine.currentFrame,
      });
      return;
    }

    this.element.classList.add('scoreboard--match');
    const totals = new Map(match.ranking.map((s) => [s.player.id, s.rank]));

    const rows = match.players.map((player) => {
      const card = match.machineOf(player.id).scorecard;
      const isActive = player.id === match.active.id;
      const inner = this.rowHtml(card, isActive ? card.currentFrame : undefined);
      const rank = match.isMatchOver ? `<span class="rank">${totals.get(player.id)}위</span>` : '';
      return `
        <div class="match-row${isActive ? ' match-row--active' : ''}">
          <div class="match-name">${escapeHtml(player.name)}${rank}</div>
          ${inner}
        </div>
      `;
    });

    this.element.innerHTML = rows.join('');
  }
```

`render`의 본문에서 프레임 그리기 부분을 `rowHtml(card, activeFrame?)` private 메서드로 빼내 두 곳이 공유하게 한다. `render`는 `this.element.innerHTML = this.rowHtml(card, options.activeFrame)` 형태가 된다(퀴즈용 옵션은 `rowHtml`의 인자로 함께 넘긴다).

`escapeHtml`을 파일 하단에 둔다 — 이름은 사용자가 입력하는 값이라 그대로 `innerHTML`에 넣으면 안 된다:

```typescript
/** 이름은 사용자가 입력한 값이라 그대로 innerHTML에 넣으면 안 된다 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}
```

- [ ] **Step 3: 스타일을 더한다**

`src/styles.css` 끝에:

```css
/* 대전 점수판 — 사람마다 한 줄 */
.scoreboard--match .match-row {
  display: grid;
  grid-template-columns: 4.5rem 1fr;
  align-items: center;
  gap: 0.4rem;
  padding: 0.15rem 0;
  opacity: 0.55;
  transition: opacity 0.2s;
}
.scoreboard--match .match-row--active {
  opacity: 1;
}
.scoreboard--match .match-name {
  font-weight: 700;
  font-size: 0.85rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.scoreboard--match .rank {
  margin-inline-start: 0.3rem;
  font-size: 0.75rem;
  opacity: 0.8;
}
```

- [ ] **Step 4: 검증**

```bash
npm run typecheck && npm test && npm run build
```

Expected: PASS 전부. 기존 `Scoreboard` 호출부(`main.ts`, 튜토리얼 퀴즈)가 깨지지 않아야 한다.

- [ ] **Step 5: 커밋**

```bash
git add src/ui/Scoreboard.ts src/styles.css
git commit -m "점수판을 다인·가변 프레임 수에 맞게 고침"
```

---

## Task 10: `PlayerPicker` — 플레이어 선택·생성·삭제 화면

**Files:**
- Create: `src/ui/PlayerPicker.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `players`, `checkName`, `MAX_NAME_LENGTH`(Task 4), `lessonCount`(Task 5)
- Produces:

```typescript
export class PlayerPicker {
  readonly element: HTMLElement;
  constructor(onDone: (player: Player) => void);
  show(): void;
  hide(): void;
}
```

- [ ] **Step 1: `PlayerPicker`를 만든다**

`src/ui/PlayerPicker.ts`:

```typescript
/**
 * 시작 화면 — 누가 플레이하는지 고른다.
 *
 * 계정이 아니다. 공용 PC 한 대를 여러 학생이 쓸 때 진도와 손 설정이
 * 섞이지 않게 하는 것이 전부다.
 *
 * 삭제는 진행률까지 함께 지우므로 두 단계로 확인한다. 영역 메뉴의
 * 초기화가 같은 방식이라 패턴을 맞췄다.
 */

import { checkName, MAX_NAME_LENGTH, players } from '../players/PlayerStore';
import type { Player } from '../players/types';
import { lessonCount } from '../players/unlock';
import type { Handedness } from '../rules/pinLayout';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

export class PlayerPicker {
  readonly element: HTMLElement;
  private mode: 'list' | 'create' = 'list';
  private pendingDelete: string | null = null;
  private hand: Handedness = 'right';

  constructor(private readonly onDone: (player: Player) => void) {
    this.element = document.createElement('div');
    this.element.className = 'overlay player-picker';
    this.element.addEventListener('click', (e) => this.handleClick(e));
    this.element.addEventListener('submit', (e) => this.handleSubmit(e));
    // 목록이 비어 있으면 곧장 만들기 화면으로 — 빈 목록을 보여 줄 이유가 없다
    this.mode = players.players.length === 0 ? 'create' : 'list';
    this.render();
  }

  show(): void {
    this.element.hidden = false;
    this.mode = players.players.length === 0 ? 'create' : 'list';
    this.pendingDelete = null;
    this.render();
  }

  hide(): void {
    this.element.hidden = true;
  }

  // ---------------------------------------------------------------------------

  private render(): void {
    this.element.innerHTML = this.mode === 'create' ? this.createHtml() : this.listHtml();
    if (this.mode === 'create') {
      this.element.querySelector<HTMLInputElement>('#player-name')?.focus();
    }
  }

  private listHtml(): string {
    const rows = players.players
      .map((p) => {
        const { done, total } = lessonCount(p);
        const handLabel = p.handedness === 'left' ? '왼손' : '오른손';
        const confirming = this.pendingDelete === p.id;
        return `
          <li class="player-row${confirming ? ' player-row--confirming' : ''}">
            <button type="button" class="player-pick" data-pick="${p.id}">
              <span class="player-name">${escapeHtml(p.name)}</span>
              <span class="player-meta">${handLabel} · ${done}/${total} 배움</span>
            </button>
            ${
              confirming
                ? `<span class="delete-confirm">
                     <span class="delete-warn">배운 것도 같이 지워져요</span>
                     <button type="button" class="danger-btn" data-delete-yes="${p.id}">지울래요</button>
                     <button type="button" class="text-btn" data-delete-no="1">그만둘래요</button>
                   </span>`
                : `<button type="button" class="icon-btn" data-delete="${p.id}" aria-label="${escapeHtml(p.name)} 지우기">🗑</button>`
            }
          </li>
        `;
      })
      .join('');

    return `
      <div class="panel">
        <h1>누가 볼링을 칠까요?</h1>
        <ul class="player-list">${rows}</ul>
        <button type="button" class="primary-btn" data-new="1">+ 새로 만들기</button>
      </div>
    `;
  }

  private createHtml(): string {
    const first = players.players.length === 0;
    const inherit = players.pendingMigration
      ? '<p class="note">지금까지 배운 내용을 이어서 쓸게요.</p>'
      : '';
    return `
      <form class="panel" novalidate>
        <h1>${first ? '볼링을 시작해요' : '새 플레이어'}</h1>
        <label class="field">
          <span>이름</span>
          <input id="player-name" name="name" type="text" maxlength="${MAX_NAME_LENGTH}"
                 autocomplete="off" placeholder="이름을 적어 주세요">
        </label>
        <p class="lead">공을 어느 손으로 던지나요?</p>
        <div class="hand-choices">
          <button type="button" class="hand-choice${this.hand === 'left' ? ' is-on' : ''}" data-hand="left">
            <span class="hand-icon" aria-hidden="true">🤚</span>
            <span class="hand-name">왼손</span>
          </button>
          <button type="button" class="hand-choice${this.hand === 'right' ? ' is-on' : ''}" data-hand="right">
            <span class="hand-icon hand-icon--flip" aria-hidden="true">🤚</span>
            <span class="hand-name">오른손</span>
          </button>
        </div>
        ${inherit}
        <p class="form-error" role="alert"></p>
        <div class="row-buttons">
          <button type="submit" class="primary-btn">시작하기</button>
          ${first ? '' : '<button type="button" class="text-btn" data-cancel="1">뒤로</button>'}
        </div>
      </form>
    `;
  }

  private handleClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-pick],[data-new],[data-delete],[data-delete-yes],[data-delete-no],[data-cancel],[data-hand]');
    if (el === null) return;
    const d = el.dataset;

    if (d['pick'] !== undefined) {
      players.select(d['pick']);
      const picked = players.current;
      if (picked !== null) this.onDone(picked);
      return;
    }
    if (d['new'] !== undefined) {
      this.mode = 'create';
      this.render();
      return;
    }
    if (d['delete'] !== undefined) {
      this.pendingDelete = d['delete'];
      this.render();
      return;
    }
    if (d['deleteYes'] !== undefined) {
      players.remove(d['deleteYes']);
      this.pendingDelete = null;
      this.mode = players.players.length === 0 ? 'create' : 'list';
      this.render();
      return;
    }
    if (d['deleteNo'] !== undefined) {
      this.pendingDelete = null;
      this.render();
      return;
    }
    if (d['cancel'] !== undefined) {
      this.mode = 'list';
      this.render();
      return;
    }
    if (d['hand'] === 'left' || d['hand'] === 'right') {
      this.hand = d['hand'];
      this.render();
    }
  }

  private handleSubmit(e: Event): void {
    e.preventDefault();
    const input = this.element.querySelector<HTMLInputElement>('#player-name');
    const error = this.element.querySelector<HTMLElement>('.form-error');
    if (input === null || error === null) return;

    const check = checkName(input.value, players.players);
    if (!check.ok) {
      error.textContent = check.reason;
      input.focus();
      return;
    }
    this.onDone(players.create(check.name, this.hand));
  }
}
```

- [ ] **Step 2: 스타일을 더한다**

`src/styles.css` 끝에:

```css
/* 플레이어 선택 */
.player-list { list-style: none; margin: 0.8rem 0; padding: 0; display: grid; gap: 0.5rem; }
.player-row { display: flex; align-items: center; gap: 0.5rem; }
.player-pick {
  flex: 1; display: grid; gap: 0.15rem; text-align: start;
  padding: 0.7rem 0.9rem; border-radius: 0.7rem; cursor: pointer;
  background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: inherit;
}
.player-pick:hover { background: rgba(255, 255, 255, 0.16); }
.player-name { font-weight: 700; font-size: 1.05rem; }
.player-meta { font-size: 0.8rem; opacity: 0.75; }
.delete-confirm { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
.delete-warn { font-size: 0.8rem; opacity: 0.85; }
.field { display: grid; gap: 0.3rem; margin-block: 0.8rem; }
.field input {
  padding: 0.6rem 0.8rem; border-radius: 0.6rem; font-size: 1.05rem;
  border: 1px solid rgba(255, 255, 255, 0.25); background: rgba(0, 0, 0, 0.25); color: inherit;
}
.form-error { min-height: 1.2em; color: #ffb4a8; font-size: 0.85rem; margin: 0.3rem 0; }
.row-buttons { display: flex; gap: 0.6rem; align-items: center; }
.hand-choice.is-on { outline: 2px solid currentColor; }
```

기존 `.panel`, `.primary-btn`, `.text-btn`, `.icon-btn`, `.danger-btn`, `.hand-choices`, `.hand-choice`, `.note`, `.lead` 클래스가 이미 있는지 확인하고, 없는 것만 추가한다:

```bash
grep -n "primary-btn\|danger-btn\|icon-btn\|\.note\|\.lead\|hand-choices" src/styles.css
```

- [ ] **Step 3: 검증**

```bash
npm run typecheck && npm run build
```

Expected: PASS. (DOM 테스트는 없다 — 브라우저 실기는 Task 13에서 한다.)

- [ ] **Step 4: 커밋**

```bash
git add src/ui/PlayerPicker.ts src/styles.css
git commit -m "PlayerPicker 추가 — 플레이어 고르기·만들기(이름+손)·지우기"
```

---

## Task 11: `AreaMenu`를 홈으로 — 자유 연습·대전 버튼과 잠금

**Files:**
- Modify: `src/ui/AreaMenu.ts`, `src/styles.css`

**Interfaces:**
- Consumes: `practiceLockReason`, `matchLockReason`(Task 5), `players`(Task 4)
- Produces: `AreaMenuCallbacks`에 추가
  - `onFreePractice: () => void`
  - `onMatch: () => void`
  - `onSwitchPlayer: () => void`

- [ ] **Step 1: 콜백 타입을 넓힌다**

`src/ui/AreaMenu.ts`의 `AreaMenuCallbacks`에 세 개를 더한다:

```typescript
export type AreaMenuCallbacks = {
  // ... 기존 항목 그대로 ...
  /** 자유 연습으로 (해금된 경우에만 불린다) */
  onFreePractice: () => void;
  /** 대전 참가자 고르기로 (해금 여부는 다음 화면에서 판정한다) */
  onMatch: () => void;
  /** 플레이어 바꾸기 */
  onSwitchPlayer: () => void;
};
```

- [ ] **Step 2: 홈 영역을 그린다**

`render()`가 만드는 HTML에서 영역 카드 목록 **앞에** 플레이어 줄을, **뒤에** 놀기 버튼 두 개를 붙인다.

`render()` 안, `areaCards`를 만든 뒤:

```typescript
    const player = players.current;
    const practiceLock = player === null ? '먼저 플레이어를 골라 주세요.' : practiceLockReason(player);
    const playerBar =
      player === null
        ? ''
        : `
      <div class="player-bar">
        <span class="player-current">${escapeHtml(player.name)}</span>
        <button type="button" class="text-btn" data-action="switch-player">바꾸기</button>
      </div>
    `;

    const playButtons = `
      <div class="play-buttons">
        <button type="button" class="play-btn${practiceLock === null ? '' : ' is-locked'}"
                data-action="free-practice"
                ${practiceLock === null ? '' : `data-lock="${escapeHtml(practiceLock)}"`}>
          <span class="play-icon" aria-hidden="true">${practiceLock === null ? '🎳' : '🔒'}</span>
          <span class="play-name">자유 연습</span>
          <span class="play-desc">${practiceLock ?? '배운 걸로 마음껏 던져 봐요'}</span>
        </button>
        <button type="button" class="play-btn${practiceLock === null ? '' : ' is-locked'}"
                data-action="match"
                ${practiceLock === null ? '' : `data-lock="${escapeHtml(practiceLock)}"`}>
          <span class="play-icon" aria-hidden="true">${practiceLock === null ? '🏆' : '🔒'}</span>
          <span class="play-name">대전</span>
          <span class="play-desc">${practiceLock === null ? '친구와 번갈아 쳐요' : '다 배우면 친구와 겨룰 수 있어요'}</span>
        </button>
      </div>
    `;
```

두 버튼 모두 **현재 플레이어의 수료 여부**로 1차 판정한다. 대전은 참가자 전원이 조건이지만, 방을 여는 사람이 아직 못 배웠으면 참가자 화면까지 갈 필요가 없다. 나머지 참가자 판정은 Task 12의 `MatchSetup`이 한다.

`playerBar`를 패널 맨 위에, `playButtons`를 영역 카드 아래에 넣는다.

- [ ] **Step 3: 클릭 처리를 더한다**

기존 클릭 핸들러의 `data-action` 분기에 세 갈래를 더한다:

```typescript
      if (action === 'switch-player') {
        this.callbacks.onSwitchPlayer();
        return;
      }
      if (action === 'free-practice' || action === 'match') {
        const lock = button.dataset['lock'];
        if (lock !== undefined) {
          // 잠긴 이유를 그 자리에서 보여 준다. 감추면 있는 줄도 모른다.
          this.showLockNote(button, lock);
          return;
        }
        if (action === 'free-practice') this.callbacks.onFreePractice();
        else this.callbacks.onMatch();
        return;
      }
```

`showLockNote`를 클래스에 더한다:

```typescript
  /** 잠긴 버튼을 누르면 이유를 잠깐 띄운다 */
  private showLockNote(button: HTMLElement, text: string): void {
    const desc = button.querySelector<HTMLElement>('.play-desc');
    if (desc === null) return;
    const original = desc.textContent ?? '';
    desc.textContent = text;
    button.classList.add('is-shaking');
    window.setTimeout(() => {
      desc.textContent = original;
      button.classList.remove('is-shaking');
    }, 2400);
  }
```

`players`와 `practiceLockReason`을 import하고, `escapeHtml`을 파일 하단에 둔다(Task 10과 같은 구현).

- [ ] **Step 4: 스타일을 더한다**

`src/styles.css` 끝에:

```css
/* 홈 — 플레이어 줄과 놀기 버튼 */
.player-bar { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.6rem; }
.player-current { font-weight: 700; }
.play-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; margin-top: 1rem; }
.play-btn {
  display: grid; gap: 0.2rem; justify-items: center; text-align: center;
  padding: 0.9rem 0.7rem; border-radius: 0.8rem; cursor: pointer; color: inherit;
  background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.18);
}
.play-btn:hover { background: rgba(255, 255, 255, 0.18); }
.play-btn.is-locked { opacity: 0.6; }
.play-icon { font-size: 1.6rem; }
.play-name { font-weight: 700; }
.play-desc { font-size: 0.78rem; opacity: 0.8; line-height: 1.3; }
.play-btn.is-shaking { animation: lock-shake 0.35s; }
@keyframes lock-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}
@media (max-width: 480px) {
  .play-buttons { grid-template-columns: 1fr; }
}
```

- [ ] **Step 5: 검증**

```bash
npm run typecheck && npm run build
```

Expected: `main.ts`에서 `AreaMenu`/`TutorialUI`를 만들 때 새 콜백 3개가 없다는 타입 에러가 난다. **Task 13에서 고친다.** 여기서는 에러 내용만 확인한다.

- [ ] **Step 6: 커밋 없이 Task 12로**

Task 13에서 배선을 끝낸 뒤 함께 커밋한다.

---

## Task 12: `PracticeSetup`·`MatchSetup` — 시작 화면 두 개

**Files:**
- Create: `src/ui/PracticeSetup.ts`, `src/ui/MatchSetup.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `players`, `matchLockReason`, `isGraduated`, `lessonCount`, `MIN_MATCH_PLAYERS`(Task 5), `MAX_PLAYERS`, `MatchPlayer`(Task 3), `ALL_PINS`·`PinNumber`(`../rules/pinLayout`)
- Produces:

```typescript
export type PracticeChoice =
  | { kind: 'game' }
  | { kind: 'throws'; rack: PinNumber[] };
export class PracticeSetup {
  readonly element: HTMLElement;
  constructor(onStart: (choice: PracticeChoice) => void, onCancel: () => void);
  show(): void;
  hide(): void;
}

export type MatchChoice = { participants: MatchPlayer[]; totalFrames: number };
export class MatchSetup {
  readonly element: HTMLElement;
  constructor(onStart: (choice: MatchChoice) => void, onCancel: () => void);
  show(): void;
  hide(): void;
}
```

- [ ] **Step 1: `PracticeSetup`을 만든다**

`src/ui/PracticeSetup.ts`:

```typescript
/**
 * 자유 연습 시작 화면.
 *
 * 두 갈래다. 10프레임 정식 경기는 배운 규칙을 전부 써 보는 자리이고,
 * 연습 투구는 점수 없이 감을 익히는 자리다. 연습 투구에서는 세울 핀을
 * 직접 골라 스페어 상황을 반복할 수 있다.
 *
 * 핀 고르기 화면에 "왼쪽/오른쪽"을 쓰지 않는다. 왼손 학생은 핀 배치가
 * 미러링되지만 글은 미러링되지 않기 때문이다. 번호로만 부른다.
 */

import { ALL_PINS, type PinNumber } from '../rules/pinLayout';

export type PracticeChoice =
  | { kind: 'game' }
  | { kind: 'throws'; rack: PinNumber[] };

export class PracticeSetup {
  readonly element: HTMLElement;
  private rack = new Set<PinNumber>(ALL_PINS);
  private step: 'kind' | 'rack' = 'kind';

  constructor(
    private readonly onStart: (choice: PracticeChoice) => void,
    private readonly onCancel: () => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'overlay practice-setup';
    this.element.hidden = true;
    this.element.addEventListener('click', (e) => this.handleClick(e));
    this.render();
  }

  show(): void {
    this.step = 'kind';
    this.rack = new Set<PinNumber>(ALL_PINS);
    this.element.hidden = false;
    this.render();
  }

  hide(): void {
    this.element.hidden = true;
  }

  private render(): void {
    this.element.innerHTML = this.step === 'kind' ? this.kindHtml() : this.rackHtml();
  }

  private kindHtml(): string {
    return `
      <div class="panel">
        <h1>자유 연습</h1>
        <div class="play-buttons">
          <button type="button" class="play-btn" data-kind="game">
            <span class="play-icon" aria-hidden="true">🎳</span>
            <span class="play-name">10프레임 경기</span>
            <span class="play-desc">점수를 매기며 한 게임을 끝까지 쳐요</span>
          </button>
          <button type="button" class="play-btn" data-kind="throws">
            <span class="play-icon" aria-hidden="true">🔁</span>
            <span class="play-name">연습 투구</span>
            <span class="play-desc">점수 없이 계속 던져요. 세울 핀도 고를 수 있어요</span>
          </button>
        </div>
        <button type="button" class="text-btn" data-cancel="1">뒤로</button>
      </div>
    `;
  }

  private rackHtml(): string {
    const pins = ALL_PINS.map((n) => {
      const on = this.rack.has(n);
      return `<button type="button" class="pin-toggle${on ? ' is-on' : ''}"
                data-pin="${n}" aria-pressed="${on}">${n}</button>`;
    }).join('');

    const empty = this.rack.size === 0;
    return `
      <div class="panel">
        <h1>어떤 핀을 세울까요?</h1>
        <p class="lead">번호를 눌러 켜고 끌 수 있어요. 던질 때마다 이 모양으로 다시 세워져요.</p>
        <div class="pin-grid">${pins}</div>
        <div class="row-buttons">
          <button type="button" class="text-btn" data-preset="all">전부 세우기</button>
          <button type="button" class="text-btn" data-preset="none">전부 치우기</button>
        </div>
        <p class="form-error" role="alert">${empty ? '핀을 최소 하나는 세워 주세요.' : ''}</p>
        <div class="row-buttons">
          <button type="button" class="primary-btn" data-go="1"${empty ? ' disabled' : ''}>시작하기</button>
          <button type="button" class="text-btn" data-back="1">뒤로</button>
        </div>
      </div>
    `;
  }

  private handleClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-kind],[data-cancel],[data-pin],[data-preset],[data-go],[data-back]',
    );
    if (el === null) return;
    const d = el.dataset;

    if (d['kind'] === 'game') {
      this.onStart({ kind: 'game' });
      return;
    }
    if (d['kind'] === 'throws') {
      this.step = 'rack';
      this.render();
      return;
    }
    if (d['cancel'] !== undefined) {
      this.onCancel();
      return;
    }
    if (d['back'] !== undefined) {
      this.step = 'kind';
      this.render();
      return;
    }
    if (d['pin'] !== undefined) {
      const n = Number(d['pin']) as PinNumber;
      if (this.rack.has(n)) this.rack.delete(n);
      else this.rack.add(n);
      this.render();
      return;
    }
    if (d['preset'] === 'all') {
      this.rack = new Set<PinNumber>(ALL_PINS);
      this.render();
      return;
    }
    if (d['preset'] === 'none') {
      this.rack.clear();
      this.render();
      return;
    }
    if (d['go'] !== undefined && this.rack.size > 0) {
      this.onStart({ kind: 'throws', rack: [...this.rack].sort((a, b) => a - b) });
    }
  }
}
```

- [ ] **Step 2: `MatchSetup`을 만든다**

`src/ui/MatchSetup.ts`:

```typescript
/**
 * 대전 시작 화면 — 참가자와 프레임 수를 고른다.
 *
 * 아직 다 배우지 않은 사람은 고를 수 없다. 고르는 순간 이유가 보이게
 * 한다 — 다 골라 놓고 시작 버튼에서 막히면 왜인지 알 수 없다.
 *
 * 프레임 수를 고르게 하는 이유: 4명이 10프레임을 치면 투구가 40~84회다.
 * 한 투구가 정지까지 3~6초 걸리므로 수업 한 차시로는 길다.
 */

import { players } from '../players/PlayerStore';
import type { Player } from '../players/types';
import { isGraduated, lessonCount, matchLockReason, MIN_MATCH_PLAYERS } from '../players/unlock';
import { MAX_PLAYERS, type MatchPlayer } from '../rules/MatchMachine';

export type MatchChoice = { participants: MatchPlayer[]; totalFrames: number };

const FRAME_CHOICES = [3, 5, 10] as const;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

export class MatchSetup {
  readonly element: HTMLElement;
  private picked: string[] = [];
  private frames: number = 3;
  private note: string | null = null;

  constructor(
    private readonly onStart: (choice: MatchChoice) => void,
    private readonly onCancel: () => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'overlay match-setup';
    this.element.hidden = true;
    this.element.addEventListener('click', (e) => this.handleClick(e));
    this.render();
  }

  show(): void {
    // 방을 연 사람을 기본 참가자로 넣어 둔다
    const me = players.current;
    this.picked = me !== null && isGraduated(me) ? [me.id] : [];
    this.frames = 3;
    this.note = null;
    this.element.hidden = false;
    this.render();
  }

  hide(): void {
    this.element.hidden = true;
  }

  private get participants(): Player[] {
    return this.picked
      .map((id) => players.players.find((p) => p.id === id))
      .filter((p): p is Player => p !== undefined);
  }

  private render(): void {
    const rows = players.players
      .map((p) => {
        const ok = isGraduated(p);
        const on = this.picked.includes(p.id);
        const { done, total } = lessonCount(p);
        return `
          <li>
            <button type="button" class="pick-row${on ? ' is-on' : ''}${ok ? '' : ' is-locked'}"
                    data-toggle="${p.id}" aria-pressed="${on}">
              <span class="pick-mark" aria-hidden="true">${ok ? (on ? '✅' : '⬜') : '🔒'}</span>
              <span class="player-name">${escapeHtml(p.name)}</span>
              <span class="player-meta">${ok ? '다 배웠어요' : `${done}/${total} 배움`}</span>
            </button>
          </li>
        `;
      })
      .join('');

    const frameButtons = FRAME_CHOICES.map(
      (n) => `<button type="button" class="frame-choice${this.frames === n ? ' is-on' : ''}"
                data-frames="${n}">${n}프레임</button>`,
    ).join('');

    const lock = matchLockReason(this.participants);

    this.element.innerHTML = `
      <div class="panel">
        <h1>누구와 겨룰까요?</h1>
        <p class="lead">${MIN_MATCH_PLAYERS}명부터 ${MAX_PLAYERS}명까지 고를 수 있어요.</p>
        <ul class="player-list">${rows}</ul>
        <p class="lead">몇 프레임씩 칠까요?</p>
        <div class="frame-choices">${frameButtons}</div>
        <p class="form-error" role="alert">${escapeHtml(this.note ?? lock ?? '')}</p>
        <div class="row-buttons">
          <button type="button" class="primary-btn" data-go="1"${lock === null ? '' : ' disabled'}>시작하기</button>
          <button type="button" class="text-btn" data-cancel="1">뒤로</button>
        </div>
      </div>
    `;
  }

  private handleClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-toggle],[data-frames],[data-go],[data-cancel]',
    );
    if (el === null) return;
    const d = el.dataset;

    if (d['toggle'] !== undefined) {
      const player = players.players.find((p) => p.id === d['toggle']);
      if (player === undefined) return;
      if (!isGraduated(player)) {
        this.note = `${player.name}는 아직 다 배우지 않았어요.`;
        this.render();
        return;
      }
      this.note = null;
      if (this.picked.includes(player.id)) {
        this.picked = this.picked.filter((id) => id !== player.id);
      } else if (this.picked.length >= MAX_PLAYERS) {
        this.note = `${MAX_PLAYERS}명까지 고를 수 있어요.`;
      } else {
        this.picked = [...this.picked, player.id];
      }
      this.render();
      return;
    }
    if (d['frames'] !== undefined) {
      this.frames = Number(d['frames']);
      this.render();
      return;
    }
    if (d['cancel'] !== undefined) {
      this.onCancel();
      return;
    }
    if (d['go'] !== undefined) {
      const list = this.participants;
      if (matchLockReason(list) !== null) return;
      this.onStart({
        participants: list.map<MatchPlayer>((p) => ({
          id: p.id,
          name: p.name,
          handedness: p.handedness,
        })),
        totalFrames: this.frames,
      });
    }
  }
}
```

- [ ] **Step 3: 스타일을 더한다**

`src/styles.css` 끝에:

```css
/* 핀 고르기 — 실제 배치와 같은 삼각형 */
.pin-grid {
  display: grid; grid-template-columns: repeat(4, 2.4rem); gap: 0.35rem;
  justify-content: center; margin: 0.8rem 0;
}
.pin-toggle {
  width: 2.4rem; height: 2.4rem; border-radius: 50%; cursor: pointer;
  font-weight: 700; color: inherit;
  background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2);
}
.pin-toggle.is-on { background: #f2f2f2; color: #1a1a1a; }

/* 참가자 고르기 */
.pick-row {
  width: 100%; display: grid; grid-template-columns: 1.6rem 1fr auto;
  align-items: center; gap: 0.5rem; text-align: start;
  padding: 0.6rem 0.8rem; border-radius: 0.7rem; cursor: pointer; color: inherit;
  background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15);
}
.pick-row.is-on { background: rgba(255, 255, 255, 0.2); }
.pick-row.is-locked { opacity: 0.5; }
.frame-choices { display: flex; gap: 0.5rem; margin: 0.5rem 0 0.8rem; }
.frame-choice {
  flex: 1; padding: 0.55rem 0.4rem; border-radius: 0.6rem; cursor: pointer;
  font-weight: 600; color: inherit;
  background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2);
}
.frame-choice.is-on { background: #f2f2f2; color: #1a1a1a; }
```

핀 그리드는 4열이지만 실제 배치는 1-2-3-4 삼각형이다. 정확한 배치가 필요하면 `pinLayout`의 좌표로 절대 배치할 수 있으나, 번호만으로 충분하므로 **단순 격자로 둔다.** 헤더에 "번호를 눌러 켜고 끌 수 있어요"라고 적혀 있어 오해 소지가 없다.

- [ ] **Step 4: 검증**

```bash
npm run typecheck
```

Expected: 이 두 파일 자체에는 에러가 없어야 한다. `main.ts`의 배선 에러는 남아 있다 (Task 13).

- [ ] **Step 5: 커밋 없이 Task 13으로**

---

## Task 13: `main.ts` 배선 — 부트스트랩·모드 전환·딥링크

앱의 흐름을 바꾸는 마지막 조각이다. Task 11~13의 변경을 여기서 함께 커밋한다.

**Files:**
- Modify: `src/main.ts`, `src/ui/TutorialUI.ts`

**Interfaces:**
- Consumes: `PlayerPicker`(10), `AreaMenu` 새 콜백(11), `PracticeSetup`·`MatchSetup`(12), `MatchMachine`·`soloMatch`(3), `PracticeSession`(6)
- Produces: 없음 (최종 배선)

- [ ] **Step 1: `TutorialUI`에 홈 열기 콜백을 연결한다**

`TutorialUI`가 `AreaMenu`를 만들고 있다. 새 콜백 3개를 `TutorialHooks`로 받아 그대로 넘긴다.

`src/ui/TutorialUI.ts`의 `TutorialHooks`에 추가:

```typescript
export type TutorialHooks = {
  // ... 기존 항목 ...
  onFreePractice: () => void;
  onMatch: () => void;
  onSwitchPlayer: () => void;
};
```

`AreaMenu`를 만드는 곳에서 그대로 전달한다:

```typescript
      onFreePractice: () => {
        this.closeAll();
        this.hooks.onFreePractice();
      },
      onMatch: () => {
        this.closeAll();
        this.hooks.onMatch();
      },
      onSwitchPlayer: () => {
        this.closeAll();
        this.hooks.onSwitchPlayer();
      },
```

- [ ] **Step 2: `main.ts`를 다시 쓴다**

`src/main.ts`의 `main()` 함수를 아래 흐름으로 바꾼다. 기존 HUD·점수판·관찰·키보드·디버그 부분은 그대로 두고, **부트스트랩과 모드 전환만** 바꾼다.

파일 상단 주석 교체:

```typescript
/**
 * 앱 시작점.
 *
 * 흐름: 플레이어 고르기 → 홈(영역 메뉴) → 배우기 / 자유 연습 / 대전
 *
 * 홈이 영역 메뉴다. 게임 화면은 거기서 들어간다. 다 배운 학생만 자유
 * 연습과 대전을 열 수 있고, 잠긴 버튼은 감추지 않고 이유와 함께 보여 준다.
 *
 * 쿼리스트링
 *   ?debug=1      숫자 키(0~9, 0=10개)로 물리를 건너뛰고 핀 수를 직접 입력.
 *   ?player=민준  플레이어 선택 화면을 건너뛴다 (수업 시연용)
 *   ?lesson=B3    해당 레슨을 바로 연다 (수업 딥링크)
 *   ?area=D       영역 메뉴를 해당 영역이 강조된 채로 연다
 */
```

import를 정리한다:

```typescript
import { Game } from './core/Game';
import { players } from './players/PlayerStore';
import { PracticeSession } from './practice/PracticeSession';
import { MatchMachine, soloMatch, type MatchThrowResult } from './rules/MatchMachine';
import { settings } from './settings';
import { DebugPanel } from './ui/DebugPanel';
import { Hud } from './ui/Hud';
import { MatchSetup } from './ui/MatchSetup';
import { ObserveControls } from './ui/ObserveControls';
import { PlayerPicker } from './ui/PlayerPicker';
import { PracticeSetup } from './ui/PracticeSetup';
import { Scoreboard } from './ui/Scoreboard';
import { TutorialUI } from './ui/TutorialUI';
import type { AreaId } from './tutorial/types';
```

`main()` 안에서 게임 생성 전에 플레이어를 고른다:

```typescript
  // ?player=이름 으로 선택 화면을 건너뛴다 (수업 시연용)
  const playerParam = params.get('player');
  if (playerParam !== null) {
    const found = players.findByName(playerParam);
    if (found !== null) players.select(found.id);
  }

  const picker = new PlayerPicker(() => {
    picker.hide();
    onPlayerReady();
  });
  ui.appendChild(picker.element);
```

게임 생성과 UI 조립은 그대로 두되, **연습 세션 상태**를 하나 둔다:

```typescript
  /** 연습 투구 중이면 그 세션. 정식 경기·대전 중에는 null */
  let practice: PracticeSession | null = null;
```

모드 시작 함수 세 개를 둔다:

```typescript
  function startFreeGame(): void {
    practice = null;
    const me = players.current;
    game.setMatch(soloMatch(me?.name ?? '나'));
    if (me !== null) game.setHandedness(me.handedness);
    scoreboard.element.classList.remove('is-hidden');
    refresh();
  }

  function startPractice(rack: PinNumber[]): void {
    practice = new PracticeSession(rack);
    const me = players.current;
    game.setMatch(soloMatch(me?.name ?? '나'));
    if (me !== null) game.setHandedness(me.handedness);
    // 점수가 의미 없으므로 점수판을 감춘다 (드릴과 같은 방침)
    scoreboard.element.classList.add('is-hidden');
    game.setupDrill(practice.rack);
    refresh();
  }

  function startMatch(participants: MatchPlayer[], totalFrames: number): void {
    practice = null;
    game.setMatch(new MatchMachine(participants, totalFrames));
    scoreboard.element.classList.remove('is-hidden');
    hud.showBanner(`${game.match.active.name} 차례`);
    refresh();
  }
```

`PinNumber`와 `MatchPlayer` 타입을 import한다.

투구 결과 처리에 연습 모드 분기와 턴 배너를 더한다. 기존 `onThrowResolved`를 이렇게 바꾼다:

```typescript
    onThrowResolved: (result: MatchThrowResult) => {
      const suppressBanner = tutorial.handleThrowResolved(result);

      if (practice !== null) {
        // 연습 투구 — 프레임도 점수도 없다. 매번 같은 배치로 다시 세운다.
        practice.record(result.knockedCount);
        hud.showBanner(practice.lastMessage ?? '');
        game.match.reset();
        game.setupDrill(practice.rack);
        refresh();
        return;
      }

      if (!suppressBanner && result.message !== null) hud.showBanner(result.message);
      refresh();

      if (!suppressBanner && result.matchOver) {
        const rank = game.match.ranking;
        const text = game.match.isMultiplayer
          ? `${rank[0]!.player.name} 승리! ${rank[0]!.total}점`
          : `끝! ${rank[0]!.total}점`;
        hud.showBanner(text, 4000);
      } else if (!suppressBanner && result.turnChanged && game.match.isMultiplayer) {
        hud.showBanner(`${game.match.active.name} 차례`);
      }
    },
```

`refresh()`에서 점수판을 매치 렌더링으로 바꾼다:

```typescript
    scoreboard.renderMatch(game.match);
```

그리고 HUD 힌트에 현재 차례를 반영한다:

```typescript
    if (practice !== null) {
      hud.setHint(`연습 중이에요. ${practice.throws}번 던졌어요`);
    } else if (game.match.isMatchOver) {
      hud.setHint(`게임이 끝났어요! 점수는 ${machine.scorecard.total}점이에요.`);
    } else if (machine.phase === 'aiming') {
      const who = game.match.isMultiplayer ? `${game.match.active.name}, ` : '';
      hud.setHint(`${who}아래로 끌어당겼다가 놓으면 공이 굴러가요`);
    } else {
      hud.setHint('공이 굴러가는 중…');
    }
```

`TutorialUI`에 훅을 연결하고, 자유 연습·대전 화면을 붙인다:

```typescript
  const practiceSetup = new PracticeSetup(
    (choice) => {
      practiceSetup.hide();
      if (choice.kind === 'game') startFreeGame();
      else startPractice(choice.rack);
    },
    () => {
      practiceSetup.hide();
      tutorial.openMenu();
    },
  );
  const matchSetup = new MatchSetup(
    (choice) => {
      matchSetup.hide();
      startMatch(choice.participants, choice.totalFrames);
    },
    () => {
      matchSetup.hide();
      tutorial.openMenu();
    },
  );
  ui.appendChild(practiceSetup.element);
  ui.appendChild(matchSetup.element);

  const tutorial = new TutorialUI(game, ui, {
    onSessionChange: ({ hideScoreboard }) => {
      scoreboard.element.classList.toggle('is-hidden', hideScoreboard);
    },
    onFreePractice: () => practiceSetup.show(),
    onMatch: () => matchSetup.show(),
    onSwitchPlayer: () => picker.show(),
  });
```

선언 순서 때문에 `tutorial`을 `practiceSetup`보다 먼저 만들 수 없다(서로 참조한다). `practiceSetup`/`matchSetup`의 취소 콜백에서만 `tutorial`을 쓰므로, **`tutorial`을 `let`으로 먼저 선언**하고 나중에 대입한다:

```typescript
  let tutorial: TutorialUI;
  // ... practiceSetup, matchSetup 생성 (콜백 안에서 tutorial 사용 — 호출 시점엔 이미 대입돼 있다) ...
  tutorial = new TutorialUI(game, ui, { /* ... */ });
```

`onPlayerReady()`는 홈을 연다:

```typescript
  function onPlayerReady(): void {
    // 플레이어가 바뀌면 그 사람의 진도로 튜토리얼을 다시 읽는다
    tutorial.reloadProgress();
    tutorial.openMenu();
  }
```

`TutorialUI`에 `reloadProgress()`를 더한다:

```typescript
  /** 플레이어가 바뀌었을 때 그 사람의 진도로 다시 읽는다 */
  reloadProgress(): void {
    this.flow = new TutorialFlow(Progress.load());
    this.panel.setHand(this.hand);
  }
```

`flow` 필드가 `readonly`면 `readonly`를 뗀다.

'배우기' 버튼은 홈이 곧 영역 메뉴이므로 **지운다.** 대신 게임 화면에서 홈으로 돌아가는 버튼을 남긴다:

```typescript
  const homeBtn = document.createElement('button');
  homeBtn.type = 'button';
  homeBtn.className = 'text-btn learn-btn';
  homeBtn.setAttribute('aria-label', '홈으로');
  homeBtn.innerHTML = '<span aria-hidden="true">🏠</span><span class="btn-label"> 홈</span>';
  homeBtn.addEventListener('click', () => tutorial.openMenu());
  ui.appendChild(homeBtn);
```

마지막으로 부트스트랩 순서:

```typescript
  game.start();
  loading.classList.add('is-hidden');

  if (players.current === null || playerParam === null) {
    picker.show();
  } else {
    onPlayerReady();
  }

  // 수업용 딥링크 — 특정 레슨/영역을 바로 연다
  const lessonParam = params.get('lesson');
  const areaParam = params.get('area');
  if (lessonParam !== null) {
    picker.hide();
    tutorial.openLesson(lessonParam.toUpperCase());
  } else if (areaParam !== null) {
    picker.hide();
    const area = areaParam.toUpperCase();
    const isAreaId = (v: string): v is AreaId => ['A', 'B', 'C', 'D', 'E'].includes(v);
    tutorial.openMenu(isAreaId(area) ? area : undefined);
  }
```

`?lesson=`·`?area=` 딥링크는 플레이어가 없어도 열려야 한다(수업 시연). 진행률 저장은 `Progress.save`가 현재 플레이어 없을 때 조용히 버리므로 안전하다.

- [ ] **Step 3: 타입 검사·테스트·빌드**

```bash
npm run typecheck && npm test && npm run build
```

Expected: 전부 PASS. 남는 에러는 대개 (a) 지워진 `settings.hand` 참조, (b) `AreaMenu` 콜백 누락, (c) `ThrowResult` → `MatchThrowResult` 타입 폭이다. 각각 위 지침대로 고친다.

- [ ] **Step 4: 커밋**

```bash
git add -A src/
git commit -m "홈을 영역 메뉴로 바꾸고 자유 연습·대전 진입을 배선"
```

---

## Task 14: 브라우저 실기 검증

DOM 코드는 유닛 테스트가 없으므로 여기서 실제로 확인한다. **`STATUS.md`를 갱신하는 것까지가 이 태스크다.**

**Files:**
- Modify: `STATUS.md`

- [ ] **Step 1: 개발 서버를 띄운다**

```bash
npm run dev
```

http://localhost:5173/ 을 연다.

- [ ] **Step 2: 시나리오를 순서대로 확인한다**

브라우저 개발자 도구 콘솔에서 저장소를 비우고 시작한다:

```javascript
localStorage.clear(); location.reload();
```

| # | 할 일 | 기대 결과 |
|---|---|---|
| 1 | 첫 실행 | 목록 없이 바로 "볼링을 시작해요" 만들기 화면 |
| 2 | 빈 이름으로 시작 | "이름을 적어 주세요." |
| 3 | 13자 이름 | 입력이 12자에서 멈춘다 |
| 4 | "민준" + 왼손으로 시작 | 홈(영역 메뉴)이 열린다 |
| 5 | 홈의 자유 연습·대전 | 자물쇠 + "18개 중 0개를 배웠어요" |
| 6 | 잠긴 버튼 클릭 | 흔들리며 이유가 뜨고 2.4초 뒤 원래 문구로 |
| 7 | A1 레슨 진입 → 완료 | 진행률이 1/18로 오른다 |
| 8 | D4 드릴 진입 | 핀이 왼손 기준(10번)으로 미러링된다 |
| 9 | 홈 → 바꾸기 → 새로 만들기 | "서연" + 오른손 생성, 진도 0/18 |
| 10 | 서연으로 D4 드릴 | 핀이 오른손 기준(7번)으로 미러링된다 |
| 11 | 민준으로 다시 전환 | 진도 1/18이 그대로 남아 있다 |
| 12 | 민준 삭제 시도 | "배운 것도 같이 지워져요" 확인 단계 |
| 13 | "그만둘래요" | 삭제되지 않는다 |

- [ ] **Step 3: 해금된 상태를 만들어 자유 연습·대전을 확인한다**

18레슨을 손으로 다 밟기엔 오래 걸린다. 콘솔에서 진행률을 직접 채운다:

```javascript
const raw = JSON.parse(localStorage.getItem('bowling3d.players.v1'));
// 커리큘럼의 모든 레슨 ID — 앱 콘솔에서 확인
const ids = ['A1','A2','A3','A4','B1','B2','B3','B4','C1','C2','C3','D1','D2','D3','D4','E1','E2','E3'];
for (const p of raw.players) p.progress.completedLessons = ids;
localStorage.setItem('bowling3d.players.v1', JSON.stringify(raw));
location.reload();
```

레슨 ID 목록이 위와 다르면 `src/tutorial/curriculum.ts`에서 실제 ID를 확인해 맞춘다.

| # | 할 일 | 기대 결과 |
|---|---|---|
| 14 | 홈 | 자유 연습·대전에 자물쇠가 없다 |
| 15 | 자유 연습 → 10프레임 경기 | 점수판이 10칸으로 나오고 공을 던질 수 있다 |
| 16 | 자유 연습 → 연습 투구 → 핀 1·3만 켜기 | 핀 2개만 서고, 던지면 "2개 중 N개"가 뜬다 |
| 17 | 연습 투구를 5번 반복 | 매번 같은 배치로 다시 서고 점수판이 안 보인다 |
| 18 | 홈 → 대전 → 민준·서연 선택, 3프레임 | 매치가 시작되고 "민준 차례" 배너 |
| 19 | 민준의 1프레임을 끝낸다 | "서연 차례" 배너, 점수판 강조가 서연 줄로 |
| 20 | 서연 차례일 때 레인 | 오른손 기준으로 화살표·시작 위치가 바뀐다 |
| 21 | 3프레임 매치를 끝까지 | 마지막 프레임에 보너스 투구가 붙고 "○○ 승리! N점" |
| 22 | 대전 화면에서 미수료자 클릭 | 선택되지 않고 "…아직 다 배우지 않았어요" |

- [ ] **Step 4: 딥링크와 구버전 이관을 확인한다**

딥링크:

```
http://localhost:5173/?lesson=B3
http://localhost:5173/?area=D
http://localhost:5173/?player=민준
http://localhost:5173/?debug=1
```

각각 플레이어 선택을 건너뛰고 바로 해당 화면이 열려야 한다.

구버전 이관 — 콘솔에서 옛 데이터만 심는다:

```javascript
localStorage.clear();
localStorage.setItem('bowling3d.progress.v1', JSON.stringify({
  completedLessons: ['A1','A2','A3'], quizScores: {}, currentLessonId: 'A4',
}));
localStorage.setItem('bowling3d.settings.v1', JSON.stringify({ handedness: 'left' }));
location.reload();
```

기대: 만들기 화면에 "지금까지 배운 내용을 이어서 쓸게요."가 뜨고, 이름을 넣으면 진도가 3/18, 손은 왼손으로 들어온다. `bowling3d.progress.v1`은 사라진다.

- [ ] **Step 5: 대전 소요 시간을 잰다**

4명 3프레임 매치를 한 번 끝까지 돌리고 시간을 잰다. **5분을 넘으면** `MatchSetup`의 기본 프레임 수가 이미 3이므로 더 줄일 수 없다 — 대신 `STATUS.md`에 실측 시간을 적어 교사가 수업 설계에 쓸 수 있게 한다.

- [ ] **Step 6: `STATUS.md`를 갱신한다**

아래 내용을 반영한다:

- 완료 표에 플레이어 저장 · 자유 연습 · 다인 매치 행을 더한다
- 검증 상태 줄의 테스트 개수를 실제 숫자로 고친다 (`npm test` 출력)
- 딥링크 줄에 `?player=` 추가
- "확인하지 못한 것"에 온라인 실시간 대전(3단계 미착수)을 적는다
- 4명 3프레임 매치 실측 시간을 적는다

- [ ] **Step 7: 최종 검증과 커밋**

```bash
npm test && npm run typecheck && npm run build
```

Expected: 전부 PASS.

```bash
git add -A
git commit -m "브라우저 실기 검증 완료 + STATUS.md 갱신"
```

---

## 완료 조건

- `npm test` · `npm run typecheck` · `npm run build` 전부 통과
- 기존 183개 테스트가 그대로 통과 (`FrameMachine`·점수 로직 무변경의 증거)
- Task 14의 시나리오 22개를 브라우저에서 확인
- `STATUS.md`가 실제 상태를 반영
