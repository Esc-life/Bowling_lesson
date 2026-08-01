/**
 * 시작 화면 — 누가 플레이하는지 고른다.
 *
 * 계정이 아니다. 공용 PC 한 대를 여러 학생이 쓸 때 진도와 손 설정이
 * 섞이지 않게 하는 것이 전부다.
 *
 * 삭제는 진행률까지 함께 지우므로 두 단계로 확인한다. 영역 메뉴의
 * 초기화가 같은 방식이라 패턴을 맞췄다.
 */

import { pullPlayer, pushPlayer, verifyTeacher, mergeProgress } from '../net/PlayerSync';
import { checkName, MAX_NAME_LENGTH, players } from '../players/PlayerStore';
import type { Player } from '../players/types';
import { lessonCount } from '../players/unlock';
import type { Handedness } from '../rules/pinLayout';
import { escapeHtml } from '../util/html';

export class PlayerPicker {
  readonly element: HTMLElement;
  private mode: 'list' | 'create' = 'list';
  private pendingDelete: string | null = null;
  private hand: Handedness = 'right';
  // render()가 innerHTML을 통째로 갈아 끼우므로(손 버튼을 누를 때마다),
  // 입력 중이던 이름을 여기 보관했다가 다시 채운다 — 안 그러면 날아간다
  private draftName = '';
  private draftPin = '';
  private draftTeacherPassword = '';
  private showTeacherField = false;
  /** 이름+PIN 확인·교사 비밀번호 확인이 끝날 때까지 중복 제출을 막는다 */
  private submitting = false;

  constructor(private readonly onDone: (player: Player) => void) {
    this.element = document.createElement('div');
    this.element.className = 'overlay player-picker';
    this.element.addEventListener('click', (e) => this.handleClick(e));
    this.element.addEventListener('submit', (e) => this.handleSubmit(e));
    this.element.addEventListener('input', (e) => this.handleInput(e));
    // 목록이 비어 있으면 곧장 만들기 화면으로 — 빈 목록을 보여 줄 이유가 없다
    this.mode = players.players.length === 0 ? 'create' : 'list';
    this.resetDraft();
    this.render();
  }

  show(): void {
    this.element.hidden = false;
    this.mode = players.players.length === 0 ? 'create' : 'list';
    this.pendingDelete = null;
    this.resetDraft();
    this.render();
  }

  hide(): void {
    this.element.hidden = true;
  }

  // ---------------------------------------------------------------------------

  /**
   * 만들기 화면을 새것으로 되돌린다.
   *
   * 공용 PC라 앞사람이 고른 손이 남아 있으면 다음 학생이 그대로 시작해
   * 뒤집힌 레인에서 배우게 된다. 손을 바꾸는 화면은 없다.
   *
   * 옛 버전에서 넘어오는 첫 학생에게만 그때 쓰던 손을 초기 선택으로
   * 켜 준다. 어디까지나 초기 선택이라, 눌러서 바꾸면 그 값이 이긴다.
   */
  private resetDraft(): void {
    this.draftName = '';
    this.draftPin = '';
    this.draftTeacherPassword = '';
    this.showTeacherField = false;
    this.hand = players.pendingHandedness ?? 'right';
  }

