/**
 * 핀 번호 ↔ 좌표, 포켓, 좌우 미러링.
 *
 * 순수 로직 — Three.js도 Rapier도 모른다. 게임 판정과 튜토리얼
 * 다이어그램이 이 파일을 함께 쓰기 때문에, 교육 내용과 게임 동작이
 * 어긋날 수 없다.
 *
 * 핀 번호는 투구자가 보는 방향 기준이다. 2번은 왼쪽, 3번은 오른쪽.
 *
 *          7   8   9   10      ← 뒷줄
 *            4   5   6
 *              2   3
 *                1             ← 헤드핀 (투구자와 가장 가까움)
 *
 * ┌─ 좌우 부호 규칙 (헷갈리기 쉬우니 꼭 읽을 것) ────────────────────┐
 * │ 투구자는 +Z 방향을 보고 서 있고 +Y가 위다. 오른손 좌표계에서       │
 * │ +Z를 바라보는 사람의 오른손은 **-X** 를 가리킨다.                 │
 * │                                                                  │
 * │   투구자 기준 오른쪽 = 월드 -X = 화면 오른쪽                      │
 * │   투구자 기준 왼쪽   = 월드 +X = 화면 왼쪽                        │
 * │                                                                  │
 * │ 그래서 3번 핀(투구자의 오른쪽)은 x가 음수다. 이걸 반대로 잡으면    │
 * │ 화면에 보이는 좌우와 가르치는 좌우가 뒤집혀서, 오른손잡이 학생이   │
 * │ 왼쪽에 있는 화살표를 "오른쪽에서 두 번째"라고 배우게 된다.         │
 * └──────────────────────────────────────────────────────────────────┘
 */

import { LANE, PIN } from '../config';

export type Handedness = 'right' | 'left';

/** 핀 번호 1~10 */
export type PinNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export const ALL_PINS: readonly PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** 줄 사이의 Z 간격 = 정삼각형 배치이므로 spacing * cos(30°) */
const ROW_GAP_Z = PIN.spacing * Math.cos(Math.PI / 6);

/**
 * 핀 번호 → [x 오프셋(spacing 배수), 줄 번호(0~3)]
 *
 * 부호는 위의 좌우 규칙을 따른다: 투구자의 왼쪽이 +x.
 * 그래서 2·4·7번(왼쪽)은 양수, 3·6·10번(오른쪽)은 음수다.
 */
const LAYOUT: Record<PinNumber, readonly [number, number]> = {
  1: [0, 0],
  2: [+0.5, 1],
  3: [-0.5, 1],
  4: [+1, 2],
  5: [0, 2],
  6: [-1, 2],
  7: [+1.5, 3],
  8: [+0.5, 3],
  9: [-0.5, 3],
  10: [-1.5, 3],
};

export type Vec2 = { x: number; z: number };

/** 핀 중심의 월드 좌표 (m). 1번 핀이 z = LANE.headPinZ */
export function pinPosition(pin: PinNumber): Vec2 {
  const [xMul, row] = LAYOUT[pin];
  return {
    x: xMul * PIN.spacing,
    z: LANE.headPinZ + row * ROW_GAP_Z,
  };
}

/** 핀이 놓인 줄 (0 = 헤드핀) */
export function pinRow(pin: PinNumber): number {
  return LAYOUT[pin][1];
}

// ---------------------------------------------------------------------------
// 좌우 미러링
// ---------------------------------------------------------------------------

/**
 * 좌우를 뒤집었을 때 대응하는 핀 번호.
 *
 * 커리큘럼은 오른손 기준으로만 작성하고, 왼손 학생이면 드릴 목표를
 * 이 함수로 통과시킨다. 콘텐츠를 두 벌 쓰지 않기 위한 장치다.
 *
 * 자기역함수여야 한다: mirrorPin(mirrorPin(n)) === n
 */
const MIRROR: Record<PinNumber, PinNumber> = {
  1: 1,
  2: 3,
  3: 2,
  4: 6,
  5: 5,
  6: 4,
  7: 10,
  8: 9,
  9: 8,
  10: 7,
};

export function mirrorPin(pin: PinNumber): PinNumber {
  return MIRROR[pin];
}

export function mirrorPins(pins: readonly PinNumber[]): PinNumber[] {
  return pins.map(mirrorPin);
}

/** 오른손 기준으로 쓰인 핀 목록을 학생의 손에 맞게 변환 */
export function forHand(pins: readonly PinNumber[], hand: Handedness): PinNumber[] {
  return hand === 'right' ? [...pins] : mirrorPins(pins);
}

// ---------------------------------------------------------------------------
// 포켓
// ---------------------------------------------------------------------------

/**
 * 포켓 = 헤드핀과 그 옆 핀 사이의 틈. 여기로 공이 들어가면
 * 스트라이크가 잘 나온다.
 *  - 오른손: 1번과 3번 사이
 *  - 왼손:   1번과 2번 사이
 */
