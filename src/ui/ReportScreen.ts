/**
 * 수료 리포트 — 화면 표시만, 내보내기 없음 (사용자 결정).
 *
 * 영역별 진행률과 퀴즈 정답률을 모아 보여준다. 초등 대상이므로
 * 점수를 심판하지 않고 한 일을 칭찬하는 톤을 유지한다.
 */

import type { TutorialFlow } from '../tutorial/TutorialFlow';

export class ReportScreen {
  readonly element: HTMLElement;
  private readonly panelEl: HTMLElement;

  constructor(onClose: () => void) {
    this.element = document.createElement('div');
    this.element.className = 'overlay tutorial-overlay';
    this.element.hidden = true;

    this.panelEl = document.createElement('div');
    this.panelEl.className = 'panel report-screen';
    this.element.appendChild(this.panelEl);

    this.panelEl.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-act="close"]') !== null) onClose();
    });
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  hide(): void {
    this.element.hidden = true;
  }

  show(flow: TutorialFlow): void {
    this.element.hidden = false;

    const areas = flow.allAreaProgress();
    const quizRows: string[] = [];
    for (const progress of areas) {
      for (const lesson of progress.area.lessons) {
        const score = flow.quizScore(lesson.id);
        if (score === null) continue;
        quizRows.push(`
          <div class="report-quiz-row">
            <span>${lesson.id}. ${lesson.title}</span>
            <b>${score.correct} / ${score.total}</b>
          </div>`);
      }
    }

    const areaRows = areas.map((p) => {
      const pct = Math.round(p.ratio * 100);
      return `
        <div class="report-area-row">
          <span class="report-area-name">${p.area.id}. ${p.area.title}</span>
          <div class="report-area-bar"><div style="width:${pct}%"></div></div>
          <b>${p.completed}/${p.total}</b>
        </div>`;
    });

    const headline = flow.isAllComplete
      ? '🏆 모든 레슨을 마쳤어요! 정말 대단해요!'
      : `지금까지 ${Math.round(flow.overallRatio * 100)}%를 배웠어요. 잘하고 있어요!`;

    this.panelEl.innerHTML = `
      <div class="tut-head">
        <div class="tut-crumb">내 리포트</div>
        <button type="button" class="text-btn" data-act="close">✕ 닫기</button>
      </div>
      <div class="report-headline">${headline}</div>
      <h2>영역별 진행</h2>
      <div class="report-areas">${areaRows.join('')}</div>
      ${
        quizRows.length > 0
          ? `<h2>퀴즈 결과</h2><div class="report-quizzes">${quizRows.join('')}</div>`
          : ''
      }
      <div class="tut-foot">
        <button type="button" class="big-btn" data-act="close">확인</button>
      </div>
    `;
  }
}
