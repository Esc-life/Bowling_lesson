# 3단계 — 온라인 실시간 대전 설계

작성일 2026-08-01. `docs/superpowers/specs/2026-07-31-players-freeplay-match-design.md`가 미룬
3단계를 다룬다. 1·2단계(플레이어 저장, 자유 연습, 같은 기기 다인 매치)는 이미 `main`에 있다.

## 무엇을 만드는가

서로 다른 기기(교실 여러 대 PC, 또는 각자 집)에 있는 2~4명이 방 코드로 만나
번갈아 던지며 `MatchMachine`을 함께 갖는다. 배포 대상이 GitHub Pages(정적 호스팅,
자체 서버 없음)라 동기화는 외부 서비스가 필요하다 — **Supabase Realtime**을 쓴다
(사용자가 이미 프로젝트를 갖고 있어 확정).

## 결정한 것

| 항목 | 결정 | 왜 |
|---|---|---|
| 동기화 채널 | Supabase Realtime **Broadcast + Presence** | Postgres 테이블·RLS·마이그레이션이 전혀 필요 없다. anon key 하나로 바로 된다. 게임 이벤트처럼 짧고 빈번한 메시지에 Supabase가 직접 권장하는 방식이다(Postgres Changes는 DB에 쓰인 행 변화를 구독하는 용도라 이런 용도엔 더 무겁다). |
| 진짜 정답(state)을 어디 두는가 | **아무 데도 저장하지 않는다.** 각 기기가 "이번 굴림에 남은 핀"의 순서 있는 로그를 받아 `MatchMachine.settle()`을 그대로 재생해 스스로 계산한다 | `FrameMachine`/`MatchMachine`은 순수 함수다. 같은 입력 순서를 넣으면 어느 기기에서 돌려도 점수·차례가 똑같다. 서버가 점수를 계산할 필요가 없다 — 그냥 "남은 핀 배열"만 순서대로 전달하는 역할이면 된다. |
| 상대가 던지는 동안 내 화면 | **간단한 대기 화면.** 핀은 결과가 도착한 순간 굴러가는 과정 없이 바로 "쓰러진 뒤 상태"로 바뀐다. 배너("스트라이크!" 등)는 기존 `onThrowResolved` 로직을 그대로 재사용한다 | 두 기기의 Rapier 물리를 똑같이 재현하는 것(리플레이)은 부정확하고(부동소수점 차이) 어려워서 배보다 배꼽이 크다. 점수에 영향 없는 연출이라 최소로 간다. |
| 방 참가 | **방 코드** (4자, 헷갈리는 0/O·1/I 제외) 만들기/참가하기 | 계정이 없는 초등 교육용 앱의 기존 방침과 같다. 말로 불러주기 쉬운 길이. |
| 참가자 신원 | 각자 자기 기기의 `PlayerStore.current`를 그대로 쓴다(이름·손). 온라인 대전도 다 배운 사람만 참가 가능 — 기존 `isGraduated` 규칙 그대로 | 새 계정 개념을 만들지 않는다. 로컬 다인 매치와 해금 규칙을 그대로 재사용. |
| 프레임 수 | 방을 만든 사람이 3/5/10 중 고른다(기존 `MatchSetup`과 동일 선택지) | 기존 UI 패턴 재사용. |
| 끊김 처리 (MVP) | 방에 재접속하면 `requestState` 브로드캐스트를 보내고, 그 방에 남아 있는 다른 사람이 지금까지의 "남은 핀 로그"를 되돌려준다. **아무도 없으면 그 방은 사라진 것으로 본다** — "상대를 찾을 수 없어요"로 안내하고 새로 만들기/참가하기로 돌려보낸다 | Broadcast는 서버에 아무것도 저장하지 않으므로 전원이 나가면 로그도 함께 사라진다. 완전한 서버 영속성(3에서 다룬 Postgres 테이블 방식)은 설계·RLS·마이그레이션이 붙는 훨씬 큰 작업이라 이번 스코프에서는 뺀다. 이 한계는 화면에 정직하게 알린다. |
| 무순서 방지 | 굴림마다 순번(`seq`)을 붙인다. 기대한 다음 순번이 아니면 적용하지 않고 `requestState`로 재동기화 | Broadcast는 발송 순서 보장이 Postgres 테이블만큼 강하지 않다. 저비용으로 두면 안전하다. |

## 제외한 것 (이번 스코프 밖)

- 3D 리플레이(상대가 던지는 공을 내 화면에서도 굴러가는 것처럼 보여주기)
- 서버측 영속 저장(재접속해도 100% 복구되는 보장) — Postgres 테이블 기반으로 나중에 강화 가능
- 매치메이킹(모르는 사람과 자동 매칭) — 방 코드로 아는 사람과만
- 관전자(참가하지 않고 구경만 하는 사람)
- 음성/텍스트 채팅
- 같은 기기 다인 매치(기존 기능)와의 통합 화면 — 온라인 대전은 별도 진입점

