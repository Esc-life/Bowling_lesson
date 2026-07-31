/**
 * 시작 화면 — 누가 플레이하는지 고른다.
 *
 * 계정이 아니다. 공용 PC 한 대를 여러 학생이 쓸 때 진도와 손 설정이
 * 섞이지 않게 하는 것이 전부다.
 *
 * 삭제는 진행률까지 함께 지우므로 두 단계로 확인한다. 영역 메뉴의
 * 초기화가 같은 방식이라 패턴을 맞췄다.
 */

import { checkName, MAX_NAME_LENGTH, players } from '../players/PlayerStore';
import type { Player } from '../players/types';
import { lessonCount } from '../players/unlock';
import type { Handedness } from '../rules/pinLayout';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

export class PlayerPicker {
  readonly element: HTMLElement;
  private mode: 'list' | 'create' = 'list';
  private pendingDelete: string | null = null;
  private hand: Handedness = 'right';
  // render()가 innerHTML을 통째로 갈아 끼우므로(손 버튼을 누를 때마다),
  // 입력 중이던 이름을 여기 보관했다가 다시 채운다 — 안 그러면 날아간다
  private draftName = '';

  constructor(private readonly onDone: (player: Player) => void) {
    this.element = document.createElement('div');
    this.element.className = 'overlay player-picker';
    this.element.addEventListener('click', (e) => this.handleClick(e));
    this.element.addEventListener('submit', (e) => this.handleSubmit(e));
    this.element.addEventListener('input', (e) => this.handleInput(e));
    // 목록이 비어 있으면 곧장 만들기 화면으로 — 빈 목록을 보여 줄 이유가 없다
    this.mode = players.players.length === 0 ? 'create' : 'list';
    this.render();
  }

  show(): void {
    this.element.hidden = false;
    this.mode = players.players.length === 0 ? 'create' : 'list';
    this.pendingDelete = null;
    this.draftName = '';
    this.render();
  }

  hide(): void {
    this.element.hidden = true;
  }

  // ---------------------------------------------------------------------------

  private render(): void {
    this.element.innerHTML = this.mode === 'create' ? this.createHtml() : this.listHtml();
    if (this.mode === 'create') {
      this.element.querySelector<HTMLInputElement>('#player-name')?.focus();
    }
  }

  private listHtml(): string {
    const rows = players.players
      .map((p) => {
        const { done, total } = lessonCount(p);
        const handLabel = p.handedness === 'left' ? '왼손' : '오른손';
        const confirming = this.pendingDelete === p.id;
        return `
          <li class="player-row${confirming ? ' player-row--confirming' : ''}">
            <button type="button" class="player-pick" data-pick="${p.id}">
              <span class="player-name">${escapeHtml(p.name)}</span>
              <span class="player-meta">${handLabel} · ${done}/${total} 배움</span>
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
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-pick],[data-new],[data-delete],[data-delete-yes],[data-delete-no],[data-cancel],[data-hand]');
    if (el === null) return;
    const d = el.dataset;

    if (d['pick'] !== undefined) {
      players.select(d['pick']);
      const picked = players.current;
      if (picked !== null) this.onDone(picked);
      return;
    }
    if (d['new'] !== undefined) {
      this.mode = 'create';
      this.draftName = '';
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
      if (this.mode === 'create') this.draftName = '';
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
      this.render();
    }
  }

  private handleInput(e: Event): void {
    const target = e.target;
    if (target instanceof HTMLInputElement && target.id === 'player-name') {
      this.draftName = target.value;
    }
  }

  private handleSubmit(e: Event): void {
    e.preventDefault();
    const input = this.element.querySelector<HTMLInputElement>('#player-name');
    const error = this.element.querySelector<HTMLElement>('.form-error');
    if (input === null || error === null) return;

    const check = checkName(input.value, players.players);
    if (!check.ok) {
      error.textContent = check.reason;
      input.focus();
      return;
    }
    this.onDone(players.create(check.name, this.hand));
  }
}
