/**
 * 진행률 저장/복원.
 *
 * 키에 스키마 버전을 넣는다. 커리큘럼이 바뀌어도 옛 저장 데이터가 앱을
 * 깨뜨리지 않아야 한다. 모르는 레슨 ID는 TutorialFlow가 걸러낸다.
 *
 * 공용 PC를 쓰는 교실을 전제로 clear()를 명시적으로 노출한다.
 */

import { emptyProgress, type ProgressState } from './TutorialFlow';

const STORAGE_KEY = 'bowling3d.progress.v1';

function sanitize(raw: unknown): ProgressState {
  if (typeof raw !== 'object' || raw === null) return emptyProgress();
  const o = raw as Record<string, unknown>;

  const completed = Array.isArray(o['completedLessons'])
    ? o['completedLessons'].filter((v): v is string => typeof v === 'string')
    : [];

  const scores: ProgressState['quizScores'] = {};
  const rawScores = o['quizScores'];
  if (typeof rawScores === 'object' && rawScores !== null) {
    for (const [id, value] of Object.entries(rawScores as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue;
      const v = value as Record<string, unknown>;
      const correct = v['correct'];
      const total = v['total'];
      if (typeof correct === 'number' && typeof total === 'number' && total > 0) {
        scores[id] = { correct, total };
      }
    }
  }

  const current = o['currentLessonId'];
  return {
    completedLessons: completed,
    quizScores: scores,
    currentLessonId: typeof current === 'string' ? current : null,
  };
}

export const Progress = {
  load(): ProgressState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw === null ? emptyProgress() : sanitize(JSON.parse(raw));
    } catch {
      // 저장 데이터가 깨졌거나 사생활 보호 모드다. 처음부터 시작한다.
      return emptyProgress();
    }
  },

  save(state: ProgressState): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* 저장 실패해도 수업은 계속되어야 한다 */
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* 무시 */
    }
  },
};
