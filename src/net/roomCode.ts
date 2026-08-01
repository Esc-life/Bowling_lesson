/**
 * 온라인 대전 방 코드.
 *
 * 계정이 없으니 "누구와 연결할지"는 말로 불러줄 수 있는 짧은 코드로
 * 정한다. 헷갈리는 문자(0/O, 1/I)는 뺀다 — 초등학생이 소리 내어 읽고
 * 받아 적는 문자열이다.
 */

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;

export function createRoomCode(): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** 사람이 입력한 값을 방 코드 형식으로 정리한다. 형식이 아니면 null */
export function normalizeRoomCode(raw: string): string | null {
  const upper = raw.trim().toUpperCase();
  if (upper.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of upper) {
    if (!ALPHABET.includes(ch)) return null;
  }
  return upper;
}
