-- 교사 계정을 실제로 저장한다.
--
-- 2026-09-15 개편 이후 "교사 이름"은 어디에도 저장되지 않는 자유 입력
-- 텍스트였다 — students.teacher_name에 학생을 등록할 때마다 그때그때
-- 적히는 값일 뿐, 교사 자신의 행은 어디에도 없었다. 그래서:
--   - 다른 PC에서 같은 이름으로 "교사" 로그인해도 그 이름이 진짜 존재하는지
--     확인할 방법이 없었다(인증 코드만 맞으면 아무 이름이나 그냥 통과시켰다).
--   - 교사가 스스로 레슨·퀴즈를 눌러 봐도 그 진행률을 저장할 곳이 없었다.
--   - register_student/list_students가 teacher_name을 완전일치로 비교해서,
--     기기마다 공백 하나만 달라도 학생 목록이 통째로 안 보였다(사용자가 겪은
--     "다른 PC에서 교사 로그인하니 학생 등록 값이 없다" 문제의 유력한 원인).
--
-- 이 파일은:
--   1. teachers 테이블을 새로 만들고, 인증 코드(gs!@)를 입력할 때마다 그
--      이름을 자동으로 등록(upsert)한다 — 교사가 따로 "가입" 절차를 거치지
--      않는다. 이름은 대소문자·앞뒤 공백을 무시하고 비교한다
--      (name_key = lower(trim(name))) — players_sync(2026-08-01, 지금은
--      삭제됨)에서 쓰던 것과 같은 패턴.
--   2. register_student·list_students의 teacher_name 비교도 같은 이유로
--      완전일치 대신 lower(trim())로 완화한다.
--   3. 지금 students에 이미 남아 있는 teacher_name(박호균·문성원·최선미 등)을
--      teachers로 즉시 백필한다.
--
-- 이 앱은 GitHub Pages/Vercel 정적 배포라 자체 서버가 없다. 이 SQL은
-- Supabase 대시보드 → SQL Editor에 전체를 붙여넣어 한 번 실행해야 한다.
-- is_teacher_code() 함수가 이미 있어야 한다(2026-09-15-teacher-code-login.sql
-- 실행이 먼저 되어 있어야 함 — 이미 실행된 상태다).

-- ---------------------------------------------------------------- teachers

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text generated always as (lower(trim(name))) stored,
  handedness text not null default 'right' check (handedness in ('left', 'right')),
  progress jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index teachers_name_key_idx on public.teachers (name_key);

alter table public.teachers enable row level security;
revoke all on public.teachers from anon, authenticated;

-- 인증 코드가 맞으면 그 이름을 등록(없으면 새로 만들고, 있으면 그대로 두고)
-- 하고 그 교사의 진행률·손을 돌려준다. 학생의 login_student와 같은 자리에
-- 있는 함수다.
create or replace function public.login_teacher(p_code text, p_name text)
returns table (ok boolean, handedness text, progress jsonb, error text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.teachers;
begin
  if not public.is_teacher_code(p_code) then
    return query select false, null::text, null::jsonb, 'teacher_auth_failed';
    return;
  end if;

  insert into public.teachers (name)
  values (p_name)
  on conflict (name_key) do update set updated_at = now()
  returning * into v_row;

  return query select true, v_row.handedness, v_row.progress, null::text;
end;
$$;

grant execute on function public.login_teacher(text, text) to anon;

-- 교사가 스스로 레슨·퀴즈를 눌러 볼 때(선생님 계정은 isGraduated()가 항상
-- 통과시키므로 자유 연습·대전까지 다 열려 있다 — players/unlock.ts 참고)
-- 그 진행률을 저장한다. 학생의 save_student_progress와 같은 자리에 있다.
create or replace function public.save_teacher_progress(
  p_code text,
  p_name text,
  p_handedness text,
  p_progress jsonb
) returns table (ok boolean, error text)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_teacher_code(p_code) then
    return query select false, 'teacher_auth_failed';
    return;
  end if;

  update public.teachers
  set handedness = p_handedness,
      progress = p_progress,
      updated_at = now()
  where name_key = lower(trim(p_name));

  if not found then
    insert into public.teachers (name, handedness, progress)
    values (p_name, p_handedness, p_progress);
  end if;

  return query select true, null::text;
end;
$$;

grant execute on function public.save_teacher_progress(text, text, text, jsonb) to anon;

-- ---------------------------------------------------------------- 학생 쪽 비교 완화

-- 시그니처(파라미터·반환 모양)는 그대로 두고 teacher_name 비교 방식만
-- lower(trim())으로 바꾼다. 공백·대소문자 차이로 학생 목록이 통째로 안
-- 보이던 문제를 줄인다.
create or replace function public.register_student(
  p_teacher_code text,
  p_teacher_name text,
  p_student_name text
) returns table (ok boolean, code text, error text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
  v_tries int := 0;
begin
  if not public.is_teacher_code(p_teacher_code) then
    return query select false, null::text, 'teacher_auth_failed';
    return;
  end if;

  loop
    v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from public.students s where s.code = v_code);
    v_tries := v_tries + 1;
    if v_tries >= 10 then
      return query select false, null::text, 'code_generation_failed';
      return;
    end if;
  end loop;

  insert into public.students (code, name, teacher_name)
  values (v_code, p_student_name, p_teacher_name);

  return query select true, v_code, null::text;
end;
$$;

create or replace function public.list_students(
  p_teacher_code text,
  p_teacher_name text
) returns table (ok boolean, code text, name text, handedness text, progress jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_teacher_code(p_teacher_code) then
    return query select false, null::text, null::text, null::text, null::jsonb, null::timestamptz;
    return;
  end if;

  return query
    select true, s.code, s.name, s.handedness, s.progress, s.updated_at
    from public.students s
    where lower(trim(s.teacher_name)) = lower(trim(p_teacher_name))
    order by s.name;
end;
$$;

-- ---------------------------------------------------------------- 기존 교사 이름 백필

-- 지금 students.teacher_name에 남아 있는 이름(박호균·문성원·최선미)을
-- teachers로 즉시 등록한다. 새 이름이 나중에 더 생겨도 이 문장은 매번
-- 안전하다(on conflict do nothing).
insert into public.teachers (name)
select distinct s.teacher_name
from public.students s
on conflict (name_key) do nothing;
