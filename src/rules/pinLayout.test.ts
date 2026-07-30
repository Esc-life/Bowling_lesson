import { describe, it, expect } from 'vitest';
import {
  ALL_PINS,
  arrowX,
  boardToX,
  forHand,
  isPocketHit,
  isSplit,
  maskToPins,
  mirrorPin,
  mirrorPins,
  pinPosition,
  pinRow,
  pinsToMask,
  pocketPins,
  pocketX,
  targetArrowX,
  xToBoard,
  type PinNumber,
} from './pinLayout';
import { LANE } from '../config';

describe('pinLayout — 좌우 미러링', () => {
  it('두 번 뒤집으면 원래 핀으로 돌아온다', () => {
    for (const pin of ALL_PINS) {
      expect(mirrorPin(mirrorPin(pin))).toBe(pin);
    }
  });

  it('미러 쌍이 정확하다', () => {
    expect(mirrorPin(1)).toBe(1);
    expect(mirrorPin(5)).toBe(5);
    expect(mirrorPin(2)).toBe(3);
    expect(mirrorPin(3)).toBe(2);
    expect(mirrorPin(4)).toBe(6);
    expect(mirrorPin(6)).toBe(4);
    expect(mirrorPin(7)).toBe(10);
    expect(mirrorPin(10)).toBe(7);
    expect(mirrorPin(8)).toBe(9);
    expect(mirrorPin(9)).toBe(8);
  });

  it('미러링은 핀 번호 집합을 보존한다 (핀이 사라지거나 겹치지 않는다)', () => {
    const mirrored = mirrorPins(ALL_PINS);
    expect(new Set(mirrored).size).toBe(10);
    expect([...mirrored].sort((a, b) => a - b)).toEqual([...ALL_PINS]);
  });

  it('미러링된 핀의 x는 부호가 뒤집히고 z는 그대로다', () => {
    for (const pin of ALL_PINS) {
      const a = pinPosition(pin);
      const b = pinPosition(mirrorPin(pin));
      expect(b.x).toBeCloseTo(-a.x, 10);
      expect(b.z).toBeCloseTo(a.z, 10);
    }
  });

  it('미러링은 같은 줄 안에서만 일어난다', () => {
    for (const pin of ALL_PINS) {
      expect(pinRow(mirrorPin(pin))).toBe(pinRow(pin));
    }
  });

  it('forHand는 오른손이면 그대로, 왼손이면 뒤집는다', () => {
    const drill: PinNumber[] = [7];
    expect(forHand(drill, 'right')).toEqual([7]);
    expect(forHand(drill, 'left')).toEqual([10]);
  });

  it('forHand는 원본 배열을 바꾸지 않는다', () => {
    const drill: PinNumber[] = [7, 4];
    forHand(drill, 'left');
    expect(drill).toEqual([7, 4]);
  });
});

/**
 * 좌우 부호 규칙을 못박아 두는 테스트.
 *
 * 투구자는 +Z를 보고 서 있고, 오른손 좌표계에서 +Z를 보는 사람의 오른손은
 * -X를 가리킨다. 즉 "투구자의 오른쪽 = 월드 -X = 화면 오른쪽"이다.
 * 이 규칙이 깨지면 화면에 보이는 좌우와 가르치는 좌우가 뒤집혀서,
 * 오른손잡이 학생이 화면 왼쪽 화살표를 "오른쪽에서 두 번째"로 배우게 된다.
 */
describe('pinLayout — 좌우 부호 규칙 (화면과 일치해야 한다)', () => {
  it('투구자의 오른쪽은 월드 -x다', () => {
    // 3번 핀은 투구자의 오른쪽에 있다
    expect(pinPosition(3).x).toBeLessThan(0);
    // 2번 핀은 투구자의 왼쪽에 있다
    expect(pinPosition(2).x).toBeGreaterThan(0);
  });

  it('오른손잡이의 포켓은 오른쪽(-x), 왼손잡이는 왼쪽(+x)', () => {
    expect(pocketX('right')).toBeLessThan(0);
    expect(pocketX('left')).toBeGreaterThan(0);
  });

  it('오른손잡이의 기준 화살표는 오른쪽(-x)에 있다', () => {
    expect(targetArrowX('right')).toBeLessThan(0);
    expect(targetArrowX('left')).toBeGreaterThan(0);
  });

  it('오른손잡이의 1번 보드는 오른쪽 끝, 39번 보드는 왼쪽 끝', () => {
    expect(boardToX(1, 'right')).toBeLessThan(boardToX(20, 'right'));
    expect(boardToX(39, 'right')).toBeGreaterThan(boardToX(20, 'right'));
  });

  it('7번 핀(왼쪽 끝)과 10번 핀(오른쪽 끝)의 부호가 맞다', () => {
    expect(pinPosition(7).x).toBeGreaterThan(0);
    expect(pinPosition(10).x).toBeLessThan(0);
  });
});

