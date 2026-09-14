import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProgressState } from '../tutorial/TutorialFlow';

const { rpcMock, clientRef } = vi.hoisted(() => {
  const rpcMock = vi.fn();
  const clientRef: { current: { rpc: typeof rpcMock } | null } = { current: { rpc: rpcMock } };
  return { rpcMock, clientRef };
});

vi.mock('./supabaseClient', () => ({
  getSupabaseClient: vi.fn(async () => clientRef.current),
}));

const { mergeProgress, loginStudent, saveStudentProgress, verifyTeacherCode, registerStudent, listStudents } =
  await import('./PlayerSync');

function progress(over: Partial<ProgressState> = {}): ProgressState {
  return { completedLessons: [], quizScores: {}, currentLessonId: null, ...over };
}

beforeEach(() => {
  rpcMock.mockReset();
  clientRef.current = { rpc: rpcMock };
});

describe('mergeProgress', () => {
  it('completedLessons를 합집합으로 합친다', () => {
    const merged = mergeProgress(
      progress({ completedLessons: ['A1', 'A2'] }),
      progress({ completedLessons: ['A2', 'A3'] }),
    );
    expect(merged.completedLessons.sort()).toEqual(['A1', 'A2', 'A3']);
  });

  it('레슨별로 정답률이 더 높은 퀴즈 점수를 남긴다', () => {
    const merged = mergeProgress(
      progress({ quizScores: { B1: { correct: 1, total: 5 } } }),
      progress({ quizScores: { B1: { correct: 4, total: 5 } } }),
    );
    expect(merged.quizScores['B1']).toEqual({ correct: 4, total: 5 });
  });

  it('local에 값이 있으면 currentLessonId는 local을 따른다', () => {
    const merged = mergeProgress(progress({ currentLessonId: 'C1' }), progress({ currentLessonId: 'D1' }));
    expect(merged.currentLessonId).toBe('C1');
  });

  it('local이 비어 있으면(새 기기) remote의 currentLessonId를 쓴다', () => {
    const merged = mergeProgress(progress({ currentLessonId: null }), progress({ currentLessonId: 'D1' }));
    expect(merged.currentLessonId).toBe('D1');
  });
});

describe('loginStudent', () => {
  it('Supabase 설정이 없으면 offline', async () => {
    clientRef.current = null;
    expect(await loginStudent('123456')).toEqual({ kind: 'offline' });
  });

  it('없는 코드면 not_found', async () => {
    rpcMock.mockResolvedValue({ data: [{ found: false, name: null, handedness: null, progress: null }], error: null });
    expect(await loginStudent('123456')).toEqual({ kind: 'not_found' });
  });

  it('맞으면 이름·손·진행률을 돌려준다', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          found: true,
          name: '민준',
          handedness: 'left',
          progress: { completedLessons: ['A1'], quizScores: {}, currentLessonId: 'A2' },
        },
      ],
      error: null,
    });
    expect(await loginStudent('123456')).toEqual({
      kind: 'ok',
      name: '민준',
      handedness: 'left',
      progress: { completedLessons: ['A1'], quizScores: {}, currentLessonId: 'A2' },
    });
  });

  it('RPC 에러는 offline으로 취급한다', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: '함수가 없음' } });
    expect(await loginStudent('123456')).toEqual({ kind: 'offline' });
  });
});

describe('saveStudentProgress', () => {
  it('Supabase 설정이 없으면 실패로 취급하되 예외는 안 던진다', async () => {
    clientRef.current = null;
    expect(await saveStudentProgress('123456', 'right', progress())).toEqual({ ok: false, error: 'offline' });
  });

  it('성공하면 ok', async () => {
    rpcMock.mockResolvedValue({ data: [{ ok: true, error: null }], error: null });
    expect(await saveStudentProgress('123456', 'right', progress())).toEqual({ ok: true });
  });

  it('없는 코드면 에러를 그대로 전달한다', async () => {
    rpcMock.mockResolvedValue({ data: [{ ok: false, error: 'not_found' }], error: null });
    expect(await saveStudentProgress('999999', 'right', progress())).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('verifyTeacherCode', () => {
  it('Supabase 설정이 없으면 false', async () => {
    clientRef.current = null;
    expect(await verifyTeacherCode('gusanteacher')).toBe(false);
  });

  it('맞으면 true', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    expect(await verifyTeacherCode('gusanteacher')).toBe(true);
  });

  it('틀리면 false', async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    expect(await verifyTeacherCode('wrong')).toBe(false);
  });

  it('RPC 에러도 false', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: '함수가 없음' } });
    expect(await verifyTeacherCode('x')).toBe(false);
  });
});

describe('registerStudent', () => {
  it('Supabase 설정이 없으면 offline 에러', async () => {
    clientRef.current = null;
    expect(await registerStudent('gusanteacher', '선생님', '민준')).toEqual({ ok: false, error: 'offline' });
  });

  it('성공하면 서버가 만든 코드를 돌려준다', async () => {
    rpcMock.mockResolvedValue({ data: [{ ok: true, code: '482913', error: null }], error: null });
    expect(await registerStudent('gusanteacher', '선생님', '민준')).toEqual({ ok: true, code: '482913' });
  });

  it('교사 인증 실패는 에러로 전달한다', async () => {
    rpcMock.mockResolvedValue({ data: [{ ok: false, code: null, error: 'teacher_auth_failed' }], error: null });
    expect(await registerStudent('wrong', '선생님', '민준')).toEqual({
      ok: false,
      error: 'teacher_auth_failed',
    });
  });
});

describe('listStudents', () => {
  it('Supabase 설정이 없으면 offline', async () => {
    clientRef.current = null;
    expect(await listStudents('gusanteacher', '선생님')).toEqual({ kind: 'offline' });
  });

  it('인증 코드가 틀리면 auth_failed', async () => {
    rpcMock.mockResolvedValue({
      data: [{ ok: false, code: null, name: null, handedness: null, progress: null, updated_at: null }],
      error: null,
    });
    expect(await listStudents('wrong', '선생님')).toEqual({ kind: 'auth_failed' });
  });

  it('학생이 없으면 빈 목록으로 성공', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    expect(await listStudents('gusanteacher', '선생님')).toEqual({ kind: 'ok', students: [] });
  });

  it('학생 목록을 코드와 함께 돌려준다', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          ok: true,
          code: '482913',
          name: '민준',
          handedness: 'left',
          progress: { completedLessons: ['A1'], quizScores: {}, currentLessonId: 'A2' },
          updated_at: '2026-08-02T00:00:00Z',
        },
      ],
      error: null,
    });
    expect(await listStudents('gusanteacher', '선생님')).toEqual({
      kind: 'ok',
      students: [
        {
          code: '482913',
          name: '민준',
          handedness: 'left',
          progress: { completedLessons: ['A1'], quizScores: {}, currentLessonId: 'A2' },
          updatedAt: '2026-08-02T00:00:00Z',
        },
      ],
    });
  });

  it('RPC 에러는 offline으로 취급한다', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: '함수가 없음' } });
    expect(await listStudents('gusanteacher', '선생님')).toEqual({ kind: 'offline' });
  });
});
