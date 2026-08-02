# 교사-학생 소속 관계 + 학생 기록 조회 대시보드 설계

작성일 2026-08-02. `docs/superpowers/specs/2026-08-01-teacher-features-backlog.md`의
3번(교사 계정에서 학생 기록 조회)과 4번(교사가 학생 계정을 만드는 방식)을 함께 구현했다
— 3번을 하려면 학생-교사 소속 관계가 있어야 하는데, 그게 곧 4번(교사가 만든 학생만
소속이 생긴다)이라 자연스럽게 묶었다.

## 무엇을 만들었는가

1. **학생 등록에 소속 부여.** 기존 `TeacherRegister`(학생 이름+번호를 교사가 미리
   만들어 두는 화면)가 이제 교사 비밀번호를 다시 받아, 새 `register_student` RPC로
   등록한다. 서버가 비밀번호를 검증한 뒤에만 학생 행에 `teacher_name`을 남긴다.
2. **학생 기록 보기.** 새 `TeacherDashboard` 화면(`src/ui/TeacherDashboard.ts`) — 교사
   비밀번호를 다시 받아 `list_students` RPC로 그 교사가 만든 학생들의 이름·손·배운
   레슨 수·퀴즈 평균·마지막 갱신 시각을 본다. `AreaMenu`의 플레이어 바에 "학생 기록"
   버튼을 추가했다(교사 계정에서만 보인다).

## 결정한 것

| 항목 | 결정 | 왜 |
|---|---|---|
| 소속 표현 방식 | `players_sync`에 `teacher_name text` 컬럼 추가 | 별도 조인 테이블 없이 가장 단순하게 "이 학생은 이 교사가 만들었다"만 표현하면 충분 — 교사가 여러 반을 가르치는 경우의 반 구분 등은 스코프 밖. |
| 학생 조회 시 인증 | 교사 비밀번호를 매번 서버에서 다시 검증 (`register_student`/`list_students` 둘 다 `verify_teacher`와 같은 crypt 비교를 자체적으로 한다) | isMaster 로그인 때 쓴 비밀번호를 어디에도 캐시하지 않는 기존 방침(`docs/superpowers/specs/2026-08-01-cross-device-sync-master-account-design.md`)을 그대로 따른다 — 클라이언트가 `isMaster` 플래그만 갖고 있고 실제 쓰기·읽기 권한은 서버 쪽 비밀번호 검증이 막는다. |
| 자기 등록 학생과의 관계 | 학생이 스스로 만든 계정(기존 `push_player` 경로)은 `teacher_name`이 계속 null | 아무 교사나 자기 진행률을 볼 수 있게 되면 안 된다 — 교사가 직접 만든 학생만 조회 대상이 되는 게 의도한 동작. |
| `register_student`가 기존 학생 이름과 겹치면 | 그냥 실패(`name_taken`), 덮어쓰지 않는다 | 학생이 이미 스스로 만든 진행률을 교사가 실수로 지우면 안 된다. |
| `list_students` 반환 모양 | `ok` 불리언을 포함한 행을 돌려주고, 인증 실패면 `ok=false`인 행 1개, 성공하면 학생 수만큼(0개 포함) `ok=true` 행 | 인증 실패("비밀번호가 달라요")와 "학생이 아직 없음"을 클라이언트가 구분해서 다른 안내를 보여줘야 하는데, 빈 배열만으로는 둘을 구분할 수 없다. |

## 스키마 (수동 배포 필요)

`supabase/sql/2026-08-02-teacher-student-dashboard.sql` — 2026-08-01-players-sync.sql
다음에 실행한다. `alter table ... add column if not exists`와
`create or replace function`만 써서 이미 있는 데이터를 건드리지 않는다. 나(어시스턴트)는
서비스 롤 키가 없어 이 SQL을 대신 실행할 수 없다 — 개발자가 Supabase 대시보드 → SQL
Editor에 붙여넣어야 한다.

## 검증한 것 / 검증하지 못한 것

- `PlayerSync.test.ts`에 `registerStudent`/`listStudents`의 offline/ok/인증실패/이름중복
  분기를 유닛 테스트로 추가했다. `npm run typecheck`, `npm test` 모두 통과.
- Playwright(헤드리스)로 `?player=` 딥링크를 이용해 교사 계정으로 홈 화면을 열고,
  "학생 등록"·"학생 기록" 버튼이 교사 계정에서만 보이는 것, 학생 기록 화면에서
  비밀번호를 비운 채 제출하면 인라인 오류가 뜨는 것, 비밀번호를 입력해도 이
  개발 환경엔 Supabase 설정이 없어 "지금은 확인할 수 없어요" 오프라인 안내가 뜨는
  것까지 확인했다.
- **아직 검증 못한 것 — 사용자가 이 SQL을 실제로 실행한 뒤에만 가능**: 실제
  `register_student`로 학생을 만들고 `list_students`로 조회하는 왕복,
  이름이 이미 있을 때 `name_taken` 오류, 비밀번호를 틀렸을 때 `list_students`가
  `auth_failed`를 돌려주는 것. 전부 로직상으로는 `verify_teacher`(이미 검증된
  같은 crypt 비교 패턴)를 그대로 재사용해 위험은 낮다고 판단했지만, 실제 DB
  응답으로 확인된 것은 아니다.

## 제외한 것

카메라·모션 인식(백로그 1번), 학생 동작 평가(백로그 2번)는 여전히 미구현 —
`docs/superpowers/specs/2026-08-01-teacher-features-backlog.md` 참고. 교사가 여러
반을 나눠 관리하는 기능, 학생 기록을 CSV로 내보내는 기능도 이번 스코프 밖.
