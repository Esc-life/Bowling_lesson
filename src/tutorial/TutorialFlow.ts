/**
 * 튜토리얼 진행 상태. 순수 로직 — DOM도 물리도 모른다.
 *
 * 영역을 강제로 잠그지 않는다. 교사가 수업에서 필요한 영역만 골라 쓸 수
 * 있어야 하기 때문이다. 권장 순서는 안내만 한다.
 */

import { CURRICULUM, allLessons, findArea, findLesson } from './curriculum';
import type { Area, AreaId, Lesson } from './types';

export type QuizScore = {
  correct: number;
  total: number;
};

export type ProgressState = {
  completedLessons: string[];
  /** 레슨 ID → 퀴즈 결과 */
  quizScores: Record<string, QuizScore>;
  currentLessonId: string | null;
};

export type AreaProgress = {
  area: Area;
  completed: number;
  total: number;
  ratio: number;
  /** 권장 선행 영역을 아직 안 끝냈는가 (안내용, 진입은 막지 않는다) */
  recommendedNotDone: AreaId[];
};

export function emptyProgress(): ProgressState {
  return { completedLessons: [], quizScores: {}, currentLessonId: null };
}

export class TutorialFlow {
  private completed: Set<string>;
  private scores: Map<string, QuizScore>;
  private currentId: string | null;

  constructor(state: ProgressState = emptyProgress()) {
    // 커리큘럼에 없는 레슨 ID는 무시한다. 레슨을 지우거나 이름을 바꿔도
    // 옛 저장 데이터 때문에 앱이 깨지지 않아야 한다.
    const known = new Set(allLessons().map((l) => l.lessonId));
    this.completed = new Set(state.completedLessons.filter((id) => known.has(id)));
    this.scores = new Map(
      Object.entries(state.quizScores).filter(([id]) => known.has(id)),
    );
    this.currentId = state.currentLessonId !== null && known.has(state.currentLessonId)
      ? state.currentLessonId
      : null;
  }

  toState(): ProgressState {
    return {
      completedLessons: [...this.completed],
      quizScores: Object.fromEntries(this.scores),
      currentLessonId: this.currentId,
    };
  }

  get areas(): readonly Area[] {
    return CURRICULUM;
  }

  isCompleted(lessonId: string): boolean {
    return this.completed.has(lessonId);
  }

  quizScore(lessonId: string): QuizScore | null {
    return this.scores.get(lessonId) ?? null;
  }

  /** 레슨을 완료로 기록한다 */
  complete(lessonId: string, quizScore?: QuizScore): void {
    if (findLesson(lessonId) === null) {
      throw new Error(`없는 레슨입니다: ${lessonId}`);
    }
    this.completed.add(lessonId);
    if (quizScore !== undefined) this.scores.set(lessonId, quizScore);
  }

  setCurrent(lessonId: string | null): void {
    if (lessonId !== null && findLesson(lessonId) === null) {
      throw new Error(`없는 레슨입니다: ${lessonId}`);
    }
    this.currentId = lessonId;
  }

  get currentLessonId(): string | null {
    return this.currentId;
  }

  lesson(lessonId: string): Lesson | null {
    const found = findLesson(lessonId);
    return found === null ? null : found.area.lessons[found.lessonIndex]!;
  }

  /** 같은 영역의 다음 레슨. 영역의 마지막이면 null */
  nextInArea(lessonId: string): string | null {
    const found = findLesson(lessonId);
    if (found === null) return null;
    const next = found.area.lessons[found.lessonIndex + 1];
    return next?.id ?? null;
  }

  /** 커리큘럼 전체 순서에서 다음 레슨 (영역을 넘어간다) */
  nextOverall(lessonId: string): string | null {
    const all = allLessons();
    const index = all.findIndex((l) => l.lessonId === lessonId);
    if (index < 0) return null;
    return all[index + 1]?.lessonId ?? null;
  }

  /** 아직 안 한 첫 레슨 — '이어서 하기' 버튼용 */
  firstIncomplete(): string | null {
    for (const { lessonId } of allLessons()) {
      if (!this.completed.has(lessonId)) return lessonId;
    }
    return null;
  }

  areaProgress(areaId: AreaId): AreaProgress {
    const area = findArea(areaId);
    if (area === null) throw new Error(`없는 영역입니다: ${areaId}`);

    const total = area.lessons.length;
    const completed = area.lessons.filter((l) => this.completed.has(l.id)).length;
    const recommendedNotDone = (area.recommendedAfter ?? []).filter(
      (id) => this.areaProgress0(id) < 1,
    );

    return { area, completed, total, ratio: total === 0 ? 1 : completed / total, recommendedNotDone };
  }

  /** 재귀를 피하기 위한 내부용 비율 계산 */
  private areaProgress0(areaId: AreaId): number {
    const area = findArea(areaId);
    if (area === null) return 1;
    if (area.lessons.length === 0) return 1;
    const done = area.lessons.filter((l) => this.completed.has(l.id)).length;
    return done / area.lessons.length;
  }

  allAreaProgress(): AreaProgress[] {
    return CURRICULUM.map((a) => this.areaProgress(a.id));
  }

  /** 전체 진행률 (0~1) */
  get overallRatio(): number {
    const all = allLessons();
    if (all.length === 0) return 1;
    return this.completed.size / all.length;
  }

  get isAllComplete(): boolean {
    return this.completed.size >= allLessons().length;
  }

  reset(): void {
    this.completed.clear();
    this.scores.clear();
    this.currentId = null;
  }
}
