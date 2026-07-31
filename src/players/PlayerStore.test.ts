import { describe, it, expect } from 'vitest';
import { PlayerStore, checkName, memoryStorage } from './PlayerStore';
import { emptyProgress } from '../tutorial/TutorialFlow';

describe('checkName', () => {
  it('앞뒤 공백을 지운다', () => {
    const r = checkName('  민준  ', []);
    expect(r).toEqual({ ok: true, name: '민준' });
  });

  it('빈 이름을 거부한다', () => {
    expect(checkName('   ', []).ok).toBe(false);
  });

  it('12자를 넘으면 거부한다', () => {
    expect(checkName('가'.repeat(13), []).ok).toBe(false);
    expect(checkName('가'.repeat(12), []).ok).toBe(true);
  });

  it('중복 이름을 거부한다', () => {
    const store = new PlayerStore(memoryStorage());
    store.create('민준', 'right');
    const r = checkName('민준', store.players);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('이미');
  });

  it('공백만 다른 이름도 중복으로 본다', () => {
    const store = new PlayerStore(memoryStorage());
    store.create('민준', 'right');
    expect(checkName(' 민준 ', store.players).ok).toBe(false);
  });
});

describe('PlayerStore — 생성과 선택', () => {
  it('처음에는 아무도 없다', () => {
    const store = new PlayerStore(memoryStorage());
    expect(store.players).toHaveLength(0);
    expect(store.current).toBeNull();
  });

  it('만들면 현재 플레이어가 된다', () => {
    const store = new PlayerStore(memoryStorage());
    const p = store.create('민준', 'left');
    expect(p.name).toBe('민준');
    expect(p.handedness).toBe('left');
    expect(store.current?.id).toBe(p.id);
  });

  it('잘못된 이름은 거부한다', () => {
    const store = new PlayerStore(memoryStorage());
    expect(() => store.create('  ', 'right')).toThrow();
  });

  it('저장소에 남아 다시 읽힌다', () => {
    const storage = memoryStorage();
    const first = new PlayerStore(storage);
    const p = first.create('민준', 'right');

    const second = new PlayerStore(storage);
    expect(second.players).toHaveLength(1);
    expect(second.current?.id).toBe(p.id);
  });

  it('없는 id를 고르면 거부한다', () => {
    const store = new PlayerStore(memoryStorage());
    expect(() => store.select('없음')).toThrow();
  });
});

describe('PlayerStore — 삭제', () => {
  it('지우면 목록에서 사라진다', () => {
    const store = new PlayerStore(memoryStorage());
    const a = store.create('가', 'right');
    store.create('나', 'right');
    store.remove(a.id);
    expect(store.players.map((p) => p.name)).toEqual(['나']);
  });

  it('현재 플레이어를 지우면 다른 사람이 현재가 된다', () => {
    const store = new PlayerStore(memoryStorage());
    store.create('가', 'right');
    const b = store.create('나', 'right');
    store.remove(b.id);
    expect(store.current?.name).toBe('가');
  });

  it('마지막 한 명을 지우면 현재가 없어진다', () => {
    const store = new PlayerStore(memoryStorage());
    const a = store.create('가', 'right');
    store.remove(a.id);
    expect(store.players).toHaveLength(0);
    expect(store.current).toBeNull();
  });
});

describe('PlayerStore — 진행률', () => {
  it('사람마다 진행률이 따로 간다', () => {
    const store = new PlayerStore(memoryStorage());
    const a = store.create('가', 'right');
    const b = store.create('나', 'right');

    store.saveProgress(a.id, { ...emptyProgress(), completedLessons: ['A1', 'A2'] });

    expect(store.players.find((p) => p.id === a.id)!.progress.completedLessons).toEqual(['A1', 'A2']);
    expect(store.players.find((p) => p.id === b.id)!.progress.completedLessons).toEqual([]);
  });

  it('진행률도 저장소에 남는다', () => {
    const storage = memoryStorage();
    const first = new PlayerStore(storage);
    const a = first.create('가', 'right');
    first.saveProgress(a.id, { ...emptyProgress(), completedLessons: ['B1'] });

    const second = new PlayerStore(storage);
    expect(second.current!.progress.completedLessons).toEqual(['B1']);
  });
});

