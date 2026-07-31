/**
 * 레슨 패널 — 본문 + 그림 + 완료 조건(퀴즈/드릴/관찰)을 한 화면에.
 *
 * 패널은 "지금 레슨 하나를 보여주는 일"만 한다. 진행률 저장, 다음 레슨
 * 결정, 게임(드릴) 조작은 전부 콜백으로 밖(TutorialUI)에 맡긴다.
 *
 * 드릴과 궤적 관찰은 3D 화면이 보여야 하므로 패널이 스스로 숨고,
 * 끝나면 컨트롤러가 결과와 함께 다시 연다.
 */

import type { QuizScore } from '../tutorial/TutorialFlow';
import { QuizRunner } from '../tutorial/QuizRunner';
import { renderDiagram } from '../tutorial/diagrams';
import { linkTerms } from '../tutorial/glossary';
import type { Block, Drill, Lesson } from '../tutorial/types';
import type { Handedness } from '../rules/pinLayout';
import { GlossaryPopover } from './GlossaryPopover';

export type PanelCallbacks = {
  /** 목록(영역 메뉴)으로 */
  onMenu: () => void;
  /** 레슨을 덮고 홈으로 (게임 화면으로 빠져나가지 않는다) */
  onClose: () => void;
  /** 다음 레슨으로 (컨트롤러가 순서를 안다) */
  onNext: () => void;
  /** 레슨 완료를 기록해 달라 */
  onComplete: (quizScore?: QuizScore) => void;
  onStartDrill: (drill: Drill) => void;
  onStartTrajectoryObserve: (times: number) => void;
};

export type LessonContext = {
  areaTitle: string;
  completed: boolean;
  hasNext: boolean;
  /** 방금 끝난 드릴의 결과 (드릴에서 돌아온 직후에만) */
  drillResult?: { success: boolean; message: string };
};

export class TutorialPanel {
  readonly element: HTMLElement;

  private readonly panelEl: HTMLElement;
  private readonly glossary: GlossaryPopover;
  private lesson: Lesson | null = null;
  private ctx: LessonContext | null = null;
  private quiz: QuizRunner | null = null;

  constructor(
    private hand: Handedness,
    private readonly callbacks: PanelCallbacks,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'overlay tutorial-overlay';
    this.element.hidden = true;

    this.panelEl = document.createElement('div');
    this.panelEl.className = 'panel tutorial-panel';
    this.element.appendChild(this.panelEl);

    // 팝업은 패널이 아니라 오버레이에 붙인다 — 패널 innerHTML을 갈아끼워도
    // 위임 리스너와 팝업 요소가 살아남는다.
    this.glossary = new GlossaryPopover(this.element);
  }

