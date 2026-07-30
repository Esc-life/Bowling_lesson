/**
 * 점수판 오버레이.
 *
 * 게임 화면과 튜토리얼 퀴즈가 같은 렌더러를 쓴다. 퀴즈에서는 특정 프레임을
 * 빈칸으로 비우고 강조 표시만 하면 되므로, 점수판을 두 번 만들지 않는다.
 */

import type { FrameView } from '../rules/Scorecard';
import { Scorecard } from '../rules/Scorecard';

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
function rollSymbol(frame: FrameView, index: number): string {
  const value = frame.rolls[index];
  if (value === undefined) return '';
  if (value === 10) return 'X';
  if (index > 0) {
    const prev = frame.rolls[index - 1]!;
    // 10프레임에서 스트라이크 뒤의 굴림은 새 랙이므로 스페어 표기를 하지 않는다
    const isFreshRack = frame.index === 10 && prev === 10;
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
    const frames = card.frames;
    const rows: string[] = [];

    for (const frame of frames) {
      const isTenth = frame.index === 10;
      const slots = isTenth ? 3 : 2;
      const cells: string[] = [];
      for (let i = 0; i < slots; i++) {
        cells.push(`<span class="roll">${rollSymbol(frame, i)}</span>`);
      }

      const blanked = options.blankCumulativeFrame === frame.index;
      const cumulative = blanked
        ? '<span class="blank">?</span>'
        : frame.cumulative === null
          ? ''
          : String(frame.cumulative);

      const classes = ['frame'];
      if (isTenth) classes.push('frame--tenth');
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

    this.element.innerHTML = `
      <div class="frames">${rows.join('')}</div>
      <div class="total">
        <div class="total-label">합계</div>
        <div class="total-value">${card.total}</div>
      </div>
    `;
  }
}
