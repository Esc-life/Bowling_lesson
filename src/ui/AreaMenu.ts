/**
 * 영역 선택 화면.
 *
 * 영역을 잠그지 않는다 — 교사가 필요한 영역만 골라 쓸 수 있어야 한다.
 * 권장 순서만 안내 문구로 보여준다. 공용 PC를 위해 진행률 초기화 버튼을
 * 숨기지 않고 여기 둔다.
 */

import type { TutorialFlow } from '../tutorial/TutorialFlow';
import type { AreaId } from '../tutorial/types';

export type AreaMenuCallbacks = {
  onOpenLesson: (lessonId: string) => void;
  onClose: () => void;
  onReport: () => void;
  /** 진행률과 설정을 지우고 처음부터 (확인은 메뉴 안에서 이미 받았다) */
  onReset: () => void;
};

export class AreaMenu {
  readonly element: HTMLElement;
  private readonly panelEl: HTMLElement;

  constructor(private readonly callbacks: AreaMenuCallbacks) {
    this.element = document.createElement('div');
    this.element.className = 'overlay tutorial-overlay';
    this.element.hidden = true;

    this.panelEl = document.createElement('div');
    this.panelEl.className = 'panel area-menu';
    this.element.appendChild(this.panelEl);

    this.panelEl.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-lesson]');
      if (target === null) return;

      const lessonId = target.dataset['lesson'];
      if (lessonId !== undefined) {
        this.callbacks.onOpenLesson(lessonId);
        return;
      }

      switch (target.dataset['act']) {
        case 'continue': {
          const next = target.dataset['next'];
          if (next !== undefined) this.callbacks.onOpenLesson(next);
          break;
        }
        case 'close':
          this.callbacks.onClose();
          break;
        case 'report':
          this.callbacks.onReport();
          break;
        case 'reset-ask':
          this.showResetConfirm();
          break;
        case 'reset-cancel':
          this.hideResetConfirm();
          break;
        case 'reset-yes':
          this.callbacks.onReset();
          break;
        default:
          break;
      }
    });
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  hide(): void {
    this.element.hidden = true;
  }

  /** @param focusArea 딥링크(?area=D)로 열 때 강조할 영역 */
  show(flow: TutorialFlow, focusArea?: AreaId): void {
    this.element.hidden = false;
    this.render(flow, focusArea);
  }

  private render(flow: TutorialFlow, focusArea?: AreaId): void {
    const doneCount = flow.allAreaProgress().reduce((n, p) => n + p.completed, 0);
    const totalCount = flow.allAreaProgress().reduce((n, p) => n + p.total, 0);
    const nextLesson = flow.firstIncomplete();

    const areaCards = flow.allAreaProgress().map((progress) => {
      const { area } = progress;
      const focus = area.id === focusArea ? ' area-card--focus' : '';
      const recommend =
        progress.recommendedNotDone.length > 0 && progress.completed === 0
          ? `<div class="area-recommend">💡 ${progress.recommendedNotDone.join(', ')} 영역을 먼저 하면 더 쉬워요</div>`
          : '';

      const lessons = area.lessons.map((lesson) => {
        const done = flow.isCompleted(lesson.id);
        const score = flow.quizScore(lesson.id);
        const scoreText = score === null ? '' : `<span class="lesson-score">${score.correct}/${score.total}</span>`;
        return `
          <button type="button" class="lesson-row ${done ? 'is-done' : ''}" data-lesson="${lesson.id}">
            <span class="lesson-dot">${done ? '✓' : ''}</span>
            <span class="lesson-name">${lesson.id}. ${lesson.title}</span>
            ${scoreText}
            <span class="lesson-mins">${lesson.estimatedMinutes}분</span>
          </button>`;
      });

      return `
        <div class="area-card${focus}">
          <div class="area-head">
            <b>${area.id}. ${area.title}</b>
            <span class="area-count">${progress.completed}/${progress.total}</span>
          </div>
          <p class="area-summary">${area.summary}</p>
          ${recommend}
          <div class="lesson-list">${lessons.join('')}</div>
        </div>`;
    });

    this.panelEl.innerHTML = `
      <div class="tut-head">
        <div class="tut-crumb">볼링 배우기</div>
        <button type="button" class="text-btn" data-act="close">✕ 자유 연습</button>
      </div>
      <div class="menu-overall">
        <div class="menu-overall-bar"><div style="width:${Math.round(flow.overallRatio * 100)}%"></div></div>
        <span>${doneCount} / ${totalCount} 레슨</span>
      </div>
      ${
        nextLesson !== null
          ? `<button type="button" class="big-btn big-btn--accent" data-act="continue" data-next="${nextLesson}">
              ${doneCount === 0 ? '처음부터 시작하기' : '이어서 하기'} (${nextLesson})
            </button>`
          : `<div class="menu-alldone">🏆 모든 레슨을 마쳤어요!</div>`
      }
      <div class="areas">${areaCards.join('')}</div>
      <div class="menu-foot">
        <button type="button" class="text-btn" data-act="report">내 리포트 보기</button>
        <span class="reset-zone">
          <button type="button" class="text-btn" data-act="reset-ask">진행률 지우기</button>
          <span class="reset-confirm" hidden>
            정말 다 지울까요?
            <button type="button" class="text-btn text-btn--danger" data-act="reset-yes">지우기</button>
            <button type="button" class="text-btn" data-act="reset-cancel">취소</button>
          </span>
        </span>
      </div>
    `;

    if (focusArea !== undefined) {
      this.panelEl.querySelector('.area-card--focus')?.scrollIntoView({ block: 'center' });
    }
  }

  private showResetConfirm(): void {
    const confirm = this.panelEl.querySelector<HTMLElement>('.reset-confirm');
    const ask = this.panelEl.querySelector<HTMLElement>('[data-act="reset-ask"]');
    if (confirm !== null) confirm.hidden = false;
    if (ask !== null) ask.hidden = true;
  }

  private hideResetConfirm(): void {
    const confirm = this.panelEl.querySelector<HTMLElement>('.reset-confirm');
    const ask = this.panelEl.querySelector<HTMLElement>('[data-act="reset-ask"]');
    if (confirm !== null) confirm.hidden = true;
    if (ask !== null) ask.hidden = false;
  }
}
