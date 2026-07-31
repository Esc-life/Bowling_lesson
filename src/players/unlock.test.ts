import { describe, it, expect } from 'vitest';
import { allLessons } from '../tutorial/curriculum';
import { emptyProgress } from '../tutorial/TutorialFlow';
import type { Player } from './types';
import { isGraduated, lessonCount, matchLockReason, practiceLockReason } from './unlock';

function player(name: string, completed: string[]): Player {
  return {
    id: name,
    name,
    handedness: 'right',
    progress: { ...emptyProgress(), completedLessons: completed },
    createdAt: 0,
  };
}

const ALL = allLessons().map((l) => l.lessonId);

describe('lessonCount', () => {
  it('전체 레슨 수를 센다', () => {
    expect(lessonCount(player('가', [])).total).toBe(ALL.length);
    expect(lessonCount(player('가', [])).done).toBe(0);
  });

  it('완료한 수를 센다', () => {
    expect(lessonCount(player('가', ALL.slice(0, 3))).done).toBe(3);
  });

  it('커리큘럼에 없는 레슨은 세지 않는다', () => {
    expect(lessonCount(player('가', ['없는레슨'])).done).toBe(0);
  });
});

describe('practiceLockReason', () => {
  it('다 못 배웠으면 남은 개수를 알려 준다', () => {
    const reason = practiceLockReason(player('가', ALL.slice(0, 7)));
    expect(reason).not.toBeNull();
    expect(reason).toContain(String(ALL.length));
    expect(reason).toContain('7');
  });

  it('하나만 남아도 잠겨 있다', () => {
    expect(practiceLockReason(player('가', ALL.slice(0, ALL.length - 1)))).not.toBeNull();
  });

  it('전부 배우면 열린다', () => {
    expect(practiceLockReason(player('가', ALL))).toBeNull();
    expect(isGraduated(player('가', ALL))).toBe(true);
  });
});

describe('matchLockReason', () => {
  it('2명 미만이면 잠긴다', () => {
    expect(matchLockReason([player('가', ALL)])).not.toBeNull();
  });

  it('5명 이상이면 잠긴다', () => {
    const five = ['가', '나', '다', '라', '마'].map((n) => player(n, ALL));
    expect(matchLockReason(five)).not.toBeNull();
  });

  it('전원 수료한 2~4명이면 열린다', () => {
    expect(matchLockReason([player('가', ALL), player('나', ALL)])).toBeNull();
    const four = ['가', '나', '다', '라'].map((n) => player(n, ALL));
    expect(matchLockReason(four)).toBeNull();
  });

  it('한 명이라도 못 배웠으면 그 사람 이름을 알려 준다', () => {
    const reason = matchLockReason([player('가', ALL), player('나', [])]);
    expect(reason).not.toBeNull();
    expect(reason).toContain('나');
  });

  it('여러 명이 못 배웠으면 이름을 모두 알려 준다', () => {
    const reason = matchLockReason([player('가', []), player('나', []), player('다', ALL)]);
    expect(reason).toContain('가');
    expect(reason).toContain('나');
  });
});
