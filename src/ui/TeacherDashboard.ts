/**
 * 교사 계정 전용 — 자신이 register_student로 만든 학생들의 진행률을 본다.
 *
 * 교사 인증 코드는 로그인할 때(PlayerPicker) 이미 확인해 `players.current`에
 * 저장돼 있다 — 여기서 또 묻지 않고 그 값으로 열자마자 바로 불러온다.
 */

import { listStudents, type StudentRecord } from '../net/PlayerSync';
import { players } from '../players/PlayerStore';
import { allLessons } from '../tutorial/curriculum';
import { TutorialFlow } from '../tutorial/TutorialFlow';
import { escapeHtml } from '../util/html';

function lessonCountOf(progress: StudentRecord['progress']): { done: number; total: number } {
  const flow = new TutorialFlow(progress);
  const total = allLessons().length;
  const done = allLessons().filter((l) => flow.isCompleted(l.lessonId)).length;
  return { done, total };
}

function quizAverage(progress: StudentRecord['progress']): string {
  const scores = Object.values(progress.quizScores);
  if (scores.length === 0) return '퀴즈 기록 없음';
  const ratio = scores.reduce((sum, s) => sum + s.correct / s.total, 0) / scores.length;
  return `퀴즈 평균 ${Math.round(ratio * 100)}%`;
}

function formatUpdatedAt(iso: string): string {
  if (iso.length === 0) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; students: StudentRecord[] };

export class TeacherDashboard {
  readonly element: HTMLElement;
  private state: State = { kind: 'loading' };

  constructor(private readonly onClose: () => void) {
    this.element = document.createElement('div');
    this.element.className = 'overlay teacher-dashboard';
    this.element.hidden = true;
    this.element.addEventListener('click', (e) => this.handleClick(e));
    this.render();
  }

  show(): void {
    this.state = { kind: 'loading' };
    this.element.hidden = false;
    this.render();
    void this.load();
  }

  hide(): void {
    this.element.hidden = true;
  }

  private render(): void {
    this.element.innerHTML =
      this.state.kind === 'ok'
        ? this.listHtml(this.state.students)
        : this.state.kind === 'error'
          ? this.errorHtml(this.state.message)
          : this.loadingHtml();
  }

  private loadingHtml(): string {
    return `
      <div class="panel">
        <h1>학생 기록</h1>
        <p class="lead">불러오는 중…</p>
      </div>
    `;
  }

  private errorHtml(message: string): string {
    return `
      <div class="panel">
        <h1>학생 기록</h1>
        <p class="form-error" role="alert">${escapeHtml(message)}</p>
        <div class="row-buttons">
          <button type="button" class="text-btn" data-close="1">닫기</button>
        </div>
      </div>
    `;
  }

  private listHtml(students: StudentRecord[]): string {
    const rows =
      students.length === 0
        ? '<p class="note">아직 등록한 학생이 없어요.</p>'
        : `<ul class="student-list">${students
            .map((s) => {
              const { done, total } = lessonCountOf(s.progress);
              const handLabel = s.handedness === 'left' ? '왼손' : '오른손';
              const updated = formatUpdatedAt(s.updatedAt);
              return `
                <li class="student-row">
                  <span class="student-name">${escapeHtml(s.name)} <span class="student-code">코드 ${escapeHtml(s.code)}</span></span>
                  <span class="student-meta">
                    ${handLabel} · ${done}/${total} 배움 · ${escapeHtml(quizAverage(s.progress))}
                    ${updated.length > 0 ? `· ${escapeHtml(updated)} 갱신` : ''}
                  </span>
                </li>
              `;
            })
            .join('')}</ul>`;

    return `
      <div class="panel">
        <h1>학생 기록</h1>
        ${rows}
        <div class="row-buttons">
          <button type="button" class="text-btn" data-close="1">닫기</button>
        </div>
      </div>
    `;
  }

  private handleClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-close]');
    if (el === null) return;
    this.onClose();
  }

  private async load(): Promise<void> {
    const teacher = players.current;
    if (teacher === null || teacher.isMaster !== true || teacher.teacherCode === undefined) {
      this.state = { kind: 'error', message: '선생님 계정으로 다시 들어와 주세요.' };
      this.render();
      return;
    }

    const result = await listStudents(teacher.teacherCode, teacher.name);
    if (result.kind === 'offline') {
      this.state = { kind: 'error', message: '지금은 확인할 수 없어요. 인터넷 연결을 확인해 주세요.' };
      this.render();
      return;
    }
    if (result.kind === 'auth_failed') {
      this.state = { kind: 'error', message: '인증 코드가 달라요. 선생님 계정으로 다시 들어와 주세요.' };
      this.render();
      return;
    }
    this.state = { kind: 'ok', students: result.students };
    this.render();
  }
}
