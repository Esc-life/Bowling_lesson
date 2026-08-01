/**
 * 이름+PIN 기기 간 진행률 동기화 + 마스터(교사) 계정 인증.
 *
 * 온라인 대전(supabaseClient.ts)과 같은 원칙 — Supabase 설정이 없는 환경(막
 * 클론한 저장소, .env.local 없음)에서도 앱이 죽으면 안 된다. 실패는 전부
 * 조용한 값으로 돌아오고, 호출부(PlayerPicker)가 안내 문구로 대신한다.
 *
 * 병합(merge)은 여기 TypeScript에서 한다 — SQL 함수(pull_player/push_player,
 * supabase/sql/2026-08-01-players-sync.sql)는 순수 CRUD만 하고 무엇을 남길지는
 * 정하지 않는다. SQL로 짠 병합 로직은 검증하기 어렵다.
 */

import type { Handedness } from '../rules/pinLayout';
import type { ProgressState, QuizScore } from '../tutorial/TutorialFlow';
import { getSupabaseClient } from './supabaseClient';

export type PullResult =
  | { kind: 'offline' }
  | { kind: 'not_found' }
  | { kind: 'pin_mismatch' }
  | { kind: 'ok'; handedness: Handedness; progress: ProgressState };

export type PushResult = { ok: true } | { ok: false; error: string };

function isHandedness(v: unknown): v is Handedness {
  return v === 'left' || v === 'right';
}

/** DB에서 온 값을 신뢰하지 않는다 — PlayerStore.sanitizeProgress와 같은 이유 */
function sanitizeRemoteProgress(v: unknown): ProgressState {
  if (typeof v !== 'object' || v === null) return { completedLessons: [], quizScores: {}, currentLessonId: null };
  const o = v as Record<string, unknown>;

  const rawCompleted = o['completedLessons'];
  const completedLessons = Array.isArray(rawCompleted)
    ? rawCompleted.filter((x): x is string => typeof x === 'string')
    : [];

  const quizScores: Record<string, QuizScore> = {};
  const rawScores = o['quizScores'];
  if (typeof rawScores === 'object' && rawScores !== null) {
    for (const [id, value] of Object.entries(rawScores as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue;
      const s = value as Record<string, unknown>;
      const correct = s['correct'];
      const total = s['total'];
      if (typeof correct === 'number' && typeof total === 'number' && total > 0) {
        quizScores[id] = { correct, total };
      }
    }
  }

  const current = o['currentLessonId'];
  return {
    completedLessons,
    quizScores,
    currentLessonId: typeof current === 'string' ? current : null,
  };
}

/**
 * 로컬 진행률과 원격(다른 기기) 진행률을 합친다.
 *
 * completedLessons: 합집합(어느 기기에서 끝냈든 끝난 것으로 친다).
 * quizScores: 레슨별로 정답률(correct/total)이 더 높은 쪽을 남긴다.
 * currentLessonId: 지금 쓰는 기기(local)가 이어서 배우려던 레슨이 있으면 그게
 * 우선이다. 방금 만든 새 기기처럼 local이 아직 아무 것도 모르면(null) 원격
 * 값으로 대신한다.
 */
export function mergeProgress(local: ProgressState, remote: ProgressState): ProgressState {
  const completedLessons = Array.from(new Set([...local.completedLessons, ...remote.completedLessons]));

  const quizScores: Record<string, QuizScore> = { ...remote.quizScores };
  for (const [id, localScore] of Object.entries(local.quizScores)) {
    const remoteScore = quizScores[id];
    if (remoteScore === undefined || localScore.correct / localScore.total > remoteScore.correct / remoteScore.total) {
      quizScores[id] = localScore;
    }
  }

  return { completedLessons, quizScores, currentLessonId: local.currentLessonId ?? remote.currentLessonId };
}

export async function pullPlayer(name: string, pin: string): Promise<PullResult> {
  const supabase = await getSupabaseClient();
  if (supabase === null) return { kind: 'offline' };

  const { data, error } = await supabase.rpc('pull_player', { p_name: name, p_pin: pin });
  if (error !== null || data === null) return { kind: 'offline' };

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (row === undefined || row['found'] !== true) return { kind: 'not_found' };
  if (row['pin_ok'] !== true) return { kind: 'pin_mismatch' };

  const handedness = row['handedness'];
  return {
    kind: 'ok',
    handedness: isHandedness(handedness) ? handedness : 'right',
    progress: sanitizeRemoteProgress(row['progress']),
  };
}

export async function pushPlayer(
  name: string,
  pin: string,
  handedness: Handedness,
  progress: ProgressState,
): Promise<PushResult> {
  const supabase = await getSupabaseClient();
  if (supabase === null) return { ok: false, error: 'offline' };

  const { data, error } = await supabase.rpc('push_player', {
    p_name: name,
    p_pin: pin,
    p_handedness: handedness,
    p_progress: progress,
  });
  if (error !== null || data === null) return { ok: false, error: 'offline' };

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (row === undefined || row['ok'] !== true) {
    const reason = row?.['error'];
    return { ok: false, error: typeof reason === 'string' ? reason : 'unknown' };
  }
  return { ok: true };
}

/** 실패(설정 없음/이름·비밀번호 불일치)는 모두 false — 어느 쪽이 틀렸는지 구분해 알려주지 않는다 */
export async function verifyTeacher(name: string, password: string): Promise<boolean> {
  const supabase = await getSupabaseClient();
  if (supabase === null) return false;

  const { data, error } = await supabase.rpc('verify_teacher', { p_name: name, p_password: password });
  if (error !== null) return false;
  return data === true;
}
