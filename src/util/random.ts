/**
 * 시드 고정 난수.
 *
 * 두 곳에서 쓴다.
 *  1. 절차적 텍스처의 나뭇결 — 새로고침해도 레인이 같아야 한다
 *  2. 퀴즈 보기 섞기 — 교사가 수업 전에 본 화면과 학생이 보는 화면이
 *     같아야 한다. 매번 순서가 바뀌면 미리 확인할 수 없다.
 */

/** mulberry32 — 짧고 품질이 충분한 32비트 PRNG */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 문자열을 시드로 바꾼다 (레슨 ID 같은 것을 그대로 시드로 쓰기 위해) */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 원본을 바꾸지 않고 섞은 새 배열을 돌려준다 (Fisher-Yates) */
export function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
