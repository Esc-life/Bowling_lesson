/**
 * 시작 화면 — 로그인.
 *
 * 계정은 교사만 만든다(TeacherRegister). 여기서는 학생이 그 코드로 로그인하거나,
 * 교사가 인증 코드로 들어온다 — 둘 다 이 기기 로컬 목록에 남아 다음부터는
 * 목록에서 골라 다시 인증(코드/인증 코드)하면 된다.
 *
 * 삭제는 진행률까지 함께 지우므로 두 단계로 확인한다. 영역 메뉴의
 * 초기화가 같은 방식이라 패턴을 맞췄다.
 */

import { loginStudent, mergeProgress, verifyTeacherCode } from '../net/PlayerSync';
import { checkName, players } from '../players/PlayerStore';
import type { Player } from '../players/types';
import { lessonCount } from '../players/unlock';
import type { Handedness } from '../rules/pinLayout';
import { escapeHtml } from '../util/html';

const CODE_LENGTH = 6;

type EntryMode = 'student' | 'teacher';

export class PlayerPicker {
  readonly element: HTMLElement;
  private mode: 'list' | 'create' = 'list';
  private pendingDelete: string | null = null;
  /** 목록에서 코드·교사 인증 코드를 다시 입력해 여는 중인 플레이어 id */
  private unlocking: string | null = null;
  private hand: Handedness = 'right';
  // render()가 innerHTML을 통째로 갈아 끼우므로(손 버튼을 누를 때마다),
  // 입력 중이던 값을 여기 보관했다가 다시 채운다 — 안 그러면 날아간다
  private entryMode: EntryMode = 'student';
  private draftCode = '';
  private draftTeacherName = '';
  private draftTeacherCode = '';
  /** 코드 확인·교사 인증이 끝날 때까지 중복 제출을 막는다 */
  private submitting = false;

  constructor(private readonly onDone: (player: Player) => void) {
    this.element = document.createElement('div');
    this.element.className = 'overlay player-picker';
    this.element.addEventListener('click', (e) => this.handleClick(e));
    this.element.addEventListener('submit', (e) => this.handleSubmit(e));
    this.element.addEventListener('input', (e) => this.handleInput(e));
    // 목록이 비어 있으면 곧장 로그인 화면으로 — 빈 목록을 보여 줄 이유가 없다
    this.mode = players.players.length === 0 ? 'create' : 'list';
    this.resetDraft();
    this.render();
  }

  show(): void {
    this.element.hidden = false;
    this.mode = players.players.length === 0 ? 'create' : 'list';
    this.pendingDelete = null;
    this.unlocking = null;
    this.resetDraft();
    this.render();
  }

  hide(): void {
    this.element.hidden = true;
  }

  // ---------------------------------------------------------------------------

  private resetDraft(): void {
    this.entryMode = 'student';
    this.draftCode = '';
    this.draftTeacherName = '';
    this.draftTeacherCode = '';
    this.hand = 'right';
  }

  private render(): void {
    this.element.innerHTML = this.mode === 'create' ? this.createHtml() : this.listHtml();
    if (this.mode === 'create') {
      this.element.querySelector<HTMLInputElement>('#login-code')?.focus();
    } else {
      this.element.querySelector<HTMLInputElement>('#unlock-value')?.focus();
    }
  }

  private listHtml(): string {
    const rows = players.players
      .map((p) => {
        const handLabel = p.handedness === 'left' ? '왼손' : '오른손';
        const progressLabel =
          p.isMaster === true ? '선생님 계정' : (() => {
            const { done, total } = lessonCount(p);
            return `${done}/${total} 배움`;
          })();
        const protectedAccount = p.isMaster === true || p.code !== undefined;

        if (this.unlocking === p.id) {
          return `
            <li class="player-row player-row--unlocking">
              <form class="unlock-form" data-unlock-form="${p.id}">
                <span class="unlock-name">${escapeHtml(p.name)}</span>
                <label class="field field--code">
                  <span>${p.isMaster === true ? '인증 코드' : `코드 ${CODE_LENGTH}자리`}</span>
                  ${
                    p.isMaster === true
                      ? `<span class="input-with-toggle">
                           <input id="unlock-value" name="unlockValue" type="password" autocomplete="off">
                           <button type="button" class="input-toggle" data-toggle-visibility="unlock-value" aria-label="입력한 코드 보기">👁</button>
                         </span>`
                      : `<input id="unlock-value" name="unlockValue" type="text"
                                inputmode="numeric" pattern="[0-9]{${CODE_LENGTH}}" maxlength="${CODE_LENGTH}"
                                autocomplete="off">`
                  }
                </label>
                <p class="form-error unlock-error" role="alert"></p>
                <div class="row-buttons">
                  <button type="submit" class="primary-btn">확인</button>
                  <button type="button" class="text-btn" data-unlock-cancel="1">취소</button>
                </div>
              </form>
            </li>
          `;
        }

        const confirming = this.pendingDelete === p.id;
        return `
          <li class="player-row${confirming ? ' player-row--confirming' : ''}">
            <button type="button" class="player-pick" data-pick="${p.id}">
              <span class="player-name">${escapeHtml(p.name)}</span>
              <span class="player-meta">${protectedAccount ? '🔒 ' : ''}${handLabel} · ${progressLabel}</span>
            </button>
            ${
              confirming
                ? `<span class="delete-confirm">
                     <span class="delete-warn">배운 것도 같이 지워져요</span>
                     <button type="button" class="danger-btn" data-delete-yes="${p.id}">지울래요</button>
                     <button type="button" class="text-btn" data-delete-no="1">그만둘래요</button>
                   </span>`
                : `<button type="button" class="icon-btn" data-delete="${p.id}" aria-label="${escapeHtml(p.name)} 지우기">🗑</button>`
            }
          </li>
        `;
      })
      .join('');

    return `
      <div class="panel">
        <h1>누가 볼링을 칠까요?</h1>
        <ul class="player-list">${rows}</ul>
        <button type="button" class="primary-btn" data-new="1">+ 새로 로그인하기</button>
      </div>
    `;
  }

