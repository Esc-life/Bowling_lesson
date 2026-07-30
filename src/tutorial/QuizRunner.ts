/**
 * 4지선다 채점. 순수 로직 — DOM을 모른다.
 *
 * 점수 문항의 보기는 distractors가 만들고, 정답은 Scorecard가 계산한다.
 * 여기서는 "무엇을 골랐는지"와 "왜 틀렸는지"만 다룬다.
 *
 * 교육용이므로 오답이어도 다음 문항으로 넘어갈 수 있다. 틀린 채로
 * 막아 세우면 아이가 거기서 그만둔다.
 */

import { buildScoreChoices } from './distractors';
import type { Choice, DiagramSpec, Question, Quiz } from './types';

export type PreparedQuestion = {
  prompt: string;
  choices: Choice[];
  diagram?: DiagramSpec;
};

export type AnswerResult = {
  correct: boolean;
  /** 고른 보기에 붙은 안내 (정답이면 null) */
  feedback: string | null;
  /** 정답 보기의 표시 문자열 */
  correctText: string;
  isLast: boolean;
};

/** 문항을 화면에 낼 수 있는 형태로 바꾼다 */
export function prepareQuestion(q: Question, seedKey: string): PreparedQuestion {
  if (q.kind === 'choice') {
    return q.diagram === undefined
      ? { prompt: q.prompt, choices: q.choices }
      : { prompt: q.prompt, choices: q.choices, diagram: q.diagram };
  }
  const built = buildScoreChoices(q.rolls, q.askFrame, seedKey);
  return {
    prompt: q.prompt,
    choices: built.choices,
    diagram: { kind: 'scorecard', rolls: [...q.rolls], blankFrame: q.askFrame },
  };
}

export class QuizRunner {
  private index = 0;
  private correctCount = 0;
  private answered = false;
  private readonly prepared: PreparedQuestion[];

  constructor(
    private readonly quiz: Quiz,
    /** 시드 기준값 — 레슨 ID를 넣으면 순서가 항상 같아 교사가 미리 볼 수 있다 */
    seedBase: string,
  ) {
    if (quiz.questions.length === 0) {
      throw new Error('문항이 없는 퀴즈입니다.');
    }
    this.prepared = quiz.questions.map((q, i) => prepareQuestion(q, `${seedBase}-${i}`));
  }

  get total(): number {
    return this.prepared.length;
  }

  get questionNumber(): number {
    return Math.min(this.index + 1, this.total);
  }

  get correct(): number {
    return this.correctCount;
  }

  get current(): PreparedQuestion {
    const q = this.prepared[Math.min(this.index, this.total - 1)];
    if (q === undefined) throw new Error('문항을 찾을 수 없습니다.');
    return q;
  }

  get isFinished(): boolean {
    return this.index >= this.total;
  }

  /** 지금 문항에 이미 답했는가 (같은 문항을 두 번 세지 않기 위해) */
  get hasAnswered(): boolean {
    return this.answered;
  }

  /** 보기를 고른다 */
  answer(choiceIndex: number): AnswerResult {
    if (this.isFinished) throw new Error('퀴즈가 이미 끝났습니다.');
    if (this.answered) throw new Error('이미 답한 문항입니다.');

    const question = this.current;
    const picked = question.choices[choiceIndex];
    if (picked === undefined) {
      throw new Error(`없는 보기입니다: ${choiceIndex}`);
    }

    this.answered = true;
    if (picked.correct) this.correctCount++;

    const correctChoice = question.choices.find((c) => c.correct);
    return {
      correct: picked.correct,
      feedback: picked.correct ? null : (picked.feedback ?? null),
      correctText: correctChoice?.text ?? '',
      isLast: this.index >= this.total - 1,
    };
  }

  /** 다음 문항으로. 마지막이었으면 퀴즈가 끝난다 */
  next(): void {
    if (!this.answered) throw new Error('아직 답하지 않았습니다.');
    this.index++;
    this.answered = false;
  }

  get ratio(): number {
    return this.total === 0 ? 1 : this.correctCount / this.total;
  }

  /** 통과 기준을 넘겼는가. 못 넘겨도 진행은 막지 않는다 */
  get passed(): boolean {
    return this.ratio >= this.quiz.passRatio;
  }

  /** 결과 요약 문구 (초등용 격려 톤) */
  get summary(): string {
    if (this.correctCount === this.total) return `모두 맞혔어요! ${this.total}개 중 ${this.total}개`;
    if (this.passed) return `잘했어요! ${this.total}개 중 ${this.correctCount}개 맞혔어요`;
    return `${this.total}개 중 ${this.correctCount}개 맞혔어요. 다시 볼까요?`;
  }
}
