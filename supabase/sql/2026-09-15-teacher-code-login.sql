-- 계정 방식 개편: 교사만 계정을 만들고, 학생은 코드 하나로 로그인한다.
--
-- 이 파일은 2026-08-01-players-sync.sql · 2026-08-02-teacher-student-dashboard.sql을
-- 완전히 대체한다. 두 파일이 만든 이름+PIN 자가 등록, 교사 이름+비밀번호(teacher_accounts)
-- 모델을 버리고 아래 모델로 바꾼다:
--
--   - 학생 계정은 교사만 만들 수 있다(register_student). 학생은 이름을 직접 짓지 않고,
--     서버가 만들어 준 6자리 숫자 코드 하나로만 로그인한다(login_student) — 이름+PIN
--     쌍이 아니라 코드 자체가 유일한 로그인 수단이다.
--   - 교사인지 확인하는 절차는 이름+비밀번호를 미리 등록해 두는 teacher_accounts 테이블이
--     아니라, 공유 코드 'gusanteacher'를 그대로 입력받아 비교하는 것으로 바꾼다
--     (verify_teacher_code) — 교사마다 계정을 미리 만들어 둘 필요가 없다. 교사를
--     구분하는 이름(teacher_name)은 여전히 필요하지만, 그 이름은 어디에도 미리
--     등록하지 않고 매번 자유롭게 입력한다 — "학생 목록을 누구 것으로 볼지" 구분표일
--     뿐이다.
--   - 실기 확인 결과 이 앱에 저장된 학생 데이터가 거의 없어(테스트 더미뿐) 기존 테이블을
--     지우고 새로 만든다. 실제 학생이 있는 배포라면 이 DROP 전에 마이그레이션이 필요하다.
--
-- 이 앱은 GitHub Pages 정적 배포라 자체 서버가 없다. 이 SQL은 개발자가 Supabase 대시보드 →
-- SQL Editor에 전체를 붙여넣어 한 번 실행해야 한다.

drop function if exists public.pull_player(text, text);
drop function if exists public.push_player(text, text, text, jsonb);
drop function if exists public.verify_teacher(text, text);
drop function if exists public.register_student(text, text, text, text);
drop function if exists public.list_students(text, text);
drop table if exists public.players_sync cascade;
drop table if exists public.teacher_accounts cascade;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- students

create table public.students (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  teacher_name text not null,
  handedness text not null default 'right' check (handedness in ('left', 'right')),
  progress jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.students enable row level security;
revoke all on public.students from anon, authenticated;

-- 코드로 로그인한다. 이름+PIN 쌍이 아니라 코드 하나가 계정 전체를 가리키므로
-- "틀렸다"와 "없다"를 구분해 알려줄 필요가 없다 — 그냥 found=false다.
create or replace function public.login_student(p_code text)
returns table (found boolean, name text, handedness text, progress jsonb)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.students;
begin
  select * into v_row from public.students s where s.code = p_code;

  if v_row.id is null then
    return query select false, null::text, null::text, null::jsonb;
    return;
  end if;

  return query select true, v_row.name, v_row.handedness, v_row.progress;
end;
$$;

grant execute on function public.login_student(text) to anon;

-- 로그인 코드를 아는 사람이 곧 그 계정의 주인이므로(PIN처럼 이름과 짝지어 확인할
-- 필요가 없다), 코드만으로 진행률을 갱신한다.
create or replace function public.save_student_progress(
  p_code text,
  p_handedness text,
  p_progress jsonb
) returns table (ok boolean, error text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.students;
begin
  select * into v_row from public.students s where s.code = p_code;
  if v_row.id is null then
    return query select false, 'not_found';
    return;
  end if;

  update public.students
  set handedness = p_handedness,
      progress = p_progress,
      updated_at = now()
  where id = v_row.id;

  return query select true, null::text;
end;
$$;

grant execute on function public.save_student_progress(text, text, jsonb) to anon;

-- ---------------------------------------------------------------- 교사 인증 + 학생 등록

-- 교사인지 확인하는 절차 전체 — 공유 코드 하나를 그대로 비교한다. 저장할 대상이
-- 없으므로(모든 교사가 같은 코드를 쓴다) 테이블 조회가 없다.
create or replace function public.verify_teacher_code(p_code text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select p_code = 'gusanteacher';
$$;

grant execute on function public.verify_teacher_code(text) to anon;

-- 무작위 6자리 숫자 코드를 만든다. students.code 유니크 제약과 충돌하면
-- 최대 10번 다시 뽑는다(6자리 공간이 100만 개라 실사용 규모에서는 충돌이 극히 드물다).
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
  if p_teacher_code <> 'gusanteacher' then
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

grant execute on function public.register_student(text, text, text) to anon;

-- 그 교사가 register_student로 만든 학생들의 코드·진행률을 돌려준다. RETURNS
-- TABLE에 name 컬럼이 있으면 plpgsql이 그 이름으로 변수를 암묵적으로 만들어
-- 버려 조건절의 컬럼과 충돌한다(2026-08-02 파일에서 겪은 문제) — 테이블 별칭
-- (s.*)을 명시해 피한다.
create or replace function public.list_students(
  p_teacher_code text,
  p_teacher_name text
) returns table (ok boolean, code text, name text, handedness text, progress jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_teacher_code <> 'gusanteacher' then
    return query select false, null::text, null::text, null::text, null::jsonb, null::timestamptz;
    return;
  end if;

  return query
    select true, s.code, s.name, s.handedness, s.progress, s.updated_at
    from public.students s
    where s.teacher_name = p_teacher_name
    order by s.name;
end;
$$;

grant execute on function public.list_students(text, text) to anon;
