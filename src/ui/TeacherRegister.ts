/**
 * 교사 계정 전용 — 학생 계정을 만든다.
 *
 * 학생은 이름을 스스로 짓지 않는다. 교사가 여기에 이름을 적어 두면(한 줄에
 * 한 명씩 — 엑셀·한글에서 명단을 복사해 그대로 붙여넣어도 된다), 서버
 * (register_student RPC)가 각자의 로그인 코드를 무작위로 만들어 돌려준다.
 * 학생은 자기 기기에서 그 코드를 "학생" 탭에 입력하기만 하면 된다
 * (PlayerPicker.submitStudent와 같은 login_student 경로를 그대로 탄다).
 *
 * 손은 여기서 묻지 않는다 — 학생이 자기 기기에서 처음 로그인할 때 고르는
 * 값이 항상 이기므로(PlayerPicker.submitStudent 참고), 여기서 정해 봤자 의미가
 * 없다.
 *
 * 교사 인증 코드는 로그인할 때(PlayerPicker) 이미 확인해 `players.current`에
 * 저장돼 있다 — 여기서 또 묻지 않고 그 값을 그대로 재사용한다. 등록마다
 * register_student RPC가 서버에서 다시 검증하므로, 클라이언트가 이 값을
 * 재사용하는 것만으로 쓰기 권한이 생기지는 않는다.
 */

import { registerStudent } from '../net/PlayerSync';
import { MAX_NAME_LENGTH, players } from '../players/PlayerStore';
import { escapeHtml } from '../util/html';

type RegisterOutcome = { name: string; code: string } | { name: string; error: string };

function errorLabel(error: string): string {
  return error === 'teacher_auth_failed' ? '인증 코드가 달라요.' : '등록하지 못했어요.';
}

export class TeacherRegister {
  readonly element: HTMLElement;
  private draftNames = '';
  private submitting = false;
  private registered: RegisterOutcome[] | null = null;

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
    this.draftNames = '';
    this.registered = null;
    this.element.hidden = false;
    this.render();
  }

  hide(): void {
    this.element.hidden = true;
  }

  private render(): void {
    this.element.innerHTML = this.registered === null ? this.formHtml() : this.doneHtml(this.registered);
    if (this.registered === null) {
      this.element.querySelector<HTMLTextAreaElement>('#student-names')?.focus();
    }
  }

  private formHtml(): string {
    return `
      <form class="panel" novalidate>
        <h1>학생 등록</h1>
        <p class="lead">이름을 한 줄에 한 명씩 적어 주세요. 여러 명이면 엑셀·한글에서
        명단을 복사해 그대로 붙여넣어도 돼요. 학생마다 로그인 코드를 만들어 드려요.</p>
        <label class="field">
          <span>학생 이름</span>
          <textarea id="student-names" name="names" rows="6"
                    placeholder="김민준&#10;박서연&#10;..." autocomplete="off">${escapeHtml(this.draftNames)}</textarea>
        </label>
        <p class="form-error" role="alert"></p>
        <div class="row-buttons">
          <button type="submit" class="primary-btn">등록하기</button>
          <button type="button" class="text-btn" data-close="1">닫기</button>
        </div>
      </form>
    `;
  }

  private doneHtml(results: RegisterOutcome[]): string {
    const rows = results
      .map((r) => {
        if ('code' in r) {
          return `
            <li class="register-row">
              <span class="student-name">${escapeHtml(r.name)}</span>
              <span class="register-code">${escapeHtml(r.code)}</span>
            </li>
          `;
        }
        return `
          <li class="register-row register-row--error">
            <span class="student-name">${escapeHtml(r.name)}</span>
            <span class="register-error">${escapeHtml(errorLabel(r.error))}</span>
          </li>
        `;
      })
      .join('');

    return `
      <div class="panel">
        <h1>등록했어요!</h1>
        <p class="lead">학생들에게 각자의 코드를 알려주세요. 자기 기기에서 "학생" 탭에
        코드를 입력하면 이어서 배울 수 있어요.</p>
        <ul class="register-list">${rows}</ul>
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
    if (!(target instanceof HTMLTextAreaElement)) return;
    if (target.id === 'student-names') this.draftNames = target.value;
  }

  private handleSubmit(e: Event): void {
    e.preventDefault();
    void this.submit();
  }

  private async submit(): Promise<void> {
    if (this.submitting) return;

    const namesInput = this.element.querySelector<HTMLTextAreaElement>('#student-names');
    const error = this.element.querySelector<HTMLElement>('.form-error');
    const submitBtn = this.element.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (namesInput === null || error === null) return;

    const teacher = players.current;
    if (teacher === null || teacher.isMaster !== true || teacher.teacherCode === undefined) {
      error.textContent = '선생님 계정으로 다시 들어와 주세요.';
      return;
    }

    const names = namesInput.value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (names.length === 0) {
      error.textContent = '이름을 한 명 이상 적어 주세요.';
      namesInput.focus();
      return;
    }
    const tooLong = names.filter((n) => n.length > MAX_NAME_LENGTH);
    if (tooLong.length > 0) {
      error.textContent = `이름은 ${MAX_NAME_LENGTH}자까지 쓸 수 있어요: ${tooLong.join(', ')}`;
      namesInput.focus();
      return;
    }

    this.submitting = true;
    error.textContent = '';
    const originalLabel = submitBtn?.textContent ?? '';
    if (submitBtn !== null) submitBtn.disabled = true;

    try {
      const results: RegisterOutcome[] = [];
      for (const [i, name] of names.entries()) {
        if (submitBtn !== null) submitBtn.textContent = `등록하는 중… (${i + 1}/${names.length})`;
        const result = await registerStudent(teacher.teacherCode, teacher.name, name);
        if (!result.ok && result.error === 'teacher_auth_failed') {
          // 같은 코드로 계속 시도해 봤자 전부 같은 이유로 실패한다 — 여기서 멈춘다.
          error.textContent = '인증 코드가 달라요. 선생님 계정으로 다시 들어와 주세요.';
          return;
        }
        results.push(result.ok ? { name, code: result.code } : { name, error: result.error });
      }
      this.registered = results;
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
