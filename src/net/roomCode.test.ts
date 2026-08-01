import { describe, expect, it } from 'vitest';
import { createRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH } from './roomCode';

describe('createRoomCode', () => {
  it('길이가 정확하다', () => {
    for (let i = 0; i < 50; i++) {
      expect(createRoomCode()).toHaveLength(ROOM_CODE_LENGTH);
    }
  });

  it('헷갈리는 문자(0/O, 1/I)를 쓰지 않는다', () => {
    for (let i = 0; i < 200; i++) {
      const code = createRoomCode();
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it('스스로 만든 코드는 항상 정규화를 통과한다', () => {
    for (let i = 0; i < 50; i++) {
      const code = createRoomCode();
      expect(normalizeRoomCode(code)).toBe(code);
    }
  });
});

describe('normalizeRoomCode', () => {
  it('공백을 지우고 대문자로 바꾼다', () => {
    expect(normalizeRoomCode('  a2b3  ')).toBe('A2B3');
  });

  it('길이가 다르면 null', () => {
    expect(normalizeRoomCode('A2B')).toBeNull();
    expect(normalizeRoomCode('A2B34')).toBeNull();
    expect(normalizeRoomCode('')).toBeNull();
  });

  it('헷갈리는 문자가 들어 있으면 null', () => {
    expect(normalizeRoomCode('A0B3')).toBeNull();
    expect(normalizeRoomCode('AOB3')).toBeNull();
    expect(normalizeRoomCode('A1B3')).toBeNull();
    expect(normalizeRoomCode('AIB3')).toBeNull();
  });

  it('알파벳 밖의 문자가 들어 있으면 null', () => {
    expect(normalizeRoomCode('A2B!')).toBeNull();
  });
});