  setHand(hand: Handedness): void {
    this.hand = hand;
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  hide(): void {
    this.element.hidden = true;
    this.glossary.hide();
  }

  /** 레슨 화면을 그린다 */
  showLesson(lesson: Lesson, ctx: LessonContext): void {
    this.lesson = lesson;
    this.ctx = ctx;
    this.quiz = null;
    this.element.hidden = false;
    this.renderLesson();
  }

  // -------------------------------------------------------------------------
  // 레슨 보기
  // -------------------------------------------------------------------------

  private renderLesson(): void {
    const lesson = this.lesson;
    const ctx = this.ctx;
    if (lesson === null || ctx === null) return;

    this.glossary.hide();
    this.panelEl.innerHTML = `
      ${this.headHtml(`${lesson.id} · ${ctx.areaTitle}`)}
      <h1 class="tut-title">${lesson.title}</h1>
      <div class="tut-body"></div>
      <div class="tut-check"></div>
      <div class="tut-foot"></div>
    `;
    this.wireHead();

    const body = this.must('.tut-body');
    for (const block of lesson.body) body.appendChild(this.renderBlock(block));

    if (lesson.diagram !== undefined) {
      body.appendChild(
        renderDiagram(lesson.diagram, this.hand, {
          onApproachComplete: () => this.onApproachPlayed(),
        }),
      );
    }

    this.renderCheck();
    this.renderFoot();
  }

  private renderBlock(block: Block): HTMLElement {
    switch (block.kind) {
      case 'text': {
        const p = document.createElement('p');
        p.innerHTML = linkTerms(block.text);
        return p;
      }
      case 'bullets': {
        const ul = document.createElement('ul');
        for (const item of block.items) {
          const li = document.createElement('li');
          li.innerHTML = linkTerms(item);
          ul.appendChild(li);
        }
        return ul;
      }
      case 'callout': {
        const div = document.createElement('div');
        div.className = 'tut-callout';
        div.innerHTML = `💡 ${linkTerms(block.text)}`;
        return div;
      }
      case 'realWorldNotice': {
        const div = document.createElement('div');
        div.className = 'tut-notice';
        div.textContent =
          '🎳 이건 진짜 볼링장에서 하는 방법이에요. 마우스로 던지는 것과는 달라요.';
        return div;
      }
    }
  }

  private renderCheck(): void {
    const lesson = this.lesson;
    const ctx = this.ctx;
    if (lesson === null || ctx === null) return;
    const box = this.must('.tut-check');
    const check = lesson.check;

    if (check === undefined) {
      if (ctx.completed) {
        box.innerHTML = `<div class="tut-done">✓ 완료한 레슨이에요</div>`;
      } else {
        box.innerHTML = `<button type="button" class="big-btn" data-act="read-done">다 읽었어요 ✓</button>`;
        this.on('read-done', () => {
          this.callbacks.onComplete();
          this.markCompleted();
        });
      }
      return;
    }

    if (check.kind === 'quiz') {
      const doneNote = ctx.completed ? `<div class="tut-done">✓ 완료한 레슨이에요</div>` : '';
      box.innerHTML = `
        ${doneNote}
        <button type="button" class="big-btn" data-act="start-quiz">
          문제 풀기 (${check.questions.length}문항)
        </button>`;
      this.on('start-quiz', () => this.startQuiz());
      return;
    }

    if (check.kind === 'drill') {
      const result = ctx.drillResult;
      const resultHtml =
        result === undefined
          ? ''
          : `<div class="drill-result ${result.success ? 'is-success' : ''}">${result.message}</div>`;
      const doneNote = ctx.completed && result === undefined
        ? `<div class="tut-done">✓ 완료한 레슨이에요</div>` : '';
      box.innerHTML = `
        ${resultHtml}
        ${doneNote}
        <div class="drill-goal">🎯 ${goalText(check)}</div>
        <button type="button" class="big-btn" data-act="start-drill">
          ${result === undefined && !ctx.completed ? '연습 시작' : '다시 도전하기'}
        </button>`;
      this.on('start-drill', () => this.callbacks.onStartDrill(check));
      return;
    }

    // observe
    if (check.what === 'approach') {
      box.innerHTML = ctx.completed
        ? `<div class="tut-done">✓ 완료한 레슨이에요</div>`
        : `<div class="tut-observe-note">위 그림의 ▶ 재생을 눌러 끝까지 보면 완료돼요.</div>`;
      return;
    }

    // observe trajectory
    const doneNote = ctx.completed ? `<div class="tut-done">✓ 완료한 레슨이에요</div>` : '';
    box.innerHTML = `
      ${doneNote}
      <div class="tut-observe-note">공이 굴러간 길이 화면에 선으로 남아요. ${check.times}번 굴리면서 살펴봐요.</div>
      <button type="button" class="big-btn" data-act="start-observe">공 굴려서 관찰하기</button>`;
    this.on('start-observe', () => this.callbacks.onStartTrajectoryObserve(check.times));
  }

  private renderFoot(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const foot = this.must('.tut-foot');
    foot.innerHTML = ctx.completed && ctx.hasNext
      ? `<button type="button" class="big-btn big-btn--accent" data-act="next">다음 레슨 →</button>`
      : '';
    this.on('next', () => this.callbacks.onNext());
  }

  /** 완료 조건이 달성된 직후 화면을 완료 상태로 바꾼다 */
  private markCompleted(): void {
    if (this.ctx === null) return;
    this.ctx = { ...this.ctx, completed: true };
    this.renderCheck();
    this.renderFoot();
  }

  private onApproachPlayed(): void {
    const lesson = this.lesson;
    const ctx = this.ctx;
    if (lesson === null || ctx === null || ctx.completed) return;
    if (lesson.check?.kind !== 'observe' || lesson.check.what !== 'approach') return;
    this.callbacks.onComplete();
    this.markCompleted();
    const box = this.must('.tut-check');
    box.innerHTML = `<div class="tut-done">✓ 잘 봤어요! 완료했어요</div>`;
  }

  // -------------------------------------------------------------------------
  // 퀴즈 보기
  // -------------------------------------------------------------------------

  private startQuiz(): void {
    const lesson = this.lesson;
    if (lesson === null || lesson.check?.kind !== 'quiz') return;
    this.quiz = new QuizRunner(lesson.check, lesson.id);
    this.renderQuestion();
  }

  private renderQuestion(): void {
    const lesson = this.lesson;
    const quiz = this.quiz;
    if (lesson === null || quiz === null) return;

    const q = quiz.current;
    this.glossary.hide();
    this.panelEl.innerHTML = `
      ${this.headHtml(`${lesson.id} · 문제 ${quiz.questionNumber} / ${quiz.total}`)}
      <div class="quiz-prompt">${q.prompt}</div>
      <div class="quiz-diagram"></div>
      <div class="quiz-choices"></div>
      <div class="quiz-feedback" hidden></div>
      <div class="tut-foot"></div>
    `;
    this.wireHead();

    if (q.diagram !== undefined) {
      this.must('.quiz-diagram').appendChild(renderDiagram(q.diagram, this.hand));
    }

    const choicesEl = this.must('.quiz-choices');
    q.choices.forEach((choice, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-btn';
      btn.textContent = choice.text;
      btn.addEventListener('click', () => this.answer(i));
      choicesEl.appendChild(btn);
    });
  }

  private answer(index: number): void {
    const quiz = this.quiz;
    if (quiz === null || quiz.hasAnswered || quiz.isFinished) return;

    const result = quiz.answer(index);
    const buttons = this.panelEl.querySelectorAll<HTMLButtonElement>('.choice-btn');
    buttons.forEach((btn, i) => {
      btn.disabled = true;
      const choice = quiz.current.choices[i];
      if (choice?.correct === true) btn.classList.add('is-correct');
      if (i === index && !result.correct) btn.classList.add('is-wrong');
    });

    const feedback = this.must('.quiz-feedback');
    feedback.hidden = false;
    feedback.className = `quiz-feedback ${result.correct ? 'is-correct' : 'is-wrong'}`;
    feedback.innerHTML = result.correct
      ? '🎉 맞았어요!'
      : `아쉬워요. 정답은 <b>${result.correctText}</b>예요.<br>${result.feedback ?? ''}`;

    const foot = this.must('.tut-foot');
    foot.innerHTML = `<button type="button" class="big-btn big-btn--accent" data-act="quiz-next">
      ${result.isLast ? '결과 보기' : '다음 문제 →'}
    </button>`;
    this.on('quiz-next', () => {
      quiz.next();
      if (quiz.isFinished) this.finishQuiz();
      else this.renderQuestion();
    });
  }

  private finishQuiz(): void {
    const lesson = this.lesson;
    const ctx = this.ctx;
    const quiz = this.quiz;
    if (lesson === null || ctx === null || quiz === null) return;

    this.callbacks.onComplete({ correct: quiz.correct, total: quiz.total });
    this.ctx = { ...ctx, completed: true };

    this.panelEl.innerHTML = `
      ${this.headHtml(`${lesson.id} · 결과`)}
      <div class="quiz-summary ${quiz.passed ? 'is-passed' : ''}">
        <div class="quiz-summary-emoji">${quiz.correct === quiz.total ? '🏆' : quiz.passed ? '👍' : '💪'}</div>
        <div class="quiz-summary-text">${quiz.summary}</div>
      </div>
      <div class="tut-foot">
        <button type="button" class="text-btn" data-act="retry">다시 풀기</button>
        <button type="button" class="text-btn" data-act="back-lesson">설명 다시 보기</button>
        ${this.ctx.hasNext ? '<button type="button" class="big-btn big-btn--accent" data-act="next">다음 레슨 →</button>' : ''}
      </div>
    `;
    this.wireHead();
    this.on('retry', () => this.startQuiz());
    this.on('back-lesson', () => this.renderLesson());
    this.on('next', () => this.callbacks.onNext());
  }

  // -------------------------------------------------------------------------
  // 공통 조각
  // -------------------------------------------------------------------------

  private headHtml(crumb: string): string {
    return `
      <div class="tut-head">
        <button type="button" class="text-btn" data-act="menu">← 목록</button>
        <div class="tut-crumb">${crumb}</div>
        <button type="button" class="text-btn" data-act="close">✕ 나가기</button>
      </div>`;
  }

  private wireHead(): void {
    this.on('menu', () => this.callbacks.onMenu());
    this.on('close', () => this.callbacks.onClose());
  }

  private on(act: string, fn: () => void): void {
    const el = this.panelEl.querySelector<HTMLElement>(`[data-act="${act}"]`);
    el?.addEventListener('click', fn);
  }

  private must(selector: string): HTMLElement {
    const el = this.panelEl.querySelector<HTMLElement>(selector);
    if (el === null) throw new Error(`튜토리얼 패널 요소를 찾을 수 없습니다: ${selector}`);
    return el;
  }
}

function goalText(drill: Drill): string {
  const goal = drill.goal;
  switch (goal.kind) {
    case 'knockAll':
      return '서 있는 핀을 다 쓰러뜨려요';
    case 'knockPins':
      return `${goal.pins.join('번, ')}번 핀을 쓰러뜨려요`;
    case 'pocketHit':
      return goal.times === 1 ? '포켓에 넣어요' : `포켓에 ${goal.times}번 넣어요`;
    case 'strike':
      return goal.times === 1 ? '스트라이크를 만들어요' : `스트라이크 ${goal.times}번!`;
    case 'spare':
      return '스페어를 만들어요';
    case 'minScore':
      return `10프레임을 끝까지 던져 ${goal.score}점을 넘겨요`;
  }
}
