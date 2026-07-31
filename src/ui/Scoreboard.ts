/**
 * 점수판 오버레이.
 *
 * 게임 화면과 튜토리얼 퀴즈가 같은 렌더러를 쓴다. 퀴즈에서는 특정 프레임을
 * 빈칸으로 비우고 강조 표시만 하면 되므로, 점수판을 두 번 만들지 않는다.
 */

import type { FrameView } from '../rules/Scorecard';
import { Scorecard } from '../rules/Scorecard';
import type { MatchMachine } from '../rules/MatchMachine';

export type ScoreboardOptions = {
  /** 이 프레임의 누적 점수를 빈칸(?)으로 비운다 — 퀴즈용 */
  blankCumulativeFrame?: number;
  /** 강조할 프레임 번호 */
  highlightFrame?: number;
  /** 지금 던지고 있는 프레임 표시 */
  activeFrame?: number;
  compact?: boolean;
};

/** 굴림 하나를 볼링 표기법으로 (X, /, -) */
function rollSymbol(frame: FrameView, index: number, totalFrames: number): string {
  const value = frame.rolls[index];
  if (value === undefined) return '';
  if (value === 10) return 'X';
  if (index > 0) {
    const prev = frame.rolls[index - 1]!;
    // 마지막 프레임에서 스트라이크 뒤의 굴림은 새 랙이므로 스페어 표기를 하지 않는다
    const isFreshRack = frame.index === totalFrames && prev === 10;
    if (!isFreshRack && prev + value === 10) return '/';
  }
  if (value === 0) return '-';
  return String(value);
}

export class Scoreboard {
  readonly element: HTMLElement;

  constructor(options: ScoreboardOptions = {}) {
    this.element = document.createElement('div');
    this.element.className = options.compact === true ? 'scoreboard scoreboard--compact' : 'scoreboard';
  }

  render(card: Scorecard, options: ScoreboardOptions = {}): void {
    this.element.innerHTML = this.rowHtml(card, options);
  }

  /**
   * 매치 전체를 그린다. 사람마다 한 줄씩, 지금 차례인 사람을 강조한다.
   *
   * 1명짜리 매치(자유 연습)에서는 이름 줄을 접어 1인 화면과 같게 보인다.
   */
  renderMatch(match: MatchMachine): void {
    if (!match.isMultiplayer) {
      this.element.classList.remove('scoreboard--match');
      this.render(match.activeMachine.scorecard, {
        activeFrame: match.activeMachine.currentFrame,
      });
      return;
    }

    this.element.classList.add('scoreboard--match');
    const totals = new Map(match.ranking.map((s) => [s.player.id, s.rank]));

    const rows = match.players.map((player) => {
      const card = match.machineOf(player.id).scorecard;
      const isActive = player.id === match.active.id;
      const inner = this.rowHtml(card, isActive ? { activeFrame: card.currentFrame } : {});
      const rank = match.isMatchOver ? `<span class="rank">${totals.get(player.id)}위</span>` : '';
      return `
        <div class="match-row${isActive ? ' match-row--active' : ''}">
          <div class="match-name">${escapeHtml(player.name)}${rank}</div>
          ${inner}
        </div>
      `;
    });

    this.element.innerHTML = rows.join('');
  }

  /** 프레임 한 줄(칸 + 합계)을 그린다. `render`와 `renderMatch`가 공유한다. */
  private rowHtml(card: Scorecard, options: ScoreboardOptions = {}): string {
    const frames = card.frames;
    const totalFrames = card.totalFrames;
    const rows: string[] = [];

    for (const frame of frames) {
      const isLast = frame.index === totalFrames;
      const slots = isLast ? 3 : 2;
      const cells: string[] = [];
      for (let i = 0; i < slots; i++) {
        cells.push(`<span class="roll">${rollSymbol(frame, i, totalFrames)}</span>`);
      }

      const blanked = options.blankCumulativeFrame === frame.index;
      const cumulative = blanked
        ? '<span class="blank">?</span>'
        : frame.cumulative === null
          ? ''
          : String(frame.cumulative);

      const classes = ['frame'];
      // frame--tenth: 마지막 프레임(3칸)을 뜻한다. 3프레임 경기면 3프레임이 여기 해당한다.
      if (isLast) classes.push('frame--tenth');
      if (options.highlightFrame === frame.index) classes.push('frame--highlight');
      if (options.activeFrame === frame.index) classes.push('frame--active');

      rows.push(`
        <div class="${classes.join(' ')}">
          <div class="frame-no">${frame.index}</div>
          <div class="rolls">${cells.join('')}</div>
          <div class="cumulative">${cumulative}</div>
        </div>
      `);
    }

    return `
      <div class="frames">${rows.join('')}</div>
      <div class="total">
        <div class="total-label">합계</div>
        <div class="total-value">${card.total}</div>
      </div>
    `;
  }
}

/** 이름은 사용자가 입력한 값이라 그대로 innerHTML에 넣으면 안 된다 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}