export function pocketPins(hand: Handedness): [PinNumber, PinNumber] {
  return hand === 'right' ? [1, 3] : [1, 2];
}

/** 포켓 중심의 x 좌표 = 1번 핀과 옆 핀의 중간 */
export function pocketX(hand: Handedness): number {
  const [, side] = pocketPins(hand);
  return (pinPosition(1).x + pinPosition(side).x) / 2;
}

/** 포켓 진입으로 인정하는 좌우 허용 오차 (m) */
export const POCKET_TOLERANCE = 0.055;

/**
 * 포켓 진입 판정.
 *
 * 공이 헤드핀의 Z를 지나는 순간의 x 좌표로 판정한다. "공이 어디로
 * 들어갔는지"를 한 숫자로 설명할 수 있어서 아이에게 보여주기 좋고,
 * 충돌 순서에 의존하지 않아 결과가 흔들리지 않는다.
 */
export function isPocketHit(ballXAtHeadPin: number, hand: Handedness): boolean {
  return Math.abs(ballXAtHeadPin - pocketX(hand)) <= POCKET_TOLERANCE;
}

// ---------------------------------------------------------------------------
// 보드(나무판) 좌표
// ---------------------------------------------------------------------------

/**
 * 보드 번호 → x 좌표.
 *
 * 보드는 39장이고 20번이 중앙이다. 번호는 투구자의 주손 쪽 가장자리에서
 * 센다. 오른손잡이의 1번 보드는 오른쪽 끝(월드 -x), 39번 보드는 왼쪽 끝이다.
 * 왼손잡이는 그 반대다.
 */
export function boardToX(board: number, hand: Handedness): number {
  // 투구자의 오른쪽이 -x이므로, 주손 쪽에서 세는 보드 번호가 커질수록 +x
  const x = (board - 20) * LANE.boardWidth;
  return hand === 'right' ? x : -x;
}

/** x 좌표 → 가장 가까운 보드 번호 (1~39) */
export function xToBoard(x: number, hand: Handedness): number {
  const xDominant = hand === 'right' ? x : -x;
  const board = Math.round(20 + xDominant / LANE.boardWidth);
  return Math.min(39, Math.max(1, board));
}

/**
 * 조준용 화살표의 x 좌표. 화살표는 7개, 보드 5장 간격이며
 * 주손 쪽에서 1번부터 센다. 2번 화살표가 기본 조준점이다.
 */
export function arrowX(arrowIndex: number, hand: Handedness): number {
  return boardToX(arrowIndex * 5, hand);
}

/** 기본 조준 화살표 번호 */
export const TARGET_ARROW = 2;

export function targetArrowX(hand: Handedness): number {
  return arrowX(TARGET_ARROW, hand);
}

// ---------------------------------------------------------------------------
// 스플릿 판정 (HUD 표시용)
// ---------------------------------------------------------------------------

/** 서로 맞닿아 있는(인접한) 핀 쌍 */
const NEIGHBORS: Record<PinNumber, readonly PinNumber[]> = {
  1: [2, 3],
  2: [1, 3, 4, 5],
  3: [1, 2, 5, 6],
  4: [2, 5, 7, 8],
  5: [2, 3, 4, 6, 8, 9],
  6: [3, 5, 9, 10],
  7: [4, 8],
  8: [4, 5, 7, 9],
  9: [5, 6, 8, 10],
  10: [6, 9],
};

/**
 * 스플릿 = 헤드핀이 넘어졌는데 남은 핀들이 서로 떨어져 있는 상태.
 *
 * 남은 핀을 인접 그래프의 연결 요소로 나눠 2개 이상이면 스플릿으로 본다.
 * 실제 규정의 세세한 예외(2-7 같은 경우)까지 따르지는 않는 근사다.
 * HUD 문구 표시에만 쓰므로 이 정도로 충분하다.
 */
export function isSplit(standing: readonly PinNumber[]): boolean {
  if (standing.includes(1)) return false;
  if (standing.length < 2) return false;

  const remaining = new Set(standing);
  const first = standing[0]!;
  const stack: PinNumber[] = [first];
  const seen = new Set<PinNumber>([first]);

  while (stack.length > 0) {
    const pin = stack.pop()!;
    for (const n of NEIGHBORS[pin]) {
      if (remaining.has(n) && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }

  return seen.size < remaining.size;
}

/** 핀 번호 배열 → 10칸 boolean 배열 (0번 인덱스가 1번 핀) */
export function pinsToMask(pins: readonly PinNumber[]): boolean[] {
  const mask = new Array<boolean>(10).fill(false);
  for (const p of pins) mask[p - 1] = true;
  return mask;
}

/** 10칸 boolean 배열 → 핀 번호 배열 */
export function maskToPins(mask: readonly boolean[]): PinNumber[] {
  return ALL_PINS.filter((p) => mask[p - 1] === true);
}