describe('pinLayout — 핀 배치', () => {
  it('1번 핀은 레인 중앙, 헤드핀 거리에 있다', () => {
    const p = pinPosition(1);
    expect(p.x).toBeCloseTo(0, 10);
    expect(p.z).toBeCloseTo(LANE.headPinZ, 10);
  });

  it('모든 핀이 레인 폭 안에 들어간다', () => {
    const halfWidth = LANE.width / 2;
    for (const pin of ALL_PINS) {
      const { x } = pinPosition(pin);
      expect(Math.abs(x)).toBeLessThan(halfWidth);
    }
  });

  it('뒷줄로 갈수록 z가 커진다', () => {
    expect(pinPosition(1).z).toBeLessThan(pinPosition(2).z);
    expect(pinPosition(2).z).toBeLessThan(pinPosition(4).z);
    expect(pinPosition(4).z).toBeLessThan(pinPosition(7).z);
  });

  it('같은 줄의 핀은 z가 같다', () => {
    expect(pinPosition(7).z).toBeCloseTo(pinPosition(10).z, 10);
    expect(pinPosition(4).z).toBeCloseTo(pinPosition(6).z, 10);
  });
});

describe('pinLayout — 포켓', () => {
  it('오른손은 1-3번, 왼손은 1-2번 사이', () => {
    expect(pocketPins('right')).toEqual([1, 3]);
    expect(pocketPins('left')).toEqual([1, 2]);
  });

  it('포켓의 x는 손에 따라 부호가 반대다', () => {
    expect(pocketX('right')).toBeCloseTo(-pocketX('left'), 10);
  });

  it('포켓 중앙으로 들어가면 포켓 진입이다', () => {
    expect(isPocketHit(pocketX('right'), 'right')).toBe(true);
    expect(isPocketHit(pocketX('left'), 'left')).toBe(true);
  });

  it('레인 중앙(헤드핀 정면)은 포켓이 아니다', () => {
    expect(isPocketHit(0, 'right')).toBe(false);
    expect(isPocketHit(0, 'left')).toBe(false);
  });

  it('오른손 포켓 위치는 왼손잡이에게는 포켓이 아니다', () => {
    expect(isPocketHit(pocketX('right'), 'left')).toBe(false);
  });

  it('거터 쪽은 포켓이 아니다', () => {
    expect(isPocketHit(0.5, 'right')).toBe(false);
  });
});

describe('pinLayout — 보드와 화살표', () => {
  it('20번 보드가 레인 중앙', () => {
    expect(boardToX(20, 'right')).toBeCloseTo(0, 10);
    expect(boardToX(20, 'left')).toBeCloseTo(0, 10);
  });

  it('보드 번호는 주손 쪽에서 센다', () => {
    // 오른손잡이의 10번 보드는 중앙보다 오른쪽 = -x
    expect(boardToX(10, 'right')).toBeLessThan(0);
    expect(boardToX(10, 'left')).toBeGreaterThan(0);
  });

  it('보드 → x → 보드 왕복이 보존된다', () => {
    for (const hand of ['right', 'left'] as const) {
      for (let b = 1; b <= 39; b++) {
        expect(xToBoard(boardToX(b, hand), hand)).toBe(b);
      }
    }
  });

  it('2번 화살표는 주손 쪽에 있다', () => {
    expect(targetArrowX('right')).toBeLessThan(0);
    expect(targetArrowX('left')).toBeGreaterThan(0);
  });

  it('화살표 7개가 모두 레인 안에 있다', () => {
    const halfWidth = LANE.width / 2;
    for (let i = 1; i <= 7; i++) {
      expect(Math.abs(arrowX(i, 'right'))).toBeLessThan(halfWidth);
    }
  });

  it('4번 화살표가 가운데다', () => {
    expect(arrowX(4, 'right')).toBeCloseTo(0, 10);
  });
});

describe('pinLayout — 스플릿 판정', () => {
  it('헤드핀이 남아 있으면 스플릿이 아니다', () => {
    expect(isSplit([1, 7, 10])).toBe(false);
  });

  it('핀 하나만 남으면 스플릿이 아니다', () => {
    expect(isSplit([7])).toBe(false);
  });

  it('7-10은 스플릿', () => {
    expect(isSplit([7, 10])).toBe(true);
  });

  it('5-7은 스플릿', () => {
    expect(isSplit([5, 7])).toBe(true);
  });

  it('붙어 있는 2-3은 스플릿이 아니다', () => {
    expect(isSplit([2, 3])).toBe(false);
  });

  it('붙어 있는 9-10은 스플릿이 아니다', () => {
    expect(isSplit([9, 10])).toBe(false);
  });

  it('남은 핀이 없으면 스플릿이 아니다', () => {
    expect(isSplit([])).toBe(false);
  });
});

describe('pinLayout — 마스크 변환', () => {
  it('핀 목록 → 마스크 → 핀 목록 왕복', () => {
    const pins: PinNumber[] = [1, 5, 7, 10];
    expect(maskToPins(pinsToMask(pins))).toEqual(pins);
  });

  it('마스크는 항상 10칸', () => {
    expect(pinsToMask([1])).toHaveLength(10);
  });

  it('1번 핀은 0번 인덱스', () => {
    const mask = pinsToMask([1]);
    expect(mask[0]).toBe(true);
    expect(mask[1]).toBe(false);
  });

  it('빈 목록은 전부 false', () => {
    expect(pinsToMask([]).every((v) => v === false)).toBe(true);
  });
});
