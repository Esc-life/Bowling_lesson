-- 기기 간 진행률 동기화(이름+PIN) + 마스터(교사) 계정용 스키마.
--
-- 이 앱은 GitHub Pages 정적 배포라 자체 서버가 없다. 이 파일을 실행할 CLI
-- 접근 권한(서비스 롤 키)이 없어서, 이 SQL은 개발자가 직접
-- Supabase 대시보드 → SQL Editor에 전체를 붙여넣어 한 번 실행해야 한다.
--
-- 설계 요약 (docs/superpowers/specs/2026-08-01-cross-device-sync-master-account-design.md 참고):
--   - players_sync: 이름+PIN으로 진행률을 기기 간에 동기화한다. PIN은 실제 보안이
--     아니라 이름 충돌을 막는 가벼운 잠금이라, 해시는 하되 강한 정책은 두지 않는다.
--   - teacher_accounts: 마스터(교사) 계정 이름+비밀번호. 프론트엔드 소스에는
--     비밀번호가 전혀 없고, verify_teacher() RPC가 서버 쪽에서만 비교한다.
--   - 두 테이블 모두 RLS를 켜고 anon/authenticated의 직접 접근을 막는다 — 클라이언트는
--     아래 SECURITY DEFINER 함수(RPC)로만 접근한다. 병합(merge) 로직은 여기 안 두고
--     클라이언트(TypeScript, src/net/PlayerSync.ts)에서 한다 — SQL로 짠 병합 로직은
--     검증하기 어렵다.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- players_sync

create table if not exists public.players_sync (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text generated always as (lower(name)) stored,
  pin_hash text not null,
  handedness text not null check (handedness in ('left', 'right')),
  progress jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists players_sync_name_key_idx on public.players_sync (name_key);

alter table public.players_sync enable row level security;
revoke all on public.players_sync from anon, authenticated;

-- 이름+PIN으로 원격 진행률을 읽어온다 ("pull").
--   found=false            → 그 이름으로 등록된 진행률이 없다(새 이름)
--   found=true, pin_ok=false → 이름은 있지만 PIN이 다르다(남의 이름과 충돌)
--   found=true, pin_ok=true  → handedness/progress를 그대로 돌려준다
create or replace function public.pull_player(p_name text, p_pin text)
returns table (found boolean, pin_ok boolean, handedness text, progress jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.players_sync;
begin
  select * into v_row from public.players_sync where name_key = lower(p_name);

  if v_row.id is null then
    return query select false, true, null::text, null::jsonb;
    return;
  end if;

  if v_row.pin_hash <> crypt(p_pin, v_row.pin_hash) then
    return query select true, false, null::text, null::jsonb;
    return;
  end if;

  return query select true, true, v_row.handedness, v_row.progress;
end;
$$;

-- 이름+PIN으로 새로 만들거나(첫 기기) 갱신한다("push"). 클라이언트가 이미
-- 로컬 진행률과 병합을 마친 결과(p_progress)를 그대로 저장한다.
create or replace function public.push_player(
  p_name text,
  p_pin text,
  p_handedness text,
  p_progress jsonb
) returns table (ok boolean, error text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.players_sync;
begin
  select * into v_row from public.players_sync where name_key = lower(p_name);

  if v_row.id is null then
    insert into public.players_sync (name, pin_hash, handedness, progress)
    values (p_name, crypt(p_pin, gen_salt('bf')), p_handedness, p_progress);
    return query select true, null::text;
    return;
  end if;

  if v_row.pin_hash <> crypt(p_pin, v_row.pin_hash) then
    return query select false, 'pin_mismatch';
    return;
  end if;

  update public.players_sync
  set handedness = p_handedness,
      progress = p_progress,
      updated_at = now()
  where id = v_row.id;

  return query select true, null::text;
end;
$$;

grant execute on function public.pull_player(text, text) to anon;
grant execute on function public.push_player(text, text, text, jsonb) to anon;

-- ---------------------------------------------------------------- teacher_accounts

create table if not exists public.teacher_accounts (
  name text primary key,
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.teacher_accounts enable row level security;
revoke all on public.teacher_accounts from anon, authenticated;

-- 이름+비밀번호가 맞는지만 알려준다. 존재하지 않는 이름과 틀린 비밀번호를
-- 구분해 돌려주지 않는다(계정 존재 여부 노출 방지) — 둘 다 false.
create or replace function public.verify_teacher(p_name text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  select password_hash into v_hash from public.teacher_accounts where name = p_name;
  if v_hash is null then
    return false;
  end if;
  return v_hash = crypt(p_password, v_hash);
end;
$$;

grant execute on function public.verify_teacher(text, text) to anon;

-- ---------------------------------------------------------------- 교사 계정 등록

-- 위 마이그레이션을 실행한 뒤, 교사 계정이 필요할 때마다 아래 문장의
-- '선생님이름'과 '실제비밀번호'를 바꿔 SQL Editor에서 직접 실행하세요.
-- 실제 비밀번호가 들어간 INSERT 문은 절대 이 리포에 커밋하지 마세요.
--
-- insert into public.teacher_accounts (name, password_hash)
-- values ('선생님이름', crypt('실제비밀번호', gen_salt('bf')));
