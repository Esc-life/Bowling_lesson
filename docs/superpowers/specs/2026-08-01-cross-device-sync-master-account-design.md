# 기기 간 진행률 동기화(이름+PIN) + 마스터(교사) 계정 설계

작성일 2026-08-01. `docs/superpowers/specs/2026-08-01-online-match-design.md`(3단계 온라인
실시간 대전)와 달리, 이번엔 처음으로 **실제 Supabase Postgres 테이블 + RLS + RPC 함수**를
쓴다 — 지금까지는 Realtime Broadcast/Presence만 썼고 테이블은 전혀 없었다.

## 무엇을 만드는가

1. **기기 간 진행률 동기화.** 지금은 플레이어 프로필(이름·손·진행률)이 `localStorage`에만
   있어, 같은 이름을 다른 기기에서 입력해도 완전히 새 프로필이 생긴다. 이름+PIN(4자리)으로
   같은 사람임을 확인하고 진행률을 합친다.
2. **마스터(교사) 계정.** 특정 이름+비밀번호로 들어가면 18레슨을 다 배운 것처럼 자유
   연습·대전·온라인 대전이 즉시 열린다. 수업 시간에 교사가 바로 예시를 보여줄 수 있어야
   한다.

## 결정한 것 (사용자와 AskUserQuestion으로 확정)

| 항목 | 결정 | 왜 |
|---|---|---|
| 동기화 확인 방식 | **이름 + PIN(4자리)** | 지금처럼 "아무나 이름만 치면 계정이 생기는" 구조에서 그대로 서버 동기화를 걸면 이름이 겹치는 순간 남의 진행률을 이어받거나 덮어쓰는 사고가 난다. PIN은 실제 보안이 아니라 이름 충돌을 막는 가벼운 잠금 — 학생이 잊어버려도 큰 문제가 아니게(잃는 건 "동기화"뿐, 로컬 진행률은 그대로) 설계했다. |
| 마스터 계정 인증 | **Supabase 서버 검증(RPC 함수)** | 이 앱은 GitHub Pages 정적 배포라, 비밀번호를 프론트엔드 소스에 그대로 넣으면 개발자 도구로 바로 보인다. Edge Function 대신 `pgcrypto` 기반 SQL 함수로 설계해, 별도 CLI 배포 없이 SQL Editor에 한 번 붙여넣는 것만으로 끝나게 했다. |
| 접근 방식 | RLS로 anon 직접 접근을 막고, 클라이언트는 **SECURITY DEFINER RPC 함수**로만 접근 | Postgres RLS만으로 "이 행의 pin_hash가 파라미터와 맞는가"를 표현하기 번거롭다. RPC가 더 단순하고 검증하기 쉽다. |
| 병합(merge) 로직 위치 | **SQL이 아니라 TypeScript** (`src/net/PlayerSync.ts`의 `mergeProgress`) | union/우선순위 로직을 SQL로 짜면 검증하기 어렵다. `pull_player`/`push_player` RPC는 순수 CRUD만 한다. |

## 스키마 (수동 배포 필요)

`supabase/sql/2026-08-01-players-sync.sql`에 전체 SQL이 있다. **나는 서비스 롤 키나
Supabase CLI 로그인이 없어 이 SQL을 대신 실행할 수 없다** — 개발자가 Supabase 대시보드
→ SQL Editor에 파일 전체를 붙여넣어 한 번 실행해야 한다.

- `public.players_sync` — `name`(대소문자 무시 unique), `pin_hash`(pgcrypto), `handedness`,
  `progress`(jsonb), `updated_at`. RLS 켜짐, anon/authenticated 직접 접근 없음.
- `public.teacher_accounts` — `name`(PK), `password_hash`. RLS 켜짐, 직접 접근 없음.
- `pull_player(name, pin)` → `found`/`pin_ok`/`handedness`/`progress`
- `push_player(name, pin, handedness, progress)` → `ok`/`error`
- `verify_teacher(name, password)` → boolean (이름이 없든 비밀번호가 틀리든 똑같이 false —
  계정 존재 여부를 드러내지 않는다)

교사 계정 등록은 SQL 파일 맨 아래 템플릿을 이름/비밀번호만 바꿔 직접 실행한다. **실제
비밀번호가 든 INSERT 문은 이 리포에 절대 커밋하지 않는다.**

## 클라이언트 구현