  private createHtml(): string {
    const first = players.players.length === 0;
    const studentOn = this.entryMode === 'student';
    return `
      <form class="panel" novalidate>
        <h1>${first ? '볼링을 시작해요' : '로그인'}</h1>

        <div class="entry-tabs" role="tablist">
          <button type="button" class="entry-tab${studentOn ? ' is-on' : ''}" data-mode="student">🎓 학생</button>
          <button type="button" class="entry-tab${studentOn ? '' : ' is-on'}" data-mode="teacher">🍎 선생님</button>
        </div>

        <div data-mode-fields="student"${studentOn ? '' : ' hidden'}>
          <p class="lead">선생님께 받은 로그인 코드를 입력해 주세요.</p>
          <label class="field field--code">
            <span>로그인 코드 ${CODE_LENGTH}자리</span>
            <input id="login-code" name="code" type="text" inputmode="numeric"
                   pattern="[0-9]{${CODE_LENGTH}}" maxlength="${CODE_LENGTH}"
                   autocomplete="off" value="${escapeHtml(this.draftCode)}">
          </label>
        </div>

        <div data-mode-fields="teacher"${studentOn ? ' hidden' : ''}>
          <p class="lead">성함과 인증 코드를 입력해 주세요.</p>
          <label class="field">
            <span>선생님 성함</span>
            <input id="teacher-name" name="teacherName" type="text" maxlength="12"
                   autocomplete="off" placeholder="이름을 적어 주세요" value="${escapeHtml(this.draftTeacherName)}">
          </label>
          <label class="field field--code">
            <span>인증 코드</span>
            <span class="input-with-toggle">
              <input id="teacher-code" name="teacherCode" type="password" autocomplete="off"
                     value="${escapeHtml(this.draftTeacherCode)}">
              <button type="button" class="input-toggle" data-toggle-visibility="teacher-code" aria-label="입력한 코드 보기">👁</button>
            </span>
          </label>
        </div>

        <p class="lead">공을 어느 손으로 던지나요?</p>
        <div class="hand-choices">
          <button type="button" class="hand-choice${this.hand === 'left' ? ' is-on' : ''}" data-hand="left">
            <span class="hand-icon" aria-hidden="true">🤚</span>
            <span class="hand-name">왼손</span>
          </button>
          <button type="button" class="hand-choice${this.hand === 'right' ? ' is-on' : ''}" data-hand="right">
            <span class="hand-icon hand-icon--flip" aria-hidden="true">🤚</span>
            <span class="hand-name">오른손</span>
          </button>
        </div>

        <p class="form-error" role="alert"></p>
        <div class="row-buttons">
          <button type="submit" class="primary-btn">${studentOn ? '로그인' : '확인'}</button>
          ${first ? '' : '<button type="button" class="text-btn" data-cancel="1">뒤로</button>'}
        </div>
      </form>
    `;
  }

