/**
 * 교사 계정 전용 — 학생 계정을 미리 만들어 둔다.
 *
 * 지금까지는 학생이 스스로 이름+PIN을 만드는 방법뿐이었다. 이 화면은
 * 그 방식을 없애지 않고 하나 더 얹는다 — 교사가 여기서 이름+번호를
 * 만들어 두면, 학생은 자기 기기에서 "다른 기기와 이어서 쓰기"를 켜고
 * 그 이름+번호를 그대로 입력해 들어오면 된다(PlayerPicker.syncOnEntry와
 * 같은 pull_player 경로를 그대로 탄다).
 *
 * 손은 여기서 묻지 않는다 — 학생이 자기 기기에서 처음 들어올 때 고르는
 * 값이 항상 이기므로(PlayerPicker.submit 참고), 여기서 정해 봤자 의미가
 * 없다. 'right'는 그 자리를 채우기 위한 자리표시자일 뿐이다.
 *
 * 교사 비밀번호는 이 화면에서마다 다시 입력받는다 — isMaster 로그인 때
 * 검증한 비밀번호를 어디에도 캐시해 두지 않기 때문(PlayerPicker의 재인증
 * 방식과 같은 원칙). register_student RPC가 서버에서 다시 검증하고,
 * 성공한 학생 행에만 이 교사 이름을 소유자로 남긴다 — TeacherDashboard가
 * 그 소유 관계로 학생 목록을 조회한다.
 */

import { registerStudent } from '../net/PlayerSync';
import { MAX_NAME_LENGTH, players } from '../players/PlayerStore';
import { escapeHtml } from '../util/html';

function randomPin(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

export class TeacherRegister {
  readonly element: HTMLElement;
  private draftName = '';
  private draftPin = randomPin();
  private draftPassword = '';
  private submitting = false;
  private registered: { name: string; pin: string } | null = null;

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
    this.draftPin = randomPin();
    this.draftPassword = '';
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
        <p class="lead">이름과 번호를 정해 두면, 학생은 자기 기기에서 "다른 기기와 이어서 쓰기"를 켜고
        같은 이름·번호를 입력해 이어서 배울 수 있어요.</p>
        <label class="field">
          <span>학생 이름</span>
          <input id="student-name" name="name" type="text" maxlength="${MAX_NAME_LENGTH}"
                 autocomplete="off" placeholder="이름을 적어 주세요" value="${escapeHtml(this.draftName)}">
        </label>
        <label class="field field--pin">
          <span>번호 4자리</span>
          <input id="student-pin" name="pin" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4"
                 autocomplete="off" value="${escapeHtml(this.draftPin)}">
        </label>
        <button type="button" class="text-btn" data-regen-pin="1">번호 다시 만들기</button>
        <label class="field">
          <span>선생님 비밀번호 확인</span>
          <input id="teacher-password" name="teacherPassword" type="password"
                 autocomplete="off" value="${escapeHtml(this.draftPassword)}">
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
    const pin = escapeHtml(this.registered?.pin ?? '');
    return `
      <div class="panel">
        <h1>등록했어요!</h1>
        <p class="lead">${name} 학생에게 이 번호를 알려주세요.</p>
        <p class="student-pin-display">${pin}</p>
        <p class="note">학생 기기에서 "다른 기기와 이어서 쓰기"를 켜고 이름 "${name}"과 이 번호를 입력하면 돼요.</p>
        <div class="row-buttons">
          <button type="button" class="primary-btn" data-again="1">다른 학생 등록하기</button>
          <button type="button" class="text-btn" data-close="1">닫기</button>
        </div>
      </div>
    `;
  }

  private handleClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-close],[data-again],[data-regen-pin]');
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
    if (d['regenPin'] !== undefined) {
      this.draftPin = randomPin();
      const input = this.element.querySelector<HTMLInputElement>('#student-pin');
      if (input !== null) input.value = this.draftPin;
      return;
    }
  }

  private handleInput(e: Event): void {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id === 'student-name') this.draftName = target.value;
    if (target.id === 'student-pin') this.draftPin = target.value;
    if (target.id === 'teacher-password') this.draftPassword = target.value;
  }

  private handleSubmit(e: Event): void {
    e.preventDefault();
    void this.submit();
  }

  private async submit(): Promise<void> {
    if (this.submitting) return;

    const nameInput = this.element.querySelector<HTMLInputElement>('#student-name');
    const pinInput = this.element.querySelector<HTMLInputElement>('#student-pin');
    const passwordInput = this.element.querySelector<HTMLInputElement>('#teacher-password');
    const error = this.element.querySelector<HTMLElement>('.form-error');
    const submitBtn = this.element.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (nameInput === null || pinInput === null || passwordInput === null || error === null) return;

    const teacherName = players.current;
    if (teacherName === null || teacherName.isMaster !== true) {
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
    const pin = pinInput.value.trim();
    if (!/^\d{4}$/.test(pin)) {
      error.textContent = '번호 4자리를 숫자로 적어 주세요.';
      pinInput.focus();
      return;
    }
    const password = passwordInput.value;
    if (password.length === 0) {
      error.textContent = '선생님 비밀번호를 입력해 주세요.';
      passwordInput.focus();
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
      const result = await registerStudent(teacherName.name, password, name, pin);
      if (!result.ok) {
        error.textContent =
          result.error === 'name_taken'
            ? '이미 있는 이름이에요. 다른 이름을 써 주세요.'
            : result.error === 'teacher_auth_failed'
              ? '비밀번호가 달라요.'
              : '지금은 등록할 수 없어요. 인터넷 연결을 확인해 주세요.';
        return;
      }
      this.registered = { name, pin };
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
