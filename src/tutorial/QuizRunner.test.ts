import { describe, it, expect } from 'vitest';
import { QuizRunner, prepareQuestion } from './QuizRunner';
import type { Quiz } from './types';

const SIMPLE: Quiz = {
  kind: 'quiz',
  passRatio: 0.5,
  questions: [
    {
      kind: 'choice',
      prompt: '1번 핀은 어디에 있나요?',
      choices: [
        { text: '맨 앞', correct: true },
        { text: '맨 뒤', correct: false, feedback: '맨 뒤는 7~10번이에요.' },
        { text: '왼쪽 끝', correct: false, feedback: '왼쪽 끝은 7번이에요.' },
        { text: '오른쪽 끝', correct: false, feedback: '오른쪽 끝은 10번이에요.' },
      ],
    },
    {
      kind: 'choice',
      prompt: '한 게임은 몇 프레임인가요?',
      choices: [
        { text: '10', correct: true },
        { text: '5', correct: false, feedback: '더 많아요.' },
        { text: '9', correct: false, feedback: '하나 더 있어요.' },
        { text: '12', correct: false, feedback: '더 적어요.' },
      ],
    },
  ],
};

/** 첫 보기부터 정답을 찾아 고르는 도우미 */
function answerCorrectly(r: QuizRunner) {
  const idx = r.current.choices.findIndex((c) => c.correct);
  return r.answer(idx);
}
function answerWrong(r: QuizRunner) {
  const idx = r.current.choices.findIndex((c) => !c.correct);
  return r.answer(idx);
}

describe('QuizRunner — 진행', () => {
  it('문항 수와 번호를 센다', () => {
    const r = new QuizRunner(SIMPLE, 'test');
    expect(r.total).toBe(2);
    expect(r.questionNumber).toBe(1);
    expect(r.isFinished).toBe(false);
  });

  it('정답을 고르면 점수가 오른다', () => {
    const r = new QuizRunner(SIMPLE, 'test');
    const res = answerCorrectly(r);
    expect(res.correct).toBe(true);
    expect(res.feedback).toBeNull();
    expect(r.correct).toBe(1);
  });

  it('오답을 고르면 그 보기의 안내가 나온다', () => {
    const r = new QuizRunner(SIMPLE, 'test');
    const res = answerWrong(r);
    expect(res.correct).toBe(false);
    expect(res.feedback).toBeTruthy();
    expect(res.correctText).toBe('맨 앞');
    expect(r.correct).toBe(0);
  });

  it('마지막 문항을 알려준다', () => {
    const r = new QuizRunner(SIMPLE, 'test');
    expect(answerCorrectly(r).isLast).toBe(false);
    r.next();
    expect(answerCorrectly(r).isLast).toBe(true);
  });

  it('끝까지 풀면 종료된다', () => {
    const r = new QuizRunner(SIMPLE, 'test');
    answerCorrectly(r); r.next();
    answerCorrectly(r); r.next();
    expect(r.isFinished).toBe(true);
    expect(r.ratio).toBe(1);
  });

  it('같은 문항을 두 번 답할 수 없다', () => {
    const r = new QuizRunner(SIMPLE, 'test');
    answerCorrectly(r);
    expect(() => answerCorrectly(r)).toThrow(/이미 답한/);
  });

  it('답하지 않고 다음으로 갈 수 없다', () => {
    const r = new QuizRunner(SIMPLE, 'test');
    expect(() => r.next()).toThrow(/답하지 않았/);
  });

  it('끝난 뒤에는 답할 수 없다', () => {
    const r = new QuizRunner(SIMPLE, 'test');
    answerCorrectly(r); r.next();
    answerCorrectly(r); r.next();
    expect(() => r.answer(0)).toThrow(/끝났/);
  });

  it('없는 보기 번호는 거부한다', () => {
    const r = new QuizRunner(SIMPLE, 'test');
    expect(() => r.answer(99)).toThrow(/없는 보기/);
  });

  it('문항이 없는 퀴즈는 만들 수 없다', () => {
    expect(() => new QuizRunner({ kind: 'quiz', passRatio: 0.5, questions: [] }, 'x')).toThrow();
  });
});

describe('QuizRunner — 통과 기준', () => {
  it('기준을 넘기면 통과', () => {
    const r = new QuizRunner(SIMPLE, 'test');
    answerCorrectly(r); r.next();
    answerWrong(r); r.next();
    expect(r.ratio).toBe(0.5);
    expect(r.passed).toBe(true); // passRatio 0.5
  });

  it('기준에 못 미치면 통과가 아니지만 진행은 끝난다', () => {
    const r = new QuizRunner(SIMPLE, 'test');
    answerWrong(r); r.next();
    answerWrong(r); r.next();
    expect(r.passed).toBe(false);
    expect(r.isFinished).toBe(true);
  });

  it('결과 문구가 격려 톤이다', () => {
    const all = new QuizRunner(SIMPLE, 'test');
    answerCorrectly(all); all.next();
    answerCorrectly(all); all.next();
    expect(all.summary).toContain('모두 맞혔어요');

    const some = new QuizRunner(SIMPLE, 'test');
    answerWrong(some); some.next();
    answerWrong(some); some.next();
    expect(some.summary).toContain('다시 볼까요');
  });
});

describe('QuizRunner — 점수 문항 준비', () => {
  it('scoreChoice 문항은 보기가 만들어지고 점수판 다이어그램이 붙는다', () => {
    const prepared = prepareQuestion(
      { kind: 'scoreChoice', prompt: '몇 점?', rolls: [10, 4, 3, 1, 1], askFrame: 1 },
      'B3-0',
    );
    expect(prepared.choices).toHaveLength(4);
    expect(prepared.choices.filter((c) => c.correct)).toHaveLength(1);
    expect(prepared.diagram?.kind).toBe('scorecard');
    if (prepared.diagram?.kind === 'scorecard') {
      // 물어보는 프레임은 빈칸으로 보여야 답이 그냥 보이지 않는다
      expect(prepared.diagram.blankFrame).toBe(1);
    }
  });

  it('점수 문항이 섞인 퀴즈도 끝까지 풀 수 있다', () => {
    const quiz: Quiz = {
      kind: 'quiz',
      passRatio: 0.6,
      questions: [
        { kind: 'scoreChoice', prompt: '몇 점?', rolls: [6, 4, 5, 2], askFrame: 1 },
        { kind: 'scoreChoice', prompt: '몇 점?', rolls: [10, 4, 3, 1, 1], askFrame: 1 },
      ],
    };
    const r = new QuizRunner(quiz, 'B2');
    answerCorrectly(r); r.next();
    answerCorrectly(r); r.next();
    expect(r.isFinished).toBe(true);
    expect(r.correct).toBe(2);
  });

  it('같은 시드로 만들면 보기 순서가 같다', () => {
    const a = new QuizRunner({ kind: 'quiz', passRatio: 0.5, questions: [
      { kind: 'scoreChoice', prompt: 'q', rolls: [10, 4, 3, 1, 1], askFrame: 1 },
    ] }, 'B3');
    const b = new QuizRunner({ kind: 'quiz', passRatio: 0.5, questions: [
      { kind: 'scoreChoice', prompt: 'q', rolls: [10, 4, 3, 1, 1], askFrame: 1 },
    ] }, 'B3');
    expect(a.current.choices.map((c) => c.text)).toEqual(b.current.choices.map((c) => c.text));
  });
});