  private handleClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-pick],[data-new],[data-delete],[data-delete-yes],[data-delete-no],[data-cancel],[data-hand],[data-mode],[data-unlock-cancel],[data-toggle-visibility]',
    );
    if (el === null) return;
    const d = el.dataset;

    if (d['toggleVisibility'] !== undefined) {
      const input = this.element.querySelector<HTMLInputElement>(`#${d['toggleVisibility']}`);
      if (input === null) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      el.textContent = showing ? '👁' : '🙈';
      input.focus();
      return;
    }
    if (d['pick'] !== undefined) {
      const id = d['pick'];
      const target = players.players.find((p) => p.id === id);
      // 공용 PC의 목록에 남아 있다는 이유만으로 남의 코드 계정·교사 계정에
      // 그냥 들어가면 안 된다 — 고를 때마다 다시 확인한다.
      if (target !== undefined && (target.code !== undefined || target.isMaster === true)) {
        this.unlocking = id;
        this.render();
        return;
      }
      players.select(id);
      const picked = players.current;
      if (picked !== null) {
        void this.syncOnEntry(picked).then((synced) => this.onDone(synced));
      }
      return;
    }
    if (d['unlockCancel'] !== undefined) {
      this.unlocking = null;
      this.render();
      return;
    }
    if (d['mode'] === 'student' || d['mode'] === 'teacher') {
      this.entryMode = d['mode'];
      this.updateModeFields();
      return;
    }
    if (d['new'] !== undefined) {
      this.mode = 'create';
      this.resetDraft();
      this.render();
      return;
    }
    if (d['delete'] !== undefined) {
      this.pendingDelete = d['delete'];
      this.render();
      return;
    }
    if (d['deleteYes'] !== undefined) {
      players.remove(d['deleteYes']);
      this.pendingDelete = null;
      this.mode = players.players.length === 0 ? 'create' : 'list';
      if (this.mode === 'create') this.resetDraft();
      this.render();
      return;
    }
    if (d['deleteNo'] !== undefined) {
      this.pendingDelete = null;
      this.render();
      return;
    }
    if (d['cancel'] !== undefined) {
      this.mode = 'list';
      this.render();
      return;
    }
    if (d['hand'] === 'left' || d['hand'] === 'right') {
      this.hand = d['hand'];
      // render() 전체를 다시 그리면 form 전체 innerHTML이 갈아 끼워져 화면이
      // 깜박이고(입력 중인 코드 input도 새 DOM 노드가 돼 포커스가 끊긴다),
      // 버튼 활성화 표시만 바뀌면 되므로 클래스만 옮긴다.
      this.updateHandButtons();
    }
  }

  private updateHandButtons(): void {
    this.element.querySelectorAll<HTMLElement>('[data-hand]').forEach((btn) => {
      btn.classList.toggle('is-on', btn.dataset['hand'] === this.hand);
    });
  }

  /** 탭 버튼 표시·필드 전환을 전체 재렌더 없이 갱신한다 (손 버튼과 같은 이유) */
  private updateModeFields(): void {
    this.element.querySelectorAll<HTMLElement>('[data-mode]').forEach((btn) => {
      btn.classList.toggle('is-on', btn.dataset['mode'] === this.entryMode);
    });
    this.element.querySelectorAll<HTMLElement>('[data-mode-fields]').forEach((section) => {
      section.hidden = section.dataset['modeFields'] !== this.entryMode;
    });

    const submitBtn = this.element.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitBtn !== null) submitBtn.textContent = this.entryMode === 'student' ? '로그인' : '확인';

    const error = this.element.querySelector<HTMLElement>('.form-error');
    if (error !== null) error.textContent = '';

    const focusId = this.entryMode === 'student' ? '#login-code' : '#teacher-name';
    this.element.querySelector<HTMLInputElement>(focusId)?.focus();
  }

  /**
   * 이미 이 기기에 있는 코드 계정을 고를 때 원격 진행률과 한 번 맞춰 본다.
   *
   * 실패(오프라인 등)해도 조용히 로컬 그대로 진행한다 — 여기서 오류를 띄우면
   * "그냥 이어서 하려던" 학생이 매번 막힌다.
   */
  private async syncOnEntry(player: Player): Promise<Player> {
    if (player.code === undefined) return player;

    const pulled = await loginStudent(player.code);
    if (pulled.kind === 'ok') {
      const merged = mergeProgress(player.progress, pulled.progress);
      players.saveProgress(player.id, merged);
      return players.current ?? player;
    }
    return player;
  }

  /**
   * 목록에서 코드·교사 계정을 골랐을 때 다시 입력한 값을 확인한다.
   *
   * 학생 코드는 이 기기에 이미 저장된 값(player.code)과 그대로 비교한다 —
   * 코드 자체가 유일한 로그인 수단이라 오프라인에서도 통과해야 한다.
   * 교사 인증 코드는 로그인할 때(여기)만 서버로 확인한다 — 통과하면
   * PlayerStore에 저장해 두어, 로그인 뒤에 쓰는 학생 등록·학생 기록 조회는
   * 코드를 또 묻지 않고 이 값을 그대로 재사용한다.
   */
  private async confirmUnlock(id: string): Promise<void> {
    if (this.submitting) return;
    const player = players.players.find((p) => p.id === id);
    if (player === undefined) return;

    const input = this.element.querySelector<HTMLInputElement>('#unlock-value');
    const error = this.element.querySelector<HTMLElement>('.unlock-error');
    const btn = this.element.querySelector<HTMLButtonElement>('.unlock-form button[type="submit"]');
    const value = input?.value.trim() ?? '';

    this.submitting = true;
    const original = btn?.textContent ?? '';
    if (btn !== null) {
      btn.disabled = true;
      btn.textContent = '확인하는 중…';
    }

    try {
      const ok = player.isMaster === true ? await verifyTeacherCode(value) : value.length > 0 && value === player.code;
      if (!ok) {
        if (error !== null) error.textContent = player.isMaster === true ? '인증 코드가 달라요.' : '코드가 달라요.';
        input?.focus();
        return;
      }
      if (player.isMaster === true) players.setTeacherCode(id, value);
      this.unlocking = null;
      players.select(id);
      const picked = players.current;
      if (picked !== null) {
        const synced = await this.syncOnEntry(picked);
        this.onDone(synced);
      }
    } finally {
      this.submitting = false;
      if (btn !== null) {
        btn.disabled = false;
        btn.textContent = original;
      }
    }
  }

  private handleInput(e: Event): void {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id === 'login-code') this.draftCode = target.value;
    if (target.id === 'teacher-name') this.draftTeacherName = target.value;
    if (target.id === 'teacher-code') this.draftTeacherCode = target.value;
  }

  private handleSubmit(e: Event): void {
    e.preventDefault();
    const form = e.target;
    const unlockId = form instanceof HTMLFormElement ? form.dataset['unlockForm'] : undefined;
    if (unlockId !== undefined) {
      void this.confirmUnlock(unlockId);
      return;
    }
    void this.submit();
  }

  private async submit(): Promise<void> {
    if (this.submitting) return;

    const error = this.element.querySelector<HTMLElement>('.form-error');
    const submitBtn = this.element.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (error === null) return;

    this.submitting = true;
    error.textContent = '';
    const originalLabel = submitBtn?.textContent ?? '';
    if (submitBtn !== null) {
      submitBtn.disabled = true;
      submitBtn.textContent = '확인하는 중…';
    }

    try {
      if (this.entryMode === 'teacher') {
        await this.submitTeacher(error);
      } else {
        await this.submitStudent(error);
      }
    } finally {
      this.submitting = false;
      if (submitBtn !== null) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    }
  }

  private async submitStudent(error: HTMLElement): Promise<void> {
    const codeInput = this.element.querySelector<HTMLInputElement>('#login-code');
    const code = codeInput?.value.trim() ?? '';
    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) {
      error.textContent = `로그인 코드 ${CODE_LENGTH}자리를 숫자로 적어 주세요.`;
      codeInput?.focus();
      return;
    }

    const pulled = await loginStudent(code);
    if (pulled.kind === 'offline') {
      error.textContent = '지금은 로그인할 수 없어요. 인터넷 연결을 확인해 주세요.';
      return;
    }
    if (pulled.kind === 'not_found') {
      error.textContent = '코드가 달라요. 선생님께 다시 확인해 주세요.';
      return;
    }

    // 이 기기에 이미 있는 계정이면 이어서 쓴다 — 새로 만들면 목록에 같은
    // 학생이 두 줄로 남는다.
    const existing = players.findByCode(code);
    if (existing !== null) {
      const merged = mergeProgress(existing.progress, pulled.progress);
      players.saveProgress(existing.id, merged);
      players.select(existing.id);
      this.onDone(players.current ?? existing);
      return;
    }

    const merged = mergeProgress({ completedLessons: [], quizScores: {}, currentLessonId: null }, pulled.progress);
    const name = pulled.name.length > 0 ? pulled.name : '학생';
    this.onDone(players.create(name, this.hand, { code, progress: merged }));
  }

  private async submitTeacher(error: HTMLElement): Promise<void> {
    const nameInput = this.element.querySelector<HTMLInputElement>('#teacher-name');
    const codeInput = this.element.querySelector<HTMLInputElement>('#teacher-code');

    const check = checkName(nameInput?.value ?? '', players.players);
    if (!check.ok) {
      error.textContent = check.reason;
      nameInput?.focus();
      return;
    }

    const code = codeInput?.value.trim() ?? '';
    if (code.length === 0) {
      error.textContent = '인증 코드를 입력해 주세요.';
      codeInput?.focus();
      return;
    }

    const ok = await verifyTeacherCode(code);
    if (!ok) {
      error.textContent = '인증 코드가 달라요.';
      return;
    }

    this.onDone(players.create(check.name, this.hand, { isMaster: true, teacherCode: code }));
  }
}
