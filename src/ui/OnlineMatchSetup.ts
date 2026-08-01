/**
 * 온라인 대전 — 방 만들기·참가하기·로비.
 *
 * 다른 기기에 있는 사람과 방 코드로 만난다. 서버에 "정답"을 저장하지
 * 않는다 — 대전이 시작되면 각자 굴림 로그를 받아 스스로 점수를 계산한다
 * (`net/OnlineMatchController.ts`, 설계는
 * `docs/superpowers/specs/2026-08-01-online-match-design.md`).
 *
 * 참가 자격은 기존 대전과 같다 — 다 배운 사람만 방을 만들거나 들어올 수
 * 있다. 각 기기가 자기 플레이어로 이 화면에 들어오기 전에 이미 그 판정을
 * 통과해야 하므로, 로비는 남의 수료 여부를 다시 확인하지 않는다.
 */

import { players } from '../players/PlayerStore';
import { MIN_MATCH_PLAYERS, practiceLockReason } from '../players/unlock';
import { MAX_PLAYERS, type MatchPlayer } from '../rules/MatchMachine';
import { ROOM_CODE_LENGTH } from '../net/roomCode';
import { RoomChannel, type RoomParticipant } from '../net/RoomChannel';
import { escapeHtml } from '../util/html';

export type OnlineMatchStart = {
  room: RoomChannel;
  selfId: string;
  participants: MatchPlayer[];
  totalFrames: number;
};

const FRAME_CHOICES = [3, 5, 10] as const;

type Screen = 'choice' | 'code-entry' | 'connecting' | 'lobby';

export class OnlineMatchSetup {
  readonly element: HTMLElement;
  private screen: Screen = 'choice';
  private mode: 'host' | 'guest' | null = null;
  private room: RoomChannel | null = null;
  private participants: RoomParticipant[] = [];
  private frames: number = 3;
  private error: string | null = null;
  private draftCode = '';

  constructor(
    private readonly onStart: (start: OnlineMatchStart) => void,
    private readonly onCancel: () => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'overlay online-match-setup';
    this.element.hidden = true;
    this.element.addEventListener('click', (e) => this.handleClick(e));
    this.element.addEventListener('input', (e) => this.handleInput(e));
    this.element.addEventListener('submit', (e) => this.handleSubmit(e));
    this.render();
  }

  show(): void {
    this.leaveRoom();
    this.screen = 'choice';
    this.mode = null;
    this.participants = [];
    this.frames = 3;
    this.error = null;
    this.draftCode = '';
    this.element.hidden = false;
    this.render();
  }

  hide(): void {
    this.element.hidden = true;
  }

  /** 대전이 시작되지 않은 채 이 화면을 완전히 벗어날 때 방 연결도 정리한다 */
  private leaveRoom(): void {
    this.room?.leave();
    this.room = null;
  }

  private render(): void {
    this.element.innerHTML = this.screenHtml();
    if (this.screen === 'code-entry') {
      this.element.querySelector<HTMLInputElement>('#room-code-input')?.focus();
    }
  }

  private screenHtml(): string {
    switch (this.screen) {
      case 'choice':
        return this.choiceHtml();
      case 'code-entry':
        return this.codeEntryHtml();
      case 'connecting':
        return `<div class="panel"><h1>연결하는 중…</h1></div>`;
      case 'lobby':
        return this.lobbyHtml();
    }
  }

  private choiceHtml(): string {
    const me = players.current;
    const lock = me === null ? '먼저 플레이어를 골라 주세요.' : practiceLockReason(me);
    const disabled = lock === null ? '' : ' disabled';
    return `
      <div class="panel">
        <h1>온라인 대전</h1>
        <p class="lead">다른 기기에 있는 친구와 방 코드로 만나요.</p>
        <p class="form-error" role="alert">${escapeHtml(this.error ?? lock ?? '')}</p>
        <div class="play-buttons">
          <button type="button" class="play-btn${lock === null ? '' : ' is-locked'}" data-act="create"${disabled}>
            <span class="play-icon" aria-hidden="true">🆕</span>
            <span class="play-name">방 만들기</span>
            <span class="play-desc">코드를 만들어 친구를 초대해요</span>
          </button>
          <button type="button" class="play-btn${lock === null ? '' : ' is-locked'}" data-act="join"${disabled}>
            <span class="play-icon" aria-hidden="true">🔑</span>
            <span class="play-name">참가하기</span>
            <span class="play-desc">받은 코드로 들어가요</span>
          </button>
        </div>
        <div class="row-buttons">
          <button type="button" class="text-btn" data-act="cancel">뒤로</button>
        </div>
      </div>
    `;
  }

  private codeEntryHtml(): string {
    return `
      <form class="panel" novalidate>
        <h1>방 코드를 입력하세요</h1>
        <label class="field">
          <span>방 코드 (${ROOM_CODE_LENGTH}자)</span>
          <input id="room-code-input" name="code" type="text" maxlength="${ROOM_CODE_LENGTH}"
                 autocomplete="off" autocapitalize="characters" placeholder="예: 7F3K"
                 class="room-code-input" value="${escapeHtml(this.draftCode)}">
        </label>
        <p class="form-error" role="alert">${escapeHtml(this.error ?? '')}</p>
        <div class="row-buttons">
          <button type="submit" class="primary-btn">들어가기</button>
          <button type="button" class="text-btn" data-act="back">뒤로</button>
        </div>
      </form>
    `;
  }

