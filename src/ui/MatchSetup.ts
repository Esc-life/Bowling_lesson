/**
 * 대전 시작 화면 — 참가자와 프레임 수를 고른다.
 *
 * 아직 다 배우지 않은 사람은 고를 수 없다. 고르는 순간 이유가 보이게
 * 한다 — 다 골라 놓고 시작 버튼에서 막히면 왜인지 알 수 없다.
 *
 * 프레임 수를 고르게 하는 이유: 4명이 10프레임을 치면 투구가 40~84회다.
 * 한 투구가 정지까지 3~6초 걸리므로 수업 한 차시로는 길다.
 */

import { players } from '../players/PlayerStore';
import type { Player } from '../players/types';
import { isGraduated, lessonCount, matchLockReason, MIN_MATCH_PLAYERS } from '../players/unlock';
import { MAX_PLAYERS, type MatchPlayer } from '../rules/MatchMachine';

export type MatchChoice = { participants: MatchPlayer[]; totalFrames: number };

const FRAME_CHOICES = [3, 5, 10] as const;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

export class MatchSetup {
  readonly element: HTMLElement;
  private picked: string[] = [];
  private frames: number = 3;
  private note: string | null = null;

  constructor(
    private readonly onStart: (choice: MatchChoice) => void,
    private readonly onCancel: () => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'overlay match-setup';
    this.element.hidden = true;
    this.element.addEventListener('click', (e) => this.handleClick(e));
    this.render();
  }

  show(): void {
    // 방을 연 사람을 기본 참가자로 넣어 둔다
    const me = players.current;
    this.picked = me !== null && isGraduated(me) ? [me.id] : [];
    this.frames = 3;
    this.note = null;
    this.element.hidden = false;
    this.render();
  }

  hide(): void {
    this.element.hidden = true;
  }

  private get participants(): Player[] {
    return this.picked
      .map((id) => players.players.find((p) => p.id === id))
      .filter((p): p is Player => p !== undefined);
  }

  private render(): void {
    const rows = players.players
      .map((p) => {
        const ok = isGraduated(p);
        const on = this.picked.includes(p.id);
        const { done, total } = lessonCount(p);
        return `
          <li>
            <button type="button" class="pick-row${on ? ' is-on' : ''}${ok ? '' : ' is-locked'}"
                    data-toggle="${p.id}" aria-pressed="${on}">
              <span class="pick-mark" aria-hidden="true">${ok ? (on ? '✅' : '⬜') : '🔒'}</span>
              <span class="player-name">${escapeHtml(p.name)}</span>
              <span class="player-meta">${ok ? '다 배웠어요' : `${done}/${total} 배움`}</span>
            </button>
          </li>
        `;
      })
      .join('');

    const frameButtons = FRAME_CHOICES.map(
      (n) => `<button type="button" class="frame-choice${this.frames === n ? ' is-on' : ''}"
                data-frames="${n}">${n}프레임</button>`,
    ).join('');

    const lock = matchLockReason(this.participants);

    this.element.innerHTML = `
      <div class="panel">
        <h1>누구와 겨룰까요?</h1>
        <p class="lead">${MIN_MATCH_PLAYERS}명부터 ${MAX_PLAYERS}명까지 고를 수 있어요.</p>
        <ul class="player-list">${rows}</ul>
        <p class="lead">몇 프레임씩 칠까요?</p>
        <div class="frame-choices">${frameButtons}</div>
        <p class="form-error" role="alert">${escapeHtml(this.note ?? lock ?? '')}</p>
        <div class="row-buttons">
          <button type="button" class="primary-btn" data-go="1"${lock === null ? '' : ' disabled'}>시작하기</button>
          <button type="button" class="text-btn" data-cancel="1">뒤로</button>
        </div>
      </div>
    `;
  }

  private handleClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-toggle],[data-frames],[data-go],[data-cancel]',
    );
    if (el === null) return;
    const d = el.dataset;

    if (d['toggle'] !== undefined) {
      const player = players.players.find((p) => p.id === d['toggle']);
      if (player === undefined) return;
      if (!isGraduated(player)) {
        this.note = `${player.name}는 아직 다 배우지 않았어요.`;
        this.render();
        return;
      }
      this.note = null;
      if (this.picked.includes(player.id)) {
        this.picked = this.picked.filter((id) => id !== player.id);
      } else if (this.picked.length >= MAX_PLAYERS) {
        this.note = `${MAX_PLAYERS}명까지 고를 수 있어요.`;
      } else {
        this.picked = [...this.picked, player.id];
      }
      this.render();
      return;
    }
    if (d['frames'] !== undefined) {
      this.frames = Number(d['frames']);
      this.render();
      return;
    }
    if (d['cancel'] !== undefined) {
      this.onCancel();
      return;
    }
    if (d['go'] !== undefined) {
      const list = this.participants;
      if (matchLockReason(list) !== null) return;
      this.onStart({
        participants: list.map<MatchPlayer>((p) => ({
          id: p.id,
          name: p.name,
          handedness: p.handedness,
        })),
        totalFrames: this.frames,
      });
    }
  }
}
