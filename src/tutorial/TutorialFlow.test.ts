import { describe, it, expect } from 'vitest';
import { TutorialFlow, emptyProgress, type ProgressState } from './TutorialFlow';
import { CURRICULUM, allLessons, findLesson } from './curriculum';
import { buildScoreChoices } from './distractors';
import { ALL_PINS, forHand, type PinNumber } from '../rules/pinLayout';
import type { Block, Check, Lesson } from './types';

// ---------------------------------------------------------------------------
// 커리큘럼 정합성 — 18개 레슨을 눈으로 검수하는 것은 실패한다.
// 구조적 오류와 글쓰기 규칙 위반을 기계가 잡는다.
// ---------------------------------------------------------------------------

/** 본문 블록의 글자 수 (초등용 150자 제한 검사) */
function bodyLength(body: Block[]): number {
  let n = 0;
  for (const b of body) {
    if (b.kind === 'text' || b.kind === 'callout') n += b.text.length;
    else if (b.kind === 'bullets') n += b.items.reduce((s, i) => s + i.length, 0);
  }
  return n;
}

function everyLesson(): Lesson[] {
  return CURRICULUM.flatMap((a) => a.lessons);
}

describe('커리큘럼 정합성 — 구조', () => {
  it('레슨 ID가 유일하다', () => {
    const ids = everyLesson().map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('레슨 ID는 영역 문자로 시작한다 (딥링크에서 헷갈리지 않게)', () => {
    for (const area of CURRICULUM) {
      for (const lesson of area.lessons) {
        expect(lesson.id.startsWith(area.id), `${lesson.id} in area ${area.id}`).toBe(true);
      }
    }
  });

  it('권장 선행 영역은 실제로 존재하는 영역만 가리킨다', () => {
    const areaIds = new Set(CURRICULUM.map((a) => a.id));
    for (const area of CURRICULUM) {
      for (const req of area.recommendedAfter ?? []) {
        expect(areaIds.has(req), `${area.id} → ${req}`).toBe(true);
        expect(req).not.toBe(area.id);
      }
    }
  });

  it('모든 영역에 레슨이 하나 이상 있다', () => {
    for (const area of CURRICULUM) {
      expect(area.lessons.length, area.id).toBeGreaterThan(0);
    }
  });

  it('모든 레슨에 본문이 있고 예상 시간이 붙어 있다', () => {
    for (const lesson of everyLesson()) {
      expect(lesson.body.length, lesson.id).toBeGreaterThan(0);
      expect(lesson.estimatedMinutes, lesson.id).toBeGreaterThan(0);
    }
  });

  it('계획대로 18개 레슨이다', () => {
    expect(everyLesson()).toHaveLength(18);
  });
});

describe('커리큘럼 정합성 — 초등용 글쓰기 규칙', () => {
  it('본문은 150자를 넘지 않는다', () => {
    for (const lesson of everyLesson()) {
      expect(bodyLength(lesson.body), `${lesson.id}: ${bodyLength(lesson.body)}자`).toBeLessThanOrEqual(150);
    }
  });

  it('불릿은 3개를 넘지 않는다', () => {
    for (const lesson of everyLesson()) {
      for (const block of lesson.body) {
        if (block.kind === 'bullets') {
          expect(block.items.length, lesson.id).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it('어려운 한자어를 쓰지 않는다', () => {
    const banned = ['전도', '기립', '침범', '정렬', '명중', '투구자', '회전축', '마찰력'];
    for (const lesson of everyLesson()) {
      const text = JSON.stringify(lesson);
      for (const word of banned) {
        expect(text.includes(word), `${lesson.id}에 '${word}'`).toBe(false);
      }
    }
  });

  it('영역 C의 모든 레슨에 "실제 볼링장" 안내가 붙어 있다', () => {
    // 마우스 조작 연습으로 오인되면 교육 자료로서 신뢰를 잃는다
    const areaC = CURRICULUM.find((a) => a.id === 'C')!;
    for (const lesson of areaC.lessons) {
      const hasNotice = lesson.body.some((b) => b.kind === 'realWorldNotice');
      expect(hasNotice, lesson.id).toBe(true);
    }
  });

  it('영역 C의 완료 조건은 드릴이 아니다 (게임 조작 연습이 아니므로)', () => {
    const areaC = CURRICULUM.find((a) => a.id === 'C')!;
    for (const lesson of areaC.lessons) {
      expect(lesson.check?.kind, lesson.id).not.toBe('drill');
    }
  });
});

describe('커리큘럼 정합성 — 드릴', () => {
  function drills(): { id: string; check: Check & { kind: 'drill' } }[] {
    return everyLesson()
      .filter((l) => l.check?.kind === 'drill')
      .map((l) => ({ id: l.id, check: l.check as Check & { kind: 'drill' } }));
  }

  it('세우는 핀은 1~10 범위이고 중복이 없다', () => {
    for (const { id, check } of drills()) {
      const pins = check.setup.standingPins;
      expect(pins.length, id).toBeGreaterThan(0);
      expect(new Set(pins).size, id).toBe(pins.length);
      for (const p of pins) {
        expect(ALL_PINS.includes(p), `${id}: ${p}번`).toBe(true);
      }
    }
  });

  it('목표 핀은 세워 둔 핀의 부분집합이다', () => {
    for (const { id, check } of drills()) {
      if (check.goal.kind !== 'knockPins') continue;
      const standing = new Set<PinNumber>(check.setup.standingPins);
      for (const p of check.goal.pins) {
        expect(standing.has(p), `${id}: 목표 ${p}번이 세워지지 않는다`).toBe(true);
      }
    }
  });

  it('스트라이크 목표는 핀 10개를 세운 상태에서만 쓴다', () => {
    for (const { id, check } of drills()) {
      if (check.goal.kind !== 'strike') continue;
      expect(check.setup.standingPins.length, id).toBe(10);
    }
  });

  it('시도 횟수가 넉넉하다 (실패해도 진행은 막지 않지만 좌절은 줄인다)', () => {
    for (const { id, check } of drills()) {
      expect(check.attempts, id).toBeGreaterThanOrEqual(5);
    }
  });

  it('왼손 학생용으로 미러링해도 핀 개수와 유효성이 유지된다', () => {
    for (const { id, check } of drills()) {
      const mirrored = forHand(check.setup.standingPins, 'left');
      expect(mirrored.length, id).toBe(check.setup.standingPins.length);
      expect(new Set(mirrored).size, id).toBe(mirrored.length);
      for (const p of mirrored) {
        expect(ALL_PINS.includes(p), `${id}: 미러 후 ${p}번`).toBe(true);
      }
    }
  });
});

describe('커리큘럼 정합성 — 퀴즈', () => {
  it('직접 쓴 보기 문항은 정답이 정확히 하나이고 보기가 4개다', () => {
    for (const lesson of everyLesson()) {
      if (lesson.check?.kind !== 'quiz') continue;
      for (const [i, q] of lesson.check.questions.entries()) {
        if (q.kind !== 'choice') continue;
        expect(q.choices.length, `${lesson.id} 문항${i + 1}`).toBe(4);
        expect(q.choices.filter((c) => c.correct).length, `${lesson.id} 문항${i + 1}`).toBe(1);
      }
    }
  });

  it('오답에는 왜 틀렸는지 안내가 붙어 있다', () => {
    for (const lesson of everyLesson()) {
      if (lesson.check?.kind !== 'quiz') continue;
      for (const q of lesson.check.questions) {
        if (q.kind !== 'choice') continue;
        for (const c of q.choices) {
          if (c.correct) continue;
          expect(c.feedback, `${lesson.id}: "${c.text}"`).toBeTruthy();
        }
      }
    }
  });

  it('점수 문항은 모두 실제로 보기를 만들 수 있다 (확정 가능한 프레임)', () => {
    for (const lesson of everyLesson()) {
      if (lesson.check?.kind !== 'quiz') continue;
      for (const [i, q] of lesson.check.questions.entries()) {
        if (q.kind !== 'scoreChoice') continue;
        expect(
          () => buildScoreChoices(q.rolls, q.askFrame, `${lesson.id}-${i}`),
          `${lesson.id} 문항${i + 1}`,
        ).not.toThrow();
      }
    }
  });

  it('점수 문항의 굴림은 볼링 규칙상 가능한 조합이다', () => {
    for (const lesson of everyLesson()) {
      if (lesson.check?.kind !== 'quiz') continue;
      for (const q of lesson.check.questions) {
        if (q.kind !== 'scoreChoice') continue;
        // Scorecard가 잘못된 굴림을 거부하므로, 생성이 되면 유효한 조합이다
        expect(() => buildScoreChoices(q.rolls, q.askFrame, 'v')).not.toThrow();
      }
    }
  });

  it('통과 기준은 0과 1 사이다', () => {
    for (const lesson of everyLesson()) {
      if (lesson.check?.kind !== 'quiz') continue;
      expect(lesson.check.passRatio).toBeGreaterThan(0);
      expect(lesson.check.passRatio).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// 진행 상태
// ---------------------------------------------------------------------------

describe('TutorialFlow — 진행', () => {
  it('처음에는 아무것도 완료되지 않았다', () => {
    const f = new TutorialFlow();
    expect(f.overallRatio).toBe(0);
    expect(f.isAllComplete).toBe(false);
    expect(f.firstIncomplete()).toBe('A1');
  });

  it('레슨을 완료하면 진행률이 오른다', () => {
    const f = new TutorialFlow();
    f.complete('A1');
    expect(f.isCompleted('A1')).toBe(true);
    expect(f.overallRatio).toBeCloseTo(1 / 18, 6);
    expect(f.firstIncomplete()).toBe('A2');
  });

  it('영역 진행률을 센다', () => {
    const f = new TutorialFlow();
    f.complete('A1');
    const a = f.areaProgress('A');
    expect(a.completed).toBe(1);
    expect(a.total).toBe(3);
    expect(a.ratio).toBeCloseTo(1 / 3, 6);
  });

  it('전부 완료하면 isAllComplete가 참', () => {
    const f = new TutorialFlow();
    for (const { lessonId } of allLessons()) f.complete(lessonId);
    expect(f.isAllComplete).toBe(true);
    expect(f.firstIncomplete()).toBeNull();
    expect(f.overallRatio).toBe(1);
  });

  it('같은 레슨을 두 번 완료해도 한 번으로 센다', () => {
    const f = new TutorialFlow();
    f.complete('A1');
    f.complete('A1');
    expect(f.areaProgress('A').completed).toBe(1);
  });

  it('영역 안의 다음 레슨과 전체 다음 레슨을 구분한다', () => {
    const f = new TutorialFlow();
    expect(f.nextInArea('A1')).toBe('A2');
    // A영역의 마지막 레슨
    expect(f.nextInArea('A3')).toBeNull();
    expect(f.nextOverall('A3')).toBe('B1');
  });

  it('마지막 레슨 다음은 없다', () => {
    const f = new TutorialFlow();
    const last = allLessons().at(-1)!.lessonId;
    expect(f.nextOverall(last)).toBeNull();
  });

  it('권장 선행 영역을 안 끝내면 안내에 나오지만 진입은 막지 않는다', () => {
    const f = new TutorialFlow();
    const b = f.areaProgress('B');
    expect(b.recommendedNotDone).toContain('A');
    // 잠금이 아니므로 B의 레슨을 바로 완료할 수 있다
    expect(() => f.complete('B1')).not.toThrow();
  });

  it('선행 영역을 끝내면 안내가 사라진다', () => {
    const f = new TutorialFlow();
    for (const l of ['A1', 'A2', 'A3']) f.complete(l);
    expect(f.areaProgress('B').recommendedNotDone).toHaveLength(0);
  });

  it('없는 레슨은 거부한다', () => {
    const f = new TutorialFlow();
    expect(() => f.complete('Z9')).toThrow();
    expect(() => f.setCurrent('Z9')).toThrow();
  });

  it('퀴즈 점수를 기록하고 되읽을 수 있다', () => {
    const f = new TutorialFlow();
    f.complete('A2', { correct: 2, total: 3 });
    expect(f.quizScore('A2')).toEqual({ correct: 2, total: 3 });
    expect(f.quizScore('A1')).toBeNull();
  });

  it('리셋하면 전부 지워진다', () => {
    const f = new TutorialFlow();
    f.complete('A1', { correct: 1, total: 1 });
    f.setCurrent('A2');
    f.reset();
    expect(f.overallRatio).toBe(0);
    expect(f.currentLessonId).toBeNull();
    expect(f.quizScore('A1')).toBeNull();
  });
});

describe('TutorialFlow — 저장 데이터 호환', () => {
  it('상태를 저장하고 그대로 복원한다', () => {
    const f = new TutorialFlow();
    f.complete('A1');
    f.complete('A2', { correct: 3, total: 3 });
    f.setCurrent('A3');

    const restored = new TutorialFlow(f.toState());
    expect(restored.isCompleted('A1')).toBe(true);
    expect(restored.quizScore('A2')).toEqual({ correct: 3, total: 3 });
    expect(restored.currentLessonId).toBe('A3');
  });

  it('모르는 레슨 ID가 저장되어 있어도 깨지지 않는다', () => {
    // 커리큘럼에서 레슨을 지우거나 이름을 바꾼 뒤에도 앱이 살아야 한다
    const stale: ProgressState = {
      completedLessons: ['A1', 'OLD_LESSON', 'Z99'],
      quizScores: { OLD_LESSON: { correct: 1, total: 1 }, A1: { correct: 2, total: 2 } },
      currentLessonId: 'GONE',
    };
    const f = new TutorialFlow(stale);
    expect(f.isCompleted('A1')).toBe(true);
    expect(f.isCompleted('OLD_LESSON')).toBe(false);
    expect(f.currentLessonId).toBeNull();
    expect(f.quizScore('A1')).toEqual({ correct: 2, total: 2 });
    // 진행률이 1을 넘지 않는다
    expect(f.overallRatio).toBeLessThanOrEqual(1);
  });

  it('빈 상태로도 만들 수 있다', () => {
    expect(() => new TutorialFlow(emptyProgress())).not.toThrow();
  });
});

describe('커리큘럼 — 딥링크', () => {
  it('모든 레슨을 ID로 찾을 수 있다 (?lesson=B3)', () => {
    for (const { lessonId } of allLessons()) {
      expect(findLesson(lessonId), lessonId).not.toBeNull();
    }
  });

  it('없는 ID는 null', () => {
    expect(findLesson('nope')).toBeNull();
  });
});
