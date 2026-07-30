/**
 * 튜토리얼 데이터 모델.
 *
 * 콘텐츠는 데이터, 엔진은 코드. 레슨을 고칠 때 curriculum.ts만 손대고
 * 게임 코드는 건드리지 않는다는 원칙이 이 타입에 담겨 있다.
 */

import type { PinNumber } from '../rules/pinLayout';

export type AreaId = 'A' | 'B' | 'C' | 'D' | 'E';

/** 레슨 본문 블록. 초등 대상이므로 종류를 적게 유지한다. */
export type Block =
  | { kind: 'text'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'callout'; text: string }
  /** 실제 볼링장 지식임을 알리는 고정 배너 (영역 C) */
  | { kind: 'realWorldNotice' };

/** 어떤 다이어그램을 어떤 인자로 그릴지 */
export type DiagramSpec =
  | { kind: 'pinDeck'; highlight?: PinNumber[]; showPocket?: boolean; showNumbers?: boolean }
  | { kind: 'laneTop'; showArrows?: boolean; showOil?: boolean; showBoards?: boolean }
  | { kind: 'scorecard'; rolls: number[]; highlightFrame?: number; blankFrame?: number }
  | { kind: 'approach' };

/** 4지선다 문항 */
export type Choice = {
  text: string;
  correct: boolean;
  /** 이 보기를 골랐을 때 보여줄 한 줄 안내 */
  feedback?: string;
};

export type Question =
  /** 보기를 직접 적어 둔 문항 */
  | { kind: 'choice'; prompt: string; choices: Choice[]; diagram?: DiagramSpec }
  /**
   * 점수 계산 문항. 보기도 정답도 적어 두지 않는다.
   * Scorecard로 정답을 계산하고, 흔한 오해로 오답을 만든다.
   */
  | { kind: 'scoreChoice'; prompt: string; rolls: number[]; askFrame: number };

export type Quiz = {
  kind: 'quiz';
  questions: Question[];
  /** 통과 기준 (0~1). 못 넘겨도 진행은 막지 않는다 */
  passRatio: number;
};

/** 드릴 성공 조건. PinState와 Scorecard 결과만으로 판정 가능한 것만 둔다. */
export type DrillGoal =
  | { kind: 'knockAll' }
  | { kind: 'knockPins'; pins: PinNumber[] }
  | { kind: 'pocketHit'; times: number }
  | { kind: 'strike'; times: number }
  | { kind: 'spare' }
  | { kind: 'minScore'; score: number };

export type Drill = {
  kind: 'drill';
  /** 세울 핀. 오른손 기준으로 쓰고 왼손이면 미러링된다 */
  setup: { standingPins: PinNumber[]; startX?: number; hint?: string };
  goal: DrillGoal;
  /** 시도 횟수. 다 써도 진행은 막지 않는다 */
  attempts: number;
  /** '도움 받기'(조준 보조) 허용 */
  assist?: boolean;
};

/** 관찰형 완료 조건 (애니메이션·궤적을 보기만 하면 완료) */
export type Observe = {
  kind: 'observe';
  /** 몇 번 관찰해야 완료인가 */
  times: number;
  what: 'approach' | 'trajectory';
};

export type Check = Quiz | Drill | Observe;

export type Lesson = {
  /** 'B3' — 딥링크(?lesson=B3) 키 */
  id: string;
  title: string;
  body: Block[];
  diagram?: DiagramSpec;
  /** 없으면 '읽음'으로 완료 */
  check?: Check;
  estimatedMinutes: number;
};

export type Area = {
  id: AreaId;
  title: string;
  summary: string;
  lessons: Lesson[];
  /** 권장 선행 영역. 강제 잠금이 아니라 안내만 한다 */
  recommendedAfter?: AreaId[];
};