describe('PlayerStore — 구버전 이관', () => {
  const legacy = {
    'bowling3d.progress.v1': JSON.stringify({
      completedLessons: ['A1', 'A2', 'A3'],
      quizScores: { A2: { correct: 2, total: 3 } },
      currentLessonId: 'B1',
    }),
    'bowling3d.settings.v1': JSON.stringify({ handedness: 'left', difficulty: 'easy' }),
  };

  it('옛 진행률이 있으면 이관 대기 상태가 된다', () => {
    const store = new PlayerStore(memoryStorage(legacy));
    expect(store.pendingMigration).toBe(true);
    expect(store.players).toHaveLength(0);
  });

  it('첫 플레이어를 만들면 옛 진행률을 물려받는다', () => {
    const store = new PlayerStore(memoryStorage(legacy));
    const p = store.create('민준', 'left');
    expect(p.progress.completedLessons).toEqual(['A1', 'A2', 'A3']);
    expect(p.progress.quizScores['A2']).toEqual({ correct: 2, total: 3 });
  });

  it('손은 화면에서 고른 값이 이긴다 — 옛 설정이 있어도', () => {
    // 옛 설정은 'left'다. 화면에서 오른손을 골랐으면 오른손이어야 한다.
    // 손을 나중에 바꾸는 화면이 없으므로, 여기서 지면 되돌릴 방법이 없다.
    const store = new PlayerStore(memoryStorage(legacy));
    expect(store.create('민준', 'right').handedness).toBe('right');
  });

  it('옛 손을 초기 선택용으로 알려 준다', () => {
    const store = new PlayerStore(memoryStorage(legacy));
    expect(store.pendingHandedness).toBe('left');
    store.create('민준', 'right');
    // 이관이 끝나면 더는 물려줄 값이 없다
    expect(store.pendingHandedness).toBeNull();
  });

  it('옛 설정이 없으면 물려줄 손도 없다', () => {
    const store = new PlayerStore(
      memoryStorage({ 'bowling3d.progress.v1': legacy['bowling3d.progress.v1'] }),
    );
    expect(store.pendingMigration).toBe(true);
    expect(store.pendingHandedness).toBeNull();
  });

  it('이관 후에는 옛 키를 지우고 대기 상태가 풀린다', () => {
    const storage = memoryStorage(legacy);
    const store = new PlayerStore(storage);
    store.create('민준', 'right');
    expect(store.pendingMigration).toBe(false);
    expect(storage.getItem('bowling3d.progress.v1')).toBeNull();
  });

  it('두 번째 플레이어는 옛 진행률을 받지 않는다', () => {
    const store = new PlayerStore(memoryStorage(legacy));
    store.create('민준', 'right');
    const second = store.create('서연', 'right');
    expect(second.progress.completedLessons).toEqual([]);
  });

  it('옛 데이터가 없으면 이관 대기가 아니다', () => {
    expect(new PlayerStore(memoryStorage()).pendingMigration).toBe(false);
  });
});

