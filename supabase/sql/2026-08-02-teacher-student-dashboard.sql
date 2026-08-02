-- 교사-학생 소속 관계 + 교사용 학생 기록 조회 대시보드용 스키마.
--
-- 2026-08-01-players-sync.sql 다음에 실행한다(같은 players_sync/teacher_accounts
-- 테이블을 그대로 쓴다). 이 앱은 GitHub Pages 정적 배포라 자체 서버가 없고,
-- 나(어시스턴트)는 서비스 롤 키가 없어 이 SQL을 대신 실행할 수 없다 —
-- 개발자가 Supabase 대시보드 → SQL Editor에 전체를 붙여넣어 한 번 실행해야 한다.
--
-- 설계 요약 (docs/superpowers/specs/2026-08-01-teacher-features-backlog.md의
-- 3번·4번 항목):
--   - players_sync에 teacher_name 컬럼을 추가한다 — 교사가 register_student로
--     만든 학생만 채워진다. 학생이 스스로 만든 계정(기존 push_player 경로)은
--     계속 null이다.
--   - register_student: 교사 이름+비밀번호를 verify_teacher와 같은 방식으로
--     서버에서 검증한 뒤에만 학생을 만든다. TeacherRegister.ts가 클라이언트에서
--     isMaster 플래그만 보고 버튼을 보여주는 것과 별개로, 실제 쓰기 권한은
--     여기 서버 쪽 비밀번호 검증이 막는다.
--   - list_students: 마찬가지로 비밀번호를 서버에서 검증한 뒤 그 교사 소유
--     학생만 돌려준다. 인증 실패와 "학생이 아직 없음"을 구분해야 해서, 인증
--     실패일 때만 ok=false인 행 하나를 돌려주고, 성공하면 ok=true인 행을
--     학생 수만큼(0개 포함) 돌려준다.

alter table public.players_sync add column if not exists teacher_name text;

-- 교사가 학생 계정을 미리 만든다. push_player와 달리 이미 있는 이름이면
-- 그냥 실패한다(기존 학생의 진행률을 교사가 실수로 덮어쓰지 않도록) — 자기
-- 진행률을 이어 쓰려는 학생은 계속 기존 "다른 기기와 이어서 쓰기"(pull/push)
-- 경로를 쓴다.
create or replace function public.register_student(
  p_teacher_name text,
  p_teacher_password text,
  p_student_name text,
  p_pin text
) returns table (ok boolean, error text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_teacher_hash text;
  v_row public.players_sync;
begin
  select password_hash into v_teacher_hash from public.teacher_accounts where name = p_teacher_name;
  if v_teacher_hash is null or v_teacher_hash <> crypt(p_teacher_password, v_teacher_hash) then
    return query select false, 'teacher_auth_failed';
    return;
  end if;

  select * into v_row from public.players_sync where name_key = lower(p_student_name);
  if v_row.id is not null then
    return query select false, 'name_taken';
    return;
  end if;

  insert into public.players_sync (name, pin_hash, handedness, progress, teacher_name)
  values (p_student_name, crypt(p_pin, gen_salt('bf')), 'right', '{}'::jsonb, p_teacher_name);
  return query select true, null::text;
end;
$$;

grant execute on function public.register_student(text, text, text, text) to anon;

-- 교사가 만든 학생들의 이름·손·진행률·마지막 갱신 시각을 돌려준다.
create or replace function public.list_students(
  p_teacher_name text,
  p_teacher_password text
) returns table (ok boolean, name text, handedness text, progress jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_teacher_hash text;
begin
  select password_hash into v_teacher_hash from public.teacher_accounts where name = p_teacher_name;
  if v_teacher_hash is null or v_teacher_hash <> crypt(p_teacher_password, v_teacher_hash) then
    return query select false, null::text, null::text, null::jsonb, null::timestamptz;
    return;
  end if;

  return query
    select true, s.name, s.handedness, s.progress, s.updated_at
    from public.players_sync s
    where s.teacher_name = p_teacher_name
    order by s.name;
end;
$$;

grant execute on function public.list_students(text, text) to anon;
