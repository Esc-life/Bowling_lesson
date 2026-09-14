-- 교사 인증 코드를 gusanteacher → gs!@ 로 바꾼다.
--
-- 이 파일은 테이블을 건드리지 않는다(drop 없음) — 이미 등록된 학생 코드·진행률은
-- 그대로 남는다. 2026-09-15-teacher-code-login.sql을 이미 실행한 프로젝트에 이
-- 파일만 추가로 실행하면 된다.
--
-- is_teacher_code() 함수를 새로 두고, 코드를 비교하던 세 함수
-- (verify_teacher_code·register_student·list_students)가 리터럴 'gusanteacher'
-- 대신 이 함수를 부르도록 다시 만든다 — 다음에 코드를 또 바꿀 때는
-- is_teacher_code() 하나만 고치면 된다.

create or replace function public.is_teacher_code(p_code text)
returns boolean
language sql
immutable
as $$
  select p_code = 'gs!@';
$$;

create or replace function public.verify_teacher_code(p_code text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select public.is_teacher_code(p_code);
$$;

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
    where s.teacher_name = p_teacher_name
    order by s.name;
end;
$$;