## 1. 통신 계층 — `net/`(신규, 순수에 가깝게)

```
net/supabaseClient.ts   Supabase 클라이언트 생성 (import.meta.env의 VITE_SUPABASE_URL/ANON_KEY)
net/RoomChannel.ts       방 하나에 대응하는 Broadcast+Presence 채널 래퍼
net/roomCode.ts          방 코드 생성 (4자, 순수 함수 — 테스트 가능)
net/MatchSync.ts         "남은 핀 로그"를 받아 로컬 MatchMachine을 재생하는 순수 리듀서
```

`MatchSync`가 핵심이고 유일하게 촘촘히 테스트할 부분이다. 네트워크를 전혀 모른다 —
입력은 `{ seq: number; playerId: string; remaining: PinNumber[] }[]`이고, 출력은
"이 순번까지 재생된 `MatchMachine`"이다. `RoomChannel`은 이 배열을 Broadcast로
주고받는 어댑터일 뿐이라 로직이 거의 없다.

```ts
class MatchSync {
  constructor(participants: MatchPlayer[], totalFrames: number)
  readonly match: MatchMachine        // 지금까지 재생된 상태
  get nextSeq(): number               // 다음에 기대하는 순번 (= 지금까지 적용한 굴림 수)
  apply(entry: RollLogEntry): 'applied' | 'stale' | 'gap'
  replay(log: RollLogEntry[]): void   // 처음부터 다시 재생 (재동기화용)
}
```

`apply`가 `'gap'`을 돌려주면(순번이 비었다) 호출부가 `requestState`를 보낸다.
`'stale'`(이미 적용한 순번)이면 조용히 무시한다 — Broadcast가 같은 메시지를
두 번 배달할 수 있다.

## 2. 방 상태 — `RoomChannel`

Supabase Realtime 채널 이름: `room:{code}`. 이벤트 세 종류만 쓴다.

| 이벤트 | 보내는 사람 | 내용 |
|---|---|---|
| `roll` | 방금 던진(=지금 차례였던) 사람 | `{ seq, playerId, remaining: PinNumber[] }` |
| `requestState` | 막 들어왔거나 gap을 발견한 사람 | `{ from: participantId }` |
| `stateSnapshot` | requestState를 받은 사람 중 가장 로그가 긴 사람 | `{ log: RollLogEntry[], participants, totalFrames }` |

참가자 목록·차례 진행은 전부 `MatchSync`가 로그로부터 계산하므로 별도로
"지금 누구 차례"를 방송할 필요가 없다 — 로그 하나로 모든 것이 유도된다.

**Presence**는 로비(참가자가 모이는 대기 화면)에서만 쓴다. 방장이 시작하기를
누르면 그 순간의 Presence 목록을 `participants`로 굳혀 `MatchSync`를 만든다.
경기가 시작된 뒤에는 Presence를 보지 않는다(끊김·재접속은 `requestState`가 처리).

## 3. 화면 흐름

```
홈(영역 메뉴)
  └ 온라인 대전 🔒 (수료해야 열림 — 기존 대전과 같은 해금 규칙)
       ├ 방 만들기 → 코드 표시(예: "7F3K") → 참가자 대기 화면(Presence로 실시간 목록)
       │     → 2명 이상 모이면 프레임 수 고르고 [시작하기]
       └ 참가하기 → 코드 입력(4자) → 대기 화면(방장이 시작하면 자동 전환)
                                                        ↓
                                              대전 화면(기존 대전 화면 재사용)
                                              내 차례면 기존 조준·드래그 그대로.
                                              남 차례면 입력이 막히고
                                              "○○ 님이 던지는 중…" 배너만 다르다.
```

기존 `MatchSetup`(같은 기기 대전)은 그대로 둔다. 온라인 대전은 `AreaMenu`에
새 버튼을 하나 더 추가한다(`onlineMatch`), 기존 `match` 콜백과 나란히.

## 4. `Game`/`main.ts` 통합

- `Game`에 `applyRemoteThrow(remaining: PinNumber[]): MatchThrowResult` 추가.
  `updateThrowProgress()`의 물리-결과 경로와 로직을 공유하되(둘 다
  `this._match.settle(remaining)` → 손 전환 → `onThrowResolved` 발화 → 1400ms 뒤
  `beginAiming()`), 핀을 애니메이션 없이 즉시 `nextStanding` 상태로 그린다.
- `Game`에 새 이벤트 `onLocalRoll: (remaining: PinNumber[]) => void` 추가.
  `updateThrowProgress()`가 물리로 실제 정지를 감지해 `settle()`을 부르는 바로 그
  지점에서 함께 발화한다. **온라인 대전 중일 때만** `main.ts`가 이 이벤트를 구독해
  `RoomChannel.sendRoll()`로 방송한다 — 로컬 전용 대전에서는 아무도 구독하지 않으므로
  기존 동작에 영향이 없다.