- `src/net/PlayerSync.ts`(신규) — `pullPlayer`/`pushPlayer`/`verifyTeacher`/`mergeProgress`.
  `supabaseClient.ts`와 같은 "설정 없으면 조용히 offline" 원칙.
- `Player` 타입(`src/players/types.ts`)에 `pin?: string`, `isMaster?: boolean` 추가 —
  둘 다 없으면 지금과 완전히 동일(로컬 전용).
- `unlock.ts`의 `isGraduated()`에 `player.isMaster === true` 우회 한 줄 — `AreaMenu`/
  `MatchSetup`이 전부 이 함수를 거치므로 자유 연습·대전·온라인 대전이 자동으로 풀린다.
- `PlayerStore.saveProgress()` 끝에서, `pin`이 있는 플레이어는 저장할 때마다
  fire-and-forget으로 `pushPlayer`를 부른다(await 안 함 — 오프라인이어도 저장 자체는
  막히면 안 된다).
- `PlayerPicker.ts`:
  - 만들기 폼에 PIN 입력칸(선택), "선생님이신가요?" 토글(비밀번호 칸) 추가. 토글은
    `render()` 전체를 다시 그리지 않고 클래스만 바꾼다(손 선택 버튼 깜빡임 버그를
    고친 것과 같은 원칙 — `data-hand` 토글도 이번에 같이 고쳤다).
  - 제출 시: 비밀번호가 있으면 `verifyTeacher`로 검증 후 `isMaster` 플레이어 생성.
    PIN이 있으면 `pullPlayer`로 원격을 확인 — `pin_mismatch`면 오류로 막고, `ok`면
    `mergeProgress`로 합쳐서 생성, `not_found`/`offline`이면 로컬 기준으로 새로
    등록(+ 백그라운드 `push`). 아무것도 없으면 지금과 완전히 동일.
  - 기존 플레이어를 다시 고를 때(PIN이 있으면) `syncOnEntry`로 한 번 더 원격과
    맞춘다 — 실패해도 조용히 로컬 그대로 진행(여긴 이미 검증된 로컬 플레이어를
    다시 여는 것뿐이라 오류로 막지 않는다).
  - 플레이어 목록/진행률 표시: `isMaster`면 "0/18 배움" 대신 "선생님 계정" 배지.

## 병합(merge) 정책 (`mergeProgress`)

- `completedLessons`: 로컬 ∪ 원격 합집합.
- `quizScores`: 레슨별로 정답률(`correct/total`)이 더 높은 쪽을 남긴다.
- `currentLessonId`: 로컬 값이 있으면 그걸 우선(지금 이 기기가 이어서 배우려던 레슨).
  로컬이 비어 있으면(막 만든 새 기기) 원격 값을 쓴다.

## 검증한 것 / 검증하지 못한 것

- `PlayerSync.test.ts` — `mergeProgress` 순수 함수 + `pullPlayer`/`pushPlayer`/
  `verifyTeacher`의 offline/not_found/pin_mismatch/ok 분기 전부 유닛 테스트로 확인.
- `unlock.test.ts` — 마스터 계정 우회 테스트 추가.
- Playwright(헤드리스, 모바일 뷰포트)로 확인: PIN 입력 후 제출 시 RPC가 아직 없어도
  (SQL 미실행 상태) 콘솔 에러 없이 홈 화면까지 도달, 잘못된 교사 비밀번호 입력 시
  "이름이나 비밀번호가 달라요." 오류가 뜨고 제출 버튼이 정상적으로 다시 눌리는 상태로
  돌아옴, "선생님이신가요?" 토글이 이름 입력창을 다시 그리지 않고 클래스만 바꿈(포커스가
  안 끊김).
- **아직 검증 못한 것 — 사용자가 SQL을 실제로 실행한 뒤에만 가능**: 실제 두 기기 간
  이름+PIN 왕복 동기화(진짜 `pull_player`/`push_player` RPC 응답), 교사 계정 로그인
  성공 경로(실제 `teacher_accounts` 행 필요).

## 제외한 것 (이번 스코프 밖 — 별도 백로그 문서로)

카메라·모션 인식, 학생 동작 평가, 교사가 학생 기록을 조회하는 대시보드, 교사가 학생
계정을 미리 만들어 로그인시키는 방식은
`docs/superpowers/specs/2026-08-01-teacher-features-backlog.md`에 미구현 상태로 남겨
뒀다.
