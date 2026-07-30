import { describe, it, expect } from 'vitest';
import { buildScoreChoices } from './distractors';
import { Scorecard } from '../rules/Scorecard';

/** 1~9프레임을 1핀씩 채우는 굴림 (프레임당 2점) */
const NINE_OPEN = new Array<number>(18).fill(1);

describe('distractors — 정답은 Scorecard가 계산한다', () => {
  it('정답 보기가 정확히 하나이고 Scorecard의 누적 점수와 같다', () => {
    const rolls = [10, 4, 3, 5, 2];
    const q = buildScoreChoices(rolls, 1, 'B3-1');
    const expected = Scorecard.fromRolls(rolls).frames[0]!.cumulative;

    expect(q.answer).toBe(expected);
    const correct = q.choices.filter((c) => c.correct);
    expect(correct).toHaveLength(1);
    expect(correct[0]!.text).toBe(String(expected));
  });

  it('스페어 문항의 정답도 규칙과 일치한다', () => {
    const rolls = [6, 4, 5, 2];
    const q = buildScoreChoices(rolls, 1, 'B2-1');
    // 6+4 스페어 → 10 + 다음 1구(5) = 15
    expect(q.answer).toBe(15);
  });

  it('오픈 프레임 문항', () => {
    const q = buildScoreChoices([3, 4, 2, 2], 1, 'B1-1');
    expect(q.answer).toBe(7);
  });

  it('여러 프레임 뒤의 누적도 맞다', () => {
    const rolls = [1, 4, 4, 5, 6, 4, 5, 5, 10, 0, 1, 7, 3, 6, 4, 10, 2, 8, 6];
    const q = buildScoreChoices(rolls, 4, 'B4-1');
    expect(q.answer).toBe(49);
  });
});

describe('distractors — 보기 구성', () => {
  it('보기는 항상 4개', () => {
    const cases: [number[], number][] = [
      [[10, 4, 3, 5, 2], 1],
      [[6, 4, 5, 2], 1],
      [[3, 4, 2, 2], 1],
      [[10, 10, 10, 0, 0], 1],
      [[0, 0, 0, 0], 1],
      [[...NINE_OPEN, 10, 10, 10], 10],
      [[9, 0, 9, 0], 1],
    ];
    for (const [rolls, frame] of cases) {
      const q = buildScoreChoices(rolls, frame, `seed-${frame}`);
      expect(q.choices, `rolls=${rolls}`).toHaveLength(4);
    }
  });

  it('보기 값이 서로 중복되지 않는다', () => {
    const q = buildScoreChoices([10, 10, 10, 0, 0], 1, 'x');
    const texts = q.choices.map((c) => c.text);
    expect(new Set(texts).size).toBe(4);
  });

  it('오답에 음수가 없다', () => {
    const q = buildScoreChoices([0, 0, 0, 0], 1, 'zero');
    for (const c of q.choices) {
      expect(Number(c.text)).toBeGreaterThanOrEqual(0);
    }
  });

  it('모든 굴림이 0인 문항에서도 정답이 0이고 보기가 4개', () => {
    const q = buildScoreChoices([0, 0, 0, 0], 1, 'zero');
    expect(q.answer).toBe(0);
    expect(q.choices.filter((c) => c.correct)).toHaveLength(1);
  });
});

describe('distractors — 오답 피드백', () => {
  it('스트라이크 문항에는 "스페어 계산법과 혼동" 안내가 붙는다', () => {
    const q = buildScoreChoices([10, 4, 3, 1, 1], 1, 'strike');
    const feedbacks = q.choices.map((c) => c.feedback ?? '');
    expect(feedbacks.some((f) => f.includes('스페어를 계산하는 방법'))).toBe(true);
  });

  it('스페어 문항에는 "스트라이크 계산법과 혼동" 안내가 붙는다', () => {
    const q = buildScoreChoices([6, 4, 5, 2], 1, 'spare');
    const feedbacks = q.choices.map((c) => c.feedback ?? '');
    expect(feedbacks.some((f) => f.includes('스트라이크를 계산하는 방법'))).toBe(true);
  });

  it('보너스를 빼먹은 오답이 항상 후보에 든다', () => {
    const q = buildScoreChoices([10, 4, 3, 1, 1], 1, 'strike');
    // 보너스 없이 세면 10점
    const noBonus = q.choices.find((c) => c.text === '10');
    expect(noBonus).toBeDefined();
    expect(noBonus!.correct).toBe(false);
    expect(noBonus!.feedback).toContain('보너스');
  });

  it('정답 보기에는 오답 피드백이 없다', () => {
    const q = buildScoreChoices([10, 4, 3, 1, 1], 1, 'strike');
    const correct = q.choices.find((c) => c.correct)!;
    expect(correct.feedback).toBeUndefined();
  });
});

describe('distractors — 섞기 재현성', () => {
  it('같은 시드는 항상 같은 순서를 만든다 (교사가 미리 확인할 수 있어야 한다)', () => {
    const a = buildScoreChoices([10, 4, 3, 1, 1], 1, 'B3-q1');
    const b = buildScoreChoices([10, 4, 3, 1, 1], 1, 'B3-q1');
    expect(a.choices.map((c) => c.text)).toEqual(b.choices.map((c) => c.text));
  });

  it('다른 시드는 (대체로) 다른 순서를 만든다', () => {
    const orders = new Set<string>();
    for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6']) {
      orders.add(buildScoreChoices([10, 4, 3, 1, 1], 1, seed).choices.map((c) => c.text).join(','));
    }
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe('distractors — 잘못된 문항은 거부한다', () => {
  it('아직 확정되지 않는 프레임을 물으면 던진다', () => {
    // 스트라이크 직후라 1프레임 점수를 정할 수 없다
    expect(() => buildScoreChoices([10], 1, 'bad')).toThrow(/확정/);
  });

  it('없는 프레임 번호는 던진다', () => {
    expect(() => buildScoreChoices([3, 4], 11, 'bad')).toThrow();
  });
});
