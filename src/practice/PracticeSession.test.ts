import { describe, it, expect } from 'vitest';
import { PracticeSession } from './PracticeSession';

describe('PracticeSession', () => {
  it('기본 랙은 핀 10개다', () => {
    expect(new PracticeSession().rack).toHaveLength(10);
  });

  it('빈 랙은 거부한다', () => {
    expect(() => new PracticeSession([])).toThrow();
  });

  it('랙을 정렬해 보관한다', () => {
    const s = new PracticeSession([7, 1, 3]);
    expect(s.rack).toEqual([1, 3, 7]);
  });

  it('같은 핀이 두 번 오면 한 번만 센다', () => {
    expect(new PracticeSession([1, 1, 3]).rack).toEqual([1, 3]);
  });

  it('투구 횟수와 누적 핀을 센다', () => {
    const s = new PracticeSession();
    s.record(7);
    s.record(10);
    expect(s.throws).toBe(2);
    expect(s.knockedTotal).toBe(17);
    expect(s.lastKnocked).toBe(10);
  });

  it('랙보다 많이 쓰러뜨렸다고 하면 거부한다', () => {
    const s = new PracticeSession([1, 3]);
    expect(() => s.record(3)).toThrow();
  });

  it('전부 쓰러뜨리면 다르게 알려 준다', () => {
    const s = new PracticeSession([1, 3]);
    s.record(2);
    expect(s.lastMessage).toContain('전부');
  });

  it('일부만 쓰러뜨리면 개수를 알려 준다', () => {
    const s = new PracticeSession();
    s.record(7);
    expect(s.lastMessage).toBe('10개 중 7개');
  });

  it('하나도 못 맞히면 다시 해 보자고 한다', () => {
    const s = new PracticeSession();
    s.record(0);
    expect(s.lastMessage).toContain('다시');
  });

  it('랙을 바꾸면 기록이 초기화된다', () => {
    const s = new PracticeSession();
    s.record(5);
    s.setRack([1, 2, 3]);
    expect(s.throws).toBe(0);
    expect(s.lastKnocked).toBeNull();
  });

  it('reset은 기록만 지우고 랙은 남긴다', () => {
    const s = new PracticeSession([1, 3]);
    s.record(1);
    s.reset();
    expect(s.throws).toBe(0);
    expect(s.rack).toEqual([1, 3]);
  });
});
