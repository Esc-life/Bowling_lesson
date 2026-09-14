/**
 * 교사 계정 전용 — 학생 계정을 만든다.
 *
 * 학생은 이름을 스스로 짓지 않는다. 교사가 여기서 학생 이름만 정하면,
 * 서버(register_student RPC)가 로그인 코드를 무작위로 만들어 돌려준다.
 * 학생은 자기 기기에서 그 코드를 "학생" 탭에 입력하기만 하면 된다
 * (PlayerPicker.submitStudent와 같은 login_student 경로를 그대로 탄다).
 *
 * 손은 여기서 묻지 않는다 — 학생이 자기 기기에서 처음 로그인할 때 고르는
 * 값이 항상 이기므로(PlayerPicker.submitStudent 참고), 여기서 정해 봤자 의미가
 * 없다.
 *
 * 교사 인증 코드는 이 화면에서마다 다시 입력받는다 — isMaster 로그인 때 확인한
 * 코드를 어디에도 캐시해 두지 않기 때문(PlayerPicker의 재인증 방식과 같은
 * 원칙). register_student RPC가 서버에서 다시 확인하고, 성공한 학생 행에만
 * 이 교사 이름을 소유자로 남긴다 — TeacherDashboard가 그 소유 관계로 학생
 * 목록을 조회한다.
 */

import { registerStudent } from '../net/PlayerSync';
import { MAX_NAME_LENGTH, players } from '../players/PlayerStore';
import { escapeHtml } from '../util/html';

export class TeacherRegister {
  readonly element: HTMLElement;
  private draftName = '';
  private draftTeacherCode = '';
  private submitting = false;
  private registered: { name: string; code: string } | null = null;

  constructor(private readonly onClose: () => void) {
    this.element = document.createElement('div');
    this.element.className = 'overlay teacher-register';
    this.element.hidden = true;
    this.element.addEventListener('click', (e) => this.handleClick(e));
    this.element.addEventListener('submit', (e) => this.handleSubmit(e));
    this.element.addEventListener('input', (e) => this.handleInput(e));
    this.render();
  }

  show(): void {
    this.draftName = '';
    this.draftTeacherCode = '';
    this.registered = null;
    this.element.hidden = false;
    this.render();
  }

  hide(): void {
    this.element.hidden = true;
  }

  private render(): void {
    this.element.innerHTML = this.registered === null ? this.formHtml() : this.doneHtml();
    if (this.registered === null) {
      this.element.querySelector<HTMLInputElement>('#student-name')?.focus();
    }
  }

  private formHtml(): string {
    return `
      <form class="panel" novalidate>
        <h1>학생 등록</h1>
        <p class="lead">이름을 적어 두면 로그인 코드를 만들어 드려요. 학생은 자기 기기에서
        "학생" 탭에 그 코드를 입력해 이어서 배울 수 있어요.</p>
        <label class="field">
          <span>학생 이름</span>
          <input id="student-name" name="name" type="text" maxlength="${MAX_NAME_LENGTH}"
                 autocomplete="off" placeholder="이름을 적어 주세요" value="${escapeHtml(this.draftName)}">
        </label>
        <label class="field">
          <span>선생님 인증 코드 확인</span>
          <input id="teacher-code" name="teacherCode" type="password"
                 autocomplete="off" value="${escapeHtml(this.draftTeacherCode)}">
        </label>
        <p class="form-error" role="alert"></p>
        <div class="row-buttons">
          <button type="submit" class="primary-btn">등록하기</button>
          <button type="button" class="text-btn" data-close="1">닫기</button>
        </div>
      </form>
    `;
  }

  private doneHtml(): string {
    const name = escapeHtml(this.registered?.name ?? '');
    const code = escapeHtml(this.registered?.code ?? '');
    return `
      <div class="panel">
        <h1>등록했어요!</h1>
        <p class="lead">${name} 학생에게 이 코드를 알려주세요.</p>
        <p class="student-pin-display">${code}</p>
        <p class="note">학생 기기에서 "학생" 탭에 이 코드를 입력하면 돼요.</p>
        <div class="row-buttons">
          <button type="button" class="primary-btn" data-again="1">다른 학생 등록하기</button>
          <button type="button" class="text-btn" data-close="1">닫기</button>
        </div>
      </div>
    `;
  }

  private handleClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-close],[data-again]');
    if (el === null) return;
    const d = el.dataset;

    if (d['close'] !== undefined) {
      this.onClose();
      return;
    }
    if (d['again'] !== undefined) {
      this.show();
      return;
    }
  }

  private handleInput(e: Event): void {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id === 'student-name') this.draftName = target.value;
    if (target.id === 'teacher-code') this.draftTeacherCode = target.value;
  }

  private handleSubmit(e: Event): void {
    e.preventDefault();
    void this.submit();
  }

  private async submit(): Promise<void> {
    if (this.submitting) return;

    const nameInput = this.element.querySelector<HTMLInputElement>('#student-name');
    const codeInput = this.element.querySelector<HTMLInputElement>('#teacher-code');
    const error = this.element.querySelector<HTMLElement>('.form-error');
    const submitBtn = this.element.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (nameInput === null || codeInput === null || error === null) return;

    const teacher = players.current;
    if (teacher === null || teacher.isMaster !== true) {
      error.textContent = '선생님 계정으로 다시 들어와 주세요.';
      return;
    }

    const name = nameInput.value.trim();
    if (name.length === 0) {
      error.textContent = '이름을 적어 주세요.';
      nameInput.focus();
      return;
    }
    if (name.length > MAX_NAME_LENGTH) {
      error.textContent = `이름은 ${MAX_NAME_LENGTH}자까지 쓸 수 있어요.`;
      nameInput.focus();
      return;
    }
    const teacherCode = codeInput.value.trim();
    if (teacherCode.length === 0) {
      error.textContent = '선생님 인증 코드를 입력해 주세요.';
      codeInput.focus();
      return;
    }

    this.submitting = true;
    error.textContent = '';
    const originalLabel = submitBtn?.textContent ?? '';
    if (submitBtn !== null) {
      submitBtn.disabled = true;
      submitBtn.textContent = '등록하는 중…';
    }

    try {
      const result = await registerStudent(teacherCode, teacher.name, name);
      if (!result.ok) {
        error.textContent =
          result.error === 'teacher_auth_failed'
            ? '인증 코드가 달라요.'
            : '지금은 등록할 수 없어요. 인터넷 연결을 확인해 주세요.';
        return;
      }
      this.registered = { name, code: result.code };
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
