/**
 * DiagramSpec → DOM 요소. 레슨 본문과 퀴즈가 같은 진입점을 쓴다.
 */

import type { Handedness } from '../../rules/pinLayout';
import type { DiagramSpec } from '../types';
import { ApproachDiagram } from './ApproachDiagram';
import { renderLaneTop } from './LaneTopDiagram';
import { renderPinDeck } from './PinDeckDiagram';
import { renderScorecardDiagram } from './ScorecardDiagram';

export function renderDiagram(
  spec: DiagramSpec,
  hand: Handedness,
  opts: { onApproachComplete?: () => void } = {},
): HTMLElement {
  switch (spec.kind) {
    case 'pinDeck': {
      const o: Parameters<typeof renderPinDeck>[0] = {};
      if (spec.highlight !== undefined) o.highlight = spec.highlight;
      if (spec.showPocket !== undefined) o.showPocket = spec.showPocket;
      if (spec.showNumbers !== undefined) o.showNumbers = spec.showNumbers;
      return renderPinDeck(o, hand);
    }
    case 'laneTop': {
      const o: Parameters<typeof renderLaneTop>[0] = {};
      if (spec.showArrows !== undefined) o.showArrows = spec.showArrows;
      if (spec.showOil !== undefined) o.showOil = spec.showOil;
      if (spec.showBoards !== undefined) o.showBoards = spec.showBoards;
      return renderLaneTop(o, hand);
    }
    case 'scorecard': {
      const o: Parameters<typeof renderScorecardDiagram>[0] = { rolls: spec.rolls };
      if (spec.highlightFrame !== undefined) o.highlightFrame = spec.highlightFrame;
      if (spec.blankFrame !== undefined) o.blankFrame = spec.blankFrame;
      return renderScorecardDiagram(o);
    }
    case 'approach':
      return new ApproachDiagram(opts.onApproachComplete).element;
  }
}