describe('PlayerStore — 깨진 데이터', () => {
  it('JSON이 아니면 빈 목록으로 시작한다', () => {
    const store = new PlayerStore(memoryStorage({ 'bowling3d.players.v1': '{{{' }));
    expect(store.players).toHaveLength(0);
  });

  it('모양이 이상한 항목은 걸러낸다', () => {
    const storage = memoryStorage({
      'bowling3d.players.v1': JSON.stringify({
        players: [
          { id: 'a', name: '가', handedness: 'right', progress: emptyProgress(), createdAt: 1 },
          { id: 'b' },
          null,
          { id: 'c', name: '', handedness: 'right', progress: emptyProgress(), createdAt: 2 },
        ],
        lastPlayerId: 'a',
      }),
    });
    const store = new PlayerStore(storage);
    expect(store.players.map((p) => p.name)).toEqual(['가']);
  });

  it('quizScores가 null이어도 배운 레슨은 살아남는다', () => {
    // typeof null === 'object'라 그냥 통과시키면 Object.entries(null)에서
    // 터져 앱이 아예 안 뜬다. 그렇다고 진행률을 통째로 버리면 배운 것이
    // 조용히 사라진다 — 깨진 필드만 비우고 나머지는 지킨다.
    const storage = memoryStorage({
      'bowling3d.players.v1': JSON.stringify({
        players: [
          {
            id: 'a',
            name: '가',
            handedness: 'right',
            progress: { completedLessons: ['A1'], quizScores: null, currentLessonId: 'A2' },
            createdAt: 1,
          },
        ],
        lastPlayerId: 'a',
      }),
    });
    const store = new PlayerStore(storage);
    expect(store.current!.progress.quizScores).toEqual({});
    expect(store.current!.progress.completedLessons).toEqual(['A1']);
    expect(store.current!.progress.currentLessonId).toBe('A2');
  });

  it('completedLessons가 배열이 아니어도 퀴즈 점수는 살아남는다', () => {
    const storage = memoryStorage({
      'bowling3d.players.v1': JSON.stringify({
        players: [
          {
            id: 'a',
            name: '가',
            handedness: 'right',
            progress: {
              completedLessons: '망가짐',
              quizScores: { A2: { correct: 2, total: 3 } },
              currentLessonId: null,
            },
            createdAt: 1,
          },
        ],
        lastPlayerId: 'a',
      }),
    });
    const store = new PlayerStore(storage);
    expect(store.current!.progress.completedLessons).toEqual([]);
    expect(store.current!.progress.quizScores['A2']).toEqual({ correct: 2, total: 3 });
  });

  it('각 필드에 쓰레기가 섞여도 멀쩡한 항목만 남는다', () => {
    const storage = memoryStorage({
      'bowling3d.players.v1': JSON.stringify({
        players: [
          {
            id: 'a',
            name: '가',
            handedness: 'right',
            progress: {
              completedLessons: ['A1', 42, null, 'A2'],
              quizScores: { A1: { correct: 1, total: 2 }, B1: null, C1: { correct: 1 } },
              currentLessonId: 7,
            },
            createdAt: 1,
          },
        ],
        lastPlayerId: 'a',
      }),
    });
    const store = new PlayerStore(storage);
    expect(store.current!.progress.completedLessons).toEqual(['A1', 'A2']);
    expect(Object.keys(store.current!.progress.quizScores)).toEqual(['A1']);
    expect(store.current!.progress.currentLessonId).toBeNull();
  });

  it('옛 진행률의 quizScores가 null이어도 배운 레슨은 이관한다', () => {
    const store = new PlayerStore(
      memoryStorage({
        'bowling3d.progress.v1': JSON.stringify({
          completedLessons: ['A1'],
          quizScores: null,
        }),
      }),
    );
    expect(store.pendingMigration).toBe(true);
    expect(store.create('민준', 'right').progress.completedLessons).toEqual(['A1']);
  });

  it('옛 진행률에 물려줄 것이 하나도 없으면 이관 안내를 띄우지 않는다', () => {
    const store = new PlayerStore(
      memoryStorage({
        'bowling3d.progress.v1': JSON.stringify({ completedLessons: [], quizScores: {} }),
      }),
    );
    expect(store.pendingMigration).toBe(false);
  });

  it('lastPlayerId가 없는 사람을 가리키면 첫 사람을 고른다', () => {
    const storage = memoryStorage({
      'bowling3d.players.v1': JSON.stringify({
        players: [
          { id: 'a', name: '가', handedness: 'right', progress: emptyProgress(), createdAt: 1 },
        ],
        lastPlayerId: '없음',
      }),
    });
    expect(new PlayerStore(storage).current?.name).toBe('가');
  });
});

describe('PlayerStore — 구독', () => {
  it('바뀔 때마다 알린다', () => {
    const store = new PlayerStore(memoryStorage());
    let calls = 0;
    const off = store.subscribe(() => { calls++; });
    store.create('가', 'right');
    expect(calls).toBe(1);
    off();
    store.create('나', 'right');
    expect(calls).toBe(1);
  });
});
