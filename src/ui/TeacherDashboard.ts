/**
 * 교사 계정 전용 — 자신이 register_student로 만든 학생들의 진행률을 본다.
 *
 * TeacherRegister와 같은 원칙 — 비밀번호는 여기서도 매번 새로 입력받아
 * 서버(list_students RPC)에서 검증한다. 학생이 스스로 만든 계정(교사가
 * 만들지 않은 계정)은 소속이 없어 목록에 나오지 않는다 — 자기 진행률을
 * 아무 교사나 볼 수 있으면 안 되기 때문에 의도한 동작이다.
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

export class TeacherDashboard {
  readonly element: HTMLElement;
  private draftPassword = '';
  private submitting = false;
  private state: { kind: 'form' } | { kind: 'error'; message: string } | { kind: 'ok'; students: StudentRecord[] } = {
    kind: 'form',
  };

  constructor(private readonly onClose: () => void) {
    this.element = document.createElement('div');
    this.element.className = 'overlay teacher-dashboard';
    this.element.hidden = true;
    this.element.addEventListener('click', (e) => this.handleClick(e));
    this.element.addEventListener('submit', (e) => this.handleSubmit(e));
    this.element.addEventListener('input', (e) => this.handleInput(e));
    this.render();
  }

  show(): void {
    this.draftPassword = '';
    this.state = { kind: 'form' };
    this.element.hidden = false;
    this.render();
  }

  hide(): void {
    this.element.hidden = true;
  }

  private render(): void {
    this.element.innerHTML = this.state.kind === 'ok' ? this.listHtml(this.state.students) : this.formHtml();
    if (this.state.kind !== 'ok') {
      this.element.querySelector<HTMLInputElement>('#dashboard-password')?.focus();
    }
  }

  private formHtml(): string {
    const error = this.state.kind === 'error' ? this.state.message : '';
    return `
      <form class="panel" novalidate>
        <h1>학생 기록 보기</h1>
        <p class="lead">내가 등록한 학생들의 진행률을 확인해요. 비밀번호를 다시 확인할게요.</p>
        <label class="field">
          <span>선생님 비밀번호</span>
          <input id="dashboard-password" name="password" type="password" autocomplete="off"
                 value="${escapeHtml(this.draftPassword)}">
        </label>
        <p class="form-error" role="alert">${escapeHtml(error)}</p>
        <div class="row-buttons">
          <button type="submit" class="primary-btn">확인</button>
          <button type="button" class="text-btn" data-close="1">닫기</button>
        </div>
      </form>
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
                  <span class="student-name">${escapeHtml(s.name)}</span>
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

  private handleInput(e: Event): void {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id === 'dashboard-password') this.draftPassword = target.value;
  }

  private handleSubmit(e: Event): void {
    e.preventDefault();
    void this.submit();
  }

  private async submit(): Promise<void> {
    if (this.submitting) return;

    const passwordInput = this.element.querySelector<HTMLInputElement>('#dashboard-password');
    const submitBtn = this.element.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (passwordInput === null) return;

    const teacher = players.current;
    if (teacher === null || teacher.isMaster !== true) {
      this.state = { kind: 'error', message: '선생님 계정으로 다시 들어와 주세요.' };
      this.render();
      return;
    }

    const password = passwordInput.value;
    if (password.length === 0) {
      this.state = { kind: 'error', message: '비밀번호를 입력해 주세요.' };
      this.render();
      return;
    }

    this.submitting = true;
    const originalLabel = submitBtn?.textContent ?? '';
    if (submitBtn !== null) {
      submitBtn.disabled = true;
      submitBtn.textContent = '확인하는 중…';
    }

    try {
      const result = await listStudents(teacher.name, password);
      if (result.kind === 'offline') {
        this.state = { kind: 'error', message: '지금은 확인할 수 없어요. 인터넷 연결을 확인해 주세요.' };
        this.render();
        return;
      }
      if (result.kind === 'auth_failed') {
        this.state = { kind: 'error', message: '비밀번호가 달라요.' };
        this.render();
        return;
      }
      this.state = { kind: 'ok', students: result.students };
      this.render();
    } finally {
      this.submitting = false;
      if (submitBtn !== null) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    }
  }
}