  private lobbyHtml(): string {
    const me = players.current;
    const rows = this.participants
      .map(
        (p) => `
          <li class="lobby-row${p.id === me?.id ? ' lobby-row--me' : ''}">
            <span class="lobby-name">${escapeHtml(p.name)}</span>
            ${p.id === me?.id ? '<span class="lobby-you">나</span>' : ''}
          </li>`,
      )
      .join('');

    const count = this.participants.length;
    const canStart = count >= MIN_MATCH_PLAYERS && count <= MAX_PLAYERS;

    const hostControls =
      this.mode === 'host'
        ? `
        <p class="lead">몇 프레임씩 칠까요?</p>
        <div class="frame-choices">${FRAME_CHOICES.map(
          (n) =>
            `<button type="button" class="frame-choice${this.frames === n ? ' is-on' : ''}" data-frames="${n}">${n}프레임</button>`,
        ).join('')}</div>
        <p class="form-error" role="alert">${escapeHtml(
          this.error ?? (canStart ? '' : `${MIN_MATCH_PLAYERS}명부터 시작할 수 있어요.`),
        )}</p>
        <button type="button" class="primary-btn" data-act="start"${canStart ? '' : ' disabled'}>시작하기</button>
      `
        : `<p class="lead">방장이 시작하면 자동으로 시작돼요.</p>`;

    return `
      <div class="panel">
        <h1>방 코드</h1>
        <div class="room-code">${escapeHtml(this.room?.code ?? '')}</div>
        <p class="lead">${this.mode === 'host' ? '이 코드를 친구에게 알려 주세요' : '방장을 기다리는 중이에요'}</p>
        <ul class="lobby-list">${rows}</ul>
        ${hostControls}
        <div class="row-buttons">
          <button type="button" class="text-btn" data-act="leave">나가기</button>
        </div>
      </div>
    `;
  }

  private handleClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-frames]');
    if (el === null) return;
    const d = el.dataset;

    if (d['frames'] !== undefined) {
      this.frames = Number(d['frames']);
      this.render();
      return;
    }

    switch (d['act']) {
      case 'create':
        void this.startHosting();
        return;
      case 'join':
        this.error = null;
        this.draftCode = '';
        this.screen = 'code-entry';
        this.render();
        return;
      case 'back':
        this.error = null;
        this.screen = 'choice';
        this.render();
        return;
      case 'cancel':
        this.leaveRoom();
        this.onCancel();
        return;
      case 'leave':
        this.leaveRoom();
        this.screen = 'choice';
        this.mode = null;
        this.render();
        return;
      case 'start':
        this.startMatch();
        return;
      default:
        break;
    }
  }

  private handleInput(e: Event): void {
    const target = e.target;
    if (target instanceof HTMLInputElement && target.id === 'room-code-input') {
      this.draftCode = target.value;
    }
  }

  private handleSubmit(e: Event): void {
    e.preventDefault();
    if (this.screen !== 'code-entry') return;
    void this.joinWithCode(this.draftCode);
  }

  private async startHosting(): Promise<void> {
    const me = players.current;
    if (me === null) return;
    this.screen = 'connecting';
    this.error = null;
    this.render();

    const result = await RoomChannel.createRoom(toParticipant(me));
    if (!result.ok) {
      this.screen = 'choice';
      this.error = result.reason;
      this.render();
      return;
    }

    this.enterLobby('host', result.channel);
  }

  private async joinWithCode(rawCode: string): Promise<void> {
    const me = players.current;
    if (me === null) return;
    this.screen = 'connecting';
    this.error = null;
    this.render();

    const result = await RoomChannel.joinRoom(rawCode, toParticipant(me));
    if (!result.ok) {
      this.screen = 'code-entry';
      this.error = result.reason;
      this.render();
      return;
    }

    this.enterLobby('guest', result.channel);
  }

  private enterLobby(mode: 'host' | 'guest', room: RoomChannel): void {
    this.mode = mode;
    this.room = room;
    this.participants = room.participants();
    this.screen = 'lobby';

    room.on({
      onParticipantsChange: (participants) => {
        this.participants = participants;
        this.render();
      },
      onStart: (payload) => {
        // 방장 자신은 이 이벤트를 안 쓴다 — startMatch()가 직접 onStart를 부른다
        if (this.mode !== 'guest') return;
        const me = players.current;
        if (me === null) return;
        this.hide();
        this.onStart({ room, selfId: me.id, participants: payload.participants, totalFrames: payload.totalFrames });
      },
      onDisconnected: () => {
        this.room = null;
        this.mode = null;
        this.screen = 'choice';
        this.error = '연결이 끊겼어요. 다시 시도해 주세요.';
        this.render();
      },
    });

    this.render();
  }

  private startMatch(): void {
    const me = players.current;
    if (me === null || this.room === null || this.mode !== 'host') return;
    const participants: MatchPlayer[] = [...this.participants];
    if (participants.length < MIN_MATCH_PLAYERS || participants.length > MAX_PLAYERS) return;

    this.room.sendStart({ participants, totalFrames: this.frames });
    const room = this.room;
    this.hide();
    this.onStart({ room, selfId: me.id, participants, totalFrames: this.frames });
  }
}

function toParticipant(p: { id: string; name: string; handedness: RoomParticipant['handedness'] }): RoomParticipant {
  return { id: p.id, name: p.name, handedness: p.handedness };
}
