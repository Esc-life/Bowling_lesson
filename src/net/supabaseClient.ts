/**
 * 온라인 대전이 쓰는 Supabase 클라이언트.
 *
 * 이 앱은 GitHub Pages(정적 호스팅, 자체 서버 없음)에 배포되므로 실시간
 * 동기화는 외부 서비스가 맡는다. Realtime Broadcast/Presence만 쓰고
 * 테이블·RLS는 두지 않는다 — anon key 하나로 바로 동작한다
 * (`docs/superpowers/specs/2026-08-01-online-match-design.md` 참고).
 *
 * `.env.local`이 없는 환경(다른 개발자가 막 클론한 저장소)에서도 앱
 * 전체가 죽으면 안 된다. 온라인 대전 버튼을 누르는 순간에만 에러를
 * 드러내고, 나머지 오프라인 기능(배우기·자유 연습·같은 기기 대전)은
 * 그대로 동작해야 한다.
 *
 * `@supabase/supabase-js`는 동적 import로 받는다. 정적으로 두면 온라인
 * 대전을 한 번도 안 쓰는 학생도 첫 화면 번들에 그 무게를 그대로 진다
 * (`main.ts`가 `Game`을 동적 import하는 것과 같은 이유 — `STATUS.md` 참고).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null | undefined;
let pending: Promise<SupabaseClient | null> | undefined;

/** 설정이 없으면 null. 예외를 던지지 않는다 — 호출부가 안내 문구로 대신한다 */
export function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (cached !== undefined) return Promise.resolve(cached);
  if (pending !== undefined) return pending;

  pending = load().finally(() => {
    pending = undefined;
  });
  return pending;
}

async function load(): Promise<SupabaseClient | null> {
  const url = import.meta.env['VITE_SUPABASE_URL'];
  const key = import.meta.env['VITE_SUPABASE_ANON_KEY'];

  if (typeof url !== 'string' || url.length === 0 || typeof key !== 'string' || key.length === 0) {
    cached = null;
    return null;
  }

  const { createClient } = await import('@supabase/supabase-js');
  cached = createClient(url, key, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return cached;
}

/** 테스트용 — 캐시를 비워 다음 호출이 환경변수를 다시 읽게 한다 */
export function resetSupabaseClientCache(): void {
  cached = undefined;
  pending = undefined;
}
