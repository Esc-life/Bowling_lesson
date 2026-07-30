/**
 * 점수판 예시 다이어그램.
 *
 * 게임 화면의 Scoreboard 렌더러를 그대로 재사용한다. 퀴즈에서는 물어보는
 * 프레임의 누적 점수를 빈칸(?)으로 비워, 표를 읽고 답을 고르게 한다.
 * 점수는 하드코딩하지 않고 Scorecard가 계산한다 — 규칙 구현과 교육
 * 내용이 어긋날 수 없다.
 */

import { Scorecard } from '../../rules/Scorecard';
import { Scoreboard, type ScoreboardOptions } from '../../ui/Scoreboard';

export type ScorecardDiagramOptions = {
  rolls: number[];
  highlightFrame?: number;
  blankFrame?: number;
};

export function renderScorecardDiagram(opts: ScorecardDiagramOptions): HTMLElement {
  const card = new Scorecard();
  for (const pins of opts.rolls) card.roll(pins);

  const renderOptions: ScoreboardOptions = { compact: true };
  if (opts.blankFrame !== undefined) renderOptions.blankCumulativeFrame = opts.blankFrame;
  if (opts.highlightFrame !== undefined) renderOptions.highlightFrame = opts.highlightFrame;

  const board = new Scoreboard({ compact: true });
  board.render(card, renderOptions);

  // 프레임 10칸이 좁은 화면보다 넓을 수 있어 가로 스크롤 컨테이너에 담는다
  const wrap = document.createElement('div');
  wrap.className = 'diagram diagram--scorecard';
  wrap.appendChild(board.element);
  return wrap;
}