  private render(): void {
    this.element.innerHTML = this.mode === 'create' ? this.createHtml() : this.listHtml();
    if (this.mode === 'create') {
      this.element.querySelector<HTMLInputElement>('#player-name')?.focus();
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
        const confirming = this.pendingDelete === p.id;
        return `
          <li class="player-row${confirming ? ' player-row--confirming' : ''}">
            <button type="button" class="player-pick" data-pick="${p.id}">
              <span class="player-name">${escapeHtml(p.name)}</span>
              <span class="player-meta">${handLabel} · ${progressLabel}</span>
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
        <button type="button" class="primary-btn" data-new="1">+ 새로 만들기</button>
      </div>
    `;
  }

  private createHtml(): string {
    const first = players.players.length === 0;
    const inherit = players.pendingMigration
      ? '<p class="note">지금까지 배운 내용을 이어서 쓸게요.</p>'
      : '';
    return `
      <form class="panel" novalidate>
        <h1>${first ? '볼링을 시작해요' : '새 플레이어'}</h1>
        <label class="field">
          <span>이름</span>
          <input id="player-name" name="name" type="text" maxlength="${MAX_NAME_LENGTH}"
                 autocomplete="off" placeholder="이름을 적어 주세요" value="${escapeHtml(this.draftName)}">
        </label>
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

        <label class="field field--pin">
          <span>다른 기기와 이어서 쓰기 (선택)</span>
          <input id="player-pin" name="pin" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4"
                 autocomplete="off" placeholder="4자리 번호 (안 넣으면 이 기기에만 저장돼요)"
                 value="${escapeHtml(this.draftPin)}">
        </label>

        <button type="button" class="text-btn teacher-toggle" data-teacher-toggle="1">
          ${this.showTeacherField ? '선생님 아니에요' : '선생님이신가요?'}
        </button>
        <label class="field field--teacher${this.showTeacherField ? '' : ' is-hidden'}" data-teacher-field>
          <span>비밀번호</span>
          <input id="teacher-password" name="teacherPassword" type="password" autocomplete="off"
                 placeholder="선생님 계정 비밀번호" value="${escapeHtml(this.draftTeacherPassword)}">
        </label>

        ${inherit}
        <p class="form-error" role="alert"></p>
        <div class="row-buttons">
          <button type="submit" class="primary-btn">시작하기</button>
          ${first ? '' : '<button type="button" class="text-btn" data-cancel="1">뒤로</button>'}
        </div>
      </form>
    `;
  }

  private handleClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-pick],[data-new],[data-delete],[data-delete-yes],[data-delete-no],[data-cancel],[data-hand],[data-teacher-toggle]',
    );
    if (el === null) return;
    const d = el.dataset;

    if (d['pick'] !== undefined) {
      players.select(d['pick']);
      const picked = players.current;
      if (picked !== null) {
        // PIN이 있는 플레이어는 다른 기기에서 더 나아간 진행률이 있을 수 있으니
        // 들어가기 전에 한 번 맞춰 본다 — 실패해도(오프라인 등) 로컬 그대로 진행한다.
        void this.syncOnEntry(picked).then((synced) => this.onDone(synced));
      }
      return;
    }
    if (d['teacherToggle'] !== undefined) {
      this.showTeacherField = !this.showTeacherField;
      this.updateTeacherField();
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
      // 깜박이고(입력 중인 이름 input도 새 DOM 노드가 돼 포커스가 끊긴다),
      // 버튼 활성화 표시만 바뀌면 되므로 클래스만 옮긴다.
      this.updateHandButtons();
    }
  }

  private updateHandButtons(): void {
    this.element.querySelectorAll<HTMLElement>('.hand-choice').forEach((btn) => {
      btn.classList.toggle('is-on', btn.dataset['hand'] === this.hand);
    });
  }

  /** 전체를 다시 그리지 않고 비밀번호 칸만 보이거나 숨긴다 (손 버튼과 같은 이유) */
  private updateTeacherField(): void {
    this.element.querySelector<HTMLElement>('[data-teacher-field]')?.classList.toggle('is-hidden', !this.showTeacherField);
    const toggle = this.element.querySelector<HTMLElement>('[data-teacher-toggle]');
    if (toggle !== null) toggle.textContent = this.showTeacherField ? '선생님 아니에요' : '선생님이신가요?';
  }

  /**
   * PIN이 있는 플레이어를 고를 때 원격 진행률과 한 번 맞춰 본다.
   *
   * 실패(오프라인·이름 충돌)해도 조용히 로컬 그대로 진행한다 — 여기서 오류를
   * 띄우면 "그냥 이어서 하려던" 학생이 매번 막힌다. 새 이름과 PIN을 검증하는
   * 만들기 화면과 달리, 여기는 이미 로컬에 있는 플레이어를 다시 여는 것뿐이다.
   */
  private async syncOnEntry(player: Player): Promise<Player> {
    if (player.pin === undefined) return player;

    const pulled = await pullPlayer(player.name, player.pin);
    if (pulled.kind === 'ok') {
      const merged = mergeProgress(player.progress, pulled.progress);
      players.saveProgress(player.id, merged);
      return players.current ?? player;
    }
    if (pulled.kind === 'not_found') {
      pushPlayer(player.name, player.pin, player.handedness, player.progress).catch(() => {
        /* 다음 저장에서 다시 시도된다 */
      });
    }
    return player;
  }

  private handleInput(e: Event): void {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id === 'player-name') this.draftName = target.value;
    if (target.id === 'player-pin') this.draftPin = target.value;
    if (target.id === 'teacher-password') this.draftTeacherPassword = target.value;
  }

  private handleSubmit(e: Event): void {
    e.preventDefault();
    void this.submit();
  }

  private async submit(): Promise<void> {
    if (this.submitting) return;

    const input = this.element.querySelector<HTMLInputElement>('#player-name');
    const pinInput = this.element.querySelector<HTMLInputElement>('#player-pin');
    const teacherInput = this.element.querySelector<HTMLInputElement>('#teacher-password');
    const error = this.element.querySelector<HTMLElement>('.form-error');
    const submitBtn = this.element.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (input === null || error === null) return;

    const check = checkName(input.value, players.players);
    if (!check.ok) {
      error.textContent = check.reason;
      input.focus();
      return;
    }

    const teacherPassword = teacherInput?.value.trim() ?? '';
    const pin = pinInput?.value.trim() ?? '';

    if (pin.length > 0 && !/^\d{4}$/.test(pin)) {
      error.textContent = 'PIN은 숫자 4자리로 적어 주세요.';
      pinInput?.focus();
      return;
    }

    // 네트워크 확인이 끝날 때까지 버튼을 잠근다 — 화면 전체를 다시 그리지
    // 않고 이 버튼 하나만 건드린다(손 버튼과 같은 이유로 깜빡임을 피한다).
    this.submitting = true;
    error.textContent = '';
    const originalLabel = submitBtn?.textContent ?? '';
    if (submitBtn !== null) {
      submitBtn.disabled = true;
      submitBtn.textContent = '확인하는 중…';
    }

    try {
      if (teacherPassword.length > 0) {
        const ok = await verifyTeacher(check.name, teacherPassword);
        if (!ok) {
          error.textContent = '이름이나 비밀번호가 달라요.';
          return;
        }
        this.onDone(players.create(check.name, this.hand, { isMaster: true }));
        return;
      }

      if (pin.length > 0) {
        const pulled = await pullPlayer(check.name, pin);
        if (pulled.kind === 'pin_mismatch') {
          error.textContent = '이미 사용 중인 이름이에요. PIN을 확인하거나 다른 이름을 써 주세요.';
          return;
        }
        if (pulled.kind === 'ok') {
          const merged = mergeProgress({ completedLessons: [], quizScores: {}, currentLessonId: null }, pulled.progress);
          this.onDone(players.create(check.name, this.hand, { pin, progress: merged }));
          return;
        }
        // not_found(새 이름) 또는 offline(설정 없음) — 이 기기 기준으로 새로 만든다
        const created = players.create(check.name, this.hand, { pin });
        if (pulled.kind === 'not_found') {
          pushPlayer(check.name, pin, this.hand, created.progress).catch(() => {
            /* 다음 저장에서 다시 시도된다 */
          });
        }
        this.onDone(created);
        return;
      }

      this.onDone(players.create(check.name, this.hand));
    } finally {
      this.submitting = false;
      if (submitBtn !== null) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    }
  }
}