- `Input.enabled`는 기존에도 `machine.phase`로 막혔다. 온라인 대전에서는
  **내 차례가 아니면** 추가로 막아야 한다 — `main.ts`가 `match.active.id`를 보고
  내 참가자 id와 다르면 조준 자체를 비활성화한다(`game.input.enabled = false`로
  직접 끄기보다, `Game`에 `onlineGate: () => boolean` 훅을 하나 두어 `beginAiming()`
  안에서 함께 체크하게 한다 — 드릴·연습과 같은 "입력 가능 여부 중앙 판정" 자리다).

`FrameMachine.ts`, `Scorecard.ts`, `MatchMachine.ts`는 **한 줄도 건드리지 않는다**
(2단계 스펙의 원칙을 그대로 잇는다). 순수 로직이 이미 리플레이 가능하다는 것 자체가
이번 설계가 가능한 이유다.

## 5. 파일 구성

신규:

| 파일 | 내용 |
|---|---|
| `net/supabaseClient.ts` | Supabase 클라이언트 초기화, 환경변수 누락 시 명확한 에러 |
| `net/roomCode.ts` | 방 코드 생성 · 형식 검사 (순수) |
| `net/MatchSync.ts` | 롤 로그 → `MatchMachine` 재생 리듀서 (순수) |
| `net/MatchSync.test.ts` | 유닛 테스트 |
| `net/RoomChannel.ts` | Supabase Broadcast/Presence 어댑터 |
| `ui/OnlineMatchSetup.ts` | 방 만들기 · 참가하기 · 로비 화면 |
| `.env.local` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (git 제외, `*.local` 규칙에 이미 걸림) |

수정:

| 파일 | 변경 |
|---|---|
| `core/Game.ts` | `applyRemoteThrow()`, `onLocalRoll` 이벤트, `onlineGate` 훅 |
| `ui/AreaMenu.ts` | "온라인 대전" 버튼 추가 (기존 대전과 같은 해금 규칙) |
| `main.ts` | 온라인 대전 진입 배선, `RoomChannel` 생성/구독, 대기 화면 전환 |
| `package.json` | `@supabase/supabase-js` 의존성 추가 |

## 6. 검증

| 대상 | 방법 |
|---|---|
| `MatchSync` 재생 | 유닛 테스트. 정상 순서 재생, 중복 순번 무시(`stale`), 순번 누락 감지(`gap`), 처음부터 재생(`replay`)이 실시간 재생과 같은 결과를 내는지 |
| `roomCode` | 유닛 테스트. 형식(4자, 헷갈리는 문자 제외), 충돌 시 재생성 |
| 기존 테스트 266개 | 그대로 통과해야 한다. `MatchMachine`을 건드리지 않는 것이 이 조건이다 |
| 타입·빌드 | `npm run typecheck`, `npm run build` |
| 실기 — 2탭 시뮬레이션 | Playwright로 브라우저 탭 2개를 각각 다른 "참가자"로 열어 방 만들기 → 참가하기 → 번갈아 던지기 → 양쪽 점수판이 항상 같은지 확인 |
| 실기 — 재접속 | 한 탭을 새로고침한 뒤 같은 방 코드로 다시 들어가 `requestState`로 복구되는지 |
| 실기 — 상대 없음 | 혼자 방에 재접속했을 때 안내 문구가 뜨는지 |

### 위험

- **Broadcast 메시지 유실.** 학교 와이파이는 불안정할 수 있다. `seq` 기반 gap 감지 +
  `requestState`가 안전망이지만, 두 사람이 동시에 gap을 발견해 서로 `requestState`를
  주고받는 진동이 생기지 않는지 실기로 확인한다.
- **방 코드 충돌.** 4자 코드는 공간이 좁다(약 84만 개, 헷갈리는 문자 제외 기준).
  같은 코드로 두 방이 동시에 열리면 서로 다른 사람이 섞인다. 만들 때 그 코드의
  채널에 이미 누가 있는지(Presence) 확인하고 있으면 다시 뽑는다.
- **환경변수 누락.** `.env.local`이 없는 환경(다른 개발자가 클론)에서는 온라인 대전
  버튼을 누르는 순간 "온라인 대전을 설정할 수 없어요"로 조용히 안내하고 앱 나머지는
  정상 동작해야 한다 — 부팅 자체를 막으면 안 된다(오프라인 기능까지 함께 죽는다).
- **서버 없는 정답의 한계.** 두 기기가 동시에 자기가 냈다고 믿는 `remaining`이
  다르면(이론상 물리 버그로 그럴 수 있다) 로그 재생 결과가 갈린다 — 이번 설계는
  "믿고 재생"이라 이런 충돌을 탐지하지 않는다. 낮은 확률이고, 탐지·중재까지 넣으면
  스코프가 크게 늘어나 이번엔 뺀다.
