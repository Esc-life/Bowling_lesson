/**
 * 홈 화면 — 영역 선택과 놀기 버튼.
 *
 * 영역을 잠그지 않는다 — 교사가 필요한 영역만 골라 쓸 수 있어야 한다.
 * 권장 순서만 안내 문구로 보여준다. 공용 PC를 위해 진행률 초기화 버튼을
 * 숨기지 않고 여기 둔다.
 *
 * 자유 연습과 대전은 다 배운 학생만 열 수 있다. 잠긴 버튼을 감추지 않고
 * 이유와 함께 보여 준다 — 목표가 보여야 배울 마음이 생긴다.
 *
 * 닫기 버튼이 없다. 여기가 맨 위 화면이라 닫고 갈 곳이 없기 때문이다.
 * 닫기가 있으면 잠금 버튼 바로 옆의 ✕ 한 번으로 정식 경기 화면이 열려,
 * 아직 아무것도 안 배운 학생이 잠금을 통째로 건너뛴다. 게임 화면으로는
 * 자유 연습·대전 버튼을 통해서만 들어간다.
 */

import { players } from '../players/PlayerStore';
import { practiceLockReason } from '../players/unlock';
import { Progress } from '../tutorial/Progress';
import type { TutorialFlow } from '../tutorial/TutorialFlow';
import type { AreaId } from '../tutorial/types';
import { escapeHtml } from '../util/html';

/** 홈을 나가기 전까지 치던 10프레임 경기가 있으면 여기 담겨 온다 */
export type ResumableGame = { frame: number; total: number };

export type AreaMenuCallbacks = {
  onOpenLesson: (lessonId: string) => void;
  onReport: () => void;
  /** 진행률과 설정을 지우고 처음부터 (확인은 메뉴 안에서 이미 받았다) */
  onReset: () => void;
  /** 자유 연습으로 (해금된 경우에만 불린다) */
  onFreePractice: () => void;
  /** 대전 참가자 고르기로 (해금 여부는 다음 화면에서 판정한다) */
  onMatch: () => void;
  /** 플레이어 바꾸기 */
  onSwitchPlayer: () => void;
  /** 치던 10프레임 경기로 그대로 돌아가기 (resumeGame이 있을 때만 불린다) */
  onResumeGame: () => void;
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

      const act = target.dataset['act'];

      if (act === 'free-practice' || act === 'match') {
        const lock = target.dataset['lock'];
        if (lock !== undefined) {
          // 잠긴 이유를 그 자리에서 보여 준다. 감추면 있는 줄도 모른다.
          this.showLockNote(target, lock);
          return;
        }
        if (act === 'free-practice') this.callbacks.onFreePractice();
        else this.callbacks.onMatch();
        return;
      }

      switch (act) {
        case 'switch-player':
          this.callbacks.onSwitchPlayer();
          break;
        case 'continue': {
          const next = target.dataset['next'];
          if (next !== undefined) this.callbacks.onOpenLesson(next);
          break;
        }
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
        case 'resume-game':
          this.callbacks.onResumeGame();
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

  /**
   * @param focusArea 딥링크(?area=D)로 열 때 강조할 영역
   * @param notice 화면 맨 위에 한 줄 알림 (예: 대전을 그만뒀다는 안내)
   * @param resumeGame 나가기 전까지 치던 10프레임 경기 (있으면 돌아가기 버튼을 보여준다)
   */
  show(flow: TutorialFlow, focusArea?: AreaId, notice?: string, resumeGame?: ResumableGame | null): void {
    this.element.hidden = false;
    this.render(flow, focusArea, notice, resumeGame ?? null);
  }

  private render(
    flow: TutorialFlow,
    focusArea?: AreaId,
    notice?: string,
    resumeGame: ResumableGame | null = null,
  ): void {
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

    const player = players.current;
    const practiceLock = player === null ? '먼저 플레이어를 골라 주세요.' : practiceLockReason(player);
    const playerBar =
      player === null
        ? ''
        : `
      <div class="player-bar">
        <span class="player-current">${escapeHtml(player.name)}</span>
        <button type="button" class="text-btn" data-act="switch-player">바꾸기</button>
      </div>
    `;

    const playButtons = `
      <div class="play-buttons">
        <button type="button" class="play-btn${practiceLock === null ? '' : ' is-locked'}"
                data-act="free-practice"
                ${practiceLock === null ? '' : `data-lock="${escapeHtml(practiceLock)}"`}>
          <span class="play-icon" aria-hidden="true">${practiceLock === null ? '🎳' : '🔒'}</span>
          <span class="play-name">자유 연습</span>
          <span class="play-desc">${escapeHtml(practiceLock ?? '배운 걸로 마음껏 던져 봐요')}</span>
        </button>
        <button type="button" class="play-btn${practiceLock === null ? '' : ' is-locked'}"
                data-act="match"
                ${practiceLock === null ? '' : `data-lock="${escapeHtml(practiceLock)}"`}>
          <span class="play-icon" aria-hidden="true">${practiceLock === null ? '🏆' : '🔒'}</span>
          <span class="play-name">대전</span>
          <span class="play-desc">${practiceLock === null ? '친구와 번갈아 쳐요' : '다 배우면 친구와 겨룰 수 있어요'}</span>
        </button>
      </div>
    `;

    this.panelEl.innerHTML = `
      ${playerBar}
      <div class="tut-head">
        <div class="tut-crumb">볼링 배우기</div>
      </div>
      ${notice === undefined ? '' : `<div class="menu-notice">${escapeHtml(notice)}</div>`}
      ${
        resumeGame === null
          ? ''
          : `<button type="button" class="big-btn big-btn--resume" data-act="resume-game">
              🎳 치던 경기로 돌아가기 (${resumeGame.frame}프레임째 · ${resumeGame.total}점)
            </button>`
      }
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
      ${playButtons}
      <div class="menu-foot">
        <button type="button" class="text-btn" data-act="report">내 리포트 보기</button>
        ${
          // 시연 모드에서는 누구 진도인지 모르는 채로 지우게 되므로 감춘다.
          // Progress.clear()가 어차피 막혀 있어, 남겨 두면 눌러도 아무 일이
          // 없는 버튼이 된다.
          Progress.isDemo
            ? ''
            : `<span class="reset-zone">
          <button type="button" class="text-btn" data-act="reset-ask">진행률 지우기</button>
          <span class="reset-confirm" hidden>
            정말 다 지울까요?
            <button type="button" class="text-btn text-btn--danger" data-act="reset-yes">지우기</button>
            <button type="button" class="text-btn" data-act="reset-cancel">취소</button>
          </span>
        </span>`
        }
      </div>
    `;

    if (focusArea !== undefined) {
      this.panelEl.querySelector('.area-card--focus')?.scrollIntoView({ block: 'center' });
    }
  }

  /** 잠긴 버튼을 누르면 이유를 잠깐 띄운다 */
  private showLockNote(button: HTMLElement, text: string): void {
    const desc = button.querySelector<HTMLElement>('.play-desc');
    if (desc === null) return;
    const original = desc.textContent ?? '';
    desc.textContent = text;
    button.classList.add('is-shaking');
    window.setTimeout(() => {
      desc.textContent = original;
      button.classList.remove('is-shaking');
    }, 2400);
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
