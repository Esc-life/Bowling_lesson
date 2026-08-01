/**
 * 방 하나에 대응하는 Supabase Realtime 채널.
 *
 * Broadcast(메시지 주고받기) + Presence(누가 접속해 있는지)만 쓴다.
 * 테이블도 RLS도 없다 — 방 코드가 곧 채널 이름(`room:{code}`)이고,
 * "정답"은 서버에 저장하지 않는다. 각자 받은 굴림 로그를 `MatchSync`로
 * 재생해 스스로 계산한다 (설계는
 * `docs/superpowers/specs/2026-08-01-online-match-design.md`).
 *
 * 네트워크 세부사항을 감추는 어댑터 역할만 한다 — 점수·차례 판정은
 * 전혀 모른다.
 *
 * 리스너는 반드시 `subscribe()` **전에** 등록해야 한다 — Supabase
 * Realtime은 구독한 뒤에 `presence` 콜백을 추가하면 던진다("cannot add
 * presence callbacks ... after subscribe()", 실기에서 확인). 그런데
 * `RoomChannel` 인스턴스(리스너를 실제로 담는 `events`)는 구독이 끝나고
 * 참가자 존재 확인까지 마친 뒤에야 만들어진다. 그래서 리스너는 인스턴스가
 * 아니라 먼저 만들어 둔 `EventsBox`(간접 참조)에 등록하고, 인스턴스는
 * 그 상자를 그대로 물려받는다.
 */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { MatchPlayer } from '../rules/MatchMachine';
import { getSupabaseClient } from './supabaseClient';
import { createRoomCode, normalizeRoomCode } from './roomCode';
import type { RollLogEntry } from './MatchSync';

export type RoomParticipant = MatchPlayer;

type PresenceMeta = RoomParticipant & { joinedAt: number };

export type StartPayload = { participants: RoomParticipant[]; totalFrames: number };
export type StateSnapshotPayload = {
  log: RollLogEntry[];
  participants: RoomParticipant[];
  totalFrames: number;
};

export type RoomChannelEvents = {
  /** 로비에 있는 사람 목록이 바뀔 때마다 (참가 순서대로 정렬됨) */
  onParticipantsChange: (participants: RoomParticipant[]) => void;
  /** 방장이 대전을 시작했을 때 (방장 자신에게는 오지 않는다 — 방장은 직접 안다) */
  onStart: (payload: StartPayload) => void;
  onRoll: (entry: RollLogEntry) => void;
  /** 누군가 재동기화를 요청했다 — 내가 가진 로그가 더 길면 응답해 준다 */
  onRequestState: () => void;
  onStateSnapshot: (payload: StateSnapshotPayload) => void;
  /** 연결이 끊겨 더 쓸 수 없게 됐을 때 (재시도는 호출부가 새로 연다) */
  onDisconnected: () => void;
};

const NOOP_EVENTS: RoomChannelEvents = {
  onParticipantsChange: () => {},
  onStart: () => {},
  onRoll: () => {},
  onRequestState: () => {},
  onStateSnapshot: () => {},
  onDisconnected: () => {},
};

type EventsBox = { current: RoomChannelEvents };

/** 방을 만들 때 코드 충돌을 피하려고 몇 번까지 다시 뽑아 볼지 */
const MAX_CODE_ATTEMPTS = 5;
/** 이 시간 동안 아무도 없으면(혹은 이미 있으면) 확정한다 */
const PRESENCE_SETTLE_MS = 700;

export type OpenRoomResult = { ok: true; channel: RoomChannel } | { ok: false; reason: string };

export class RoomChannel {
  private closed = false;

  private constructor(
    readonly code: string,
    readonly self: RoomParticipant,
    private readonly channel: RealtimeChannel,
    private readonly supabase: SupabaseClient,
    private readonly eventsBox: EventsBox,
  ) {}

  /** 새 방을 만든다. 같은 코드를 쓰는 방이 이미 있으면 다른 코드로 다시 시도한다 */
  static async createRoom(self: RoomParticipant): Promise<OpenRoomResult> {
    const supabase = await getSupabaseClient();
    if (supabase === null) return { ok: false, reason: '온라인 대전을 설정할 수 없어요.' };

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = createRoomCode();
      const channel = supabase.channel(`room:${code}`, { config: { presence: { key: self.id } } });
      const eventsBox: EventsBox = { current: NOOP_EVENTS };
      let notifyLater: (() => void) | null = null;
      bindChannel(channel, eventsBox);

      const subscribed = await subscribeAndWait(channel, (status) => {
        if (status === 'CHANNEL_ERROR' || status === 'CLOSED') notifyLater?.();
      });
      if (!subscribed) {
        await supabase.removeChannel(channel);
        continue;
      }

      await waitMs(PRESENCE_SETTLE_MS);
      const occupied = Object.keys(channel.presenceState()).some((key) => key !== self.id);
      if (occupied) {
        await supabase.removeChannel(channel);
        continue;
      }

      await channel.track({ ...self, joinedAt: Date.now() } satisfies PresenceMeta);
      const instance = new RoomChannel(code, self, channel, supabase, eventsBox);
      notifyLater = () => instance.notifyDisconnected();
      return { ok: true, channel: instance };
    }

    return { ok: false, reason: '방을 여는 데 자꾸 실패해요. 다시 시도해 주세요.' };
  }

  /** 코드로 기존 방에 들어간다. 그 코드에 아무도 없으면 실패로 본다 */
  static async joinRoom(rawCode: string, self: RoomParticipant): Promise<OpenRoomResult> {
    const code = normalizeRoomCode(rawCode);
    if (code === null) return { ok: false, reason: '방 코드는 4자예요. 다시 확인해 주세요.' };

    const supabase = await getSupabaseClient();
    if (supabase === null) return { ok: false, reason: '온라인 대전을 설정할 수 없어요.' };

    const channel = supabase.channel(`room:${code}`, { config: { presence: { key: self.id } } });
    const eventsBox: EventsBox = { current: NOOP_EVENTS };
    let notifyLater: (() => void) | null = null;
    bindChannel(channel, eventsBox);

    const subscribed = await subscribeAndWait(channel, (status) => {
      if (status === 'CHANNEL_ERROR' || status === 'CLOSED') notifyLater?.();
    });
    if (!subscribed) {
      await supabase.removeChannel(channel);
      return { ok: false, reason: '방에 연결하지 못했어요. 다시 시도해 주세요.' };
    }

    await waitMs(PRESENCE_SETTLE_MS);
    const hasHost = Object.keys(channel.presenceState()).some((key) => key !== self.id);
    if (!hasHost) {
      await supabase.removeChannel(channel);
      return { ok: false, reason: `"${code}" 방을 찾을 수 없어요. 코드를 다시 확인해 주세요.` };
    }

    await channel.track({ ...self, joinedAt: Date.now() } satisfies PresenceMeta);
    const instance = new RoomChannel(code, self, channel, supabase, eventsBox);
    notifyLater = () => instance.notifyDisconnected();
    return { ok: true, channel: instance };
  }

  on(events: Partial<RoomChannelEvents>): void {
    this.eventsBox.current = { ...this.eventsBox.current, ...events };
  }

  /** 지금 이 방에 있는 사람 목록 (참가 순서대로) */
  participants(): RoomParticipant[] {
    return readParticipants(this.channel);
  }

  /** 방장이 대전을 시작한다. 방장 자신은 이 payload를 그대로 로컬에서 바로 쓰면 된다 */
  sendStart(payload: StartPayload): void {
    void this.channel.send({ type: 'broadcast', event: 'start', payload });
  }

  sendRoll(entry: RollLogEntry): void {
    void this.channel.send({ type: 'broadcast', event: 'roll', payload: entry });
  }

  requestState(): void {
    void this.channel.send({ type: 'broadcast', event: 'requestState', payload: {} });
  }

  sendStateSnapshot(payload: StateSnapshotPayload): void {
    void this.channel.send({ type: 'broadcast', event: 'stateSnapshot', payload });
  }

  leave(): void {
    if (this.closed) return;
    this.closed = true;
    void this.channel.untrack();
    void this.supabase.removeChannel(this.channel);
  }

  /** 내가 스스로 leave()한 게 아닌데 연결이 끊겼을 때만 알린다 */
  private notifyDisconnected(): void {
    if (this.closed) return;
    this.eventsBox.current.onDisconnected();
  }
}

/** `subscribe()` 전에 불러야 한다 — 클래스 상단 주석 참고 */
function bindChannel(channel: RealtimeChannel, box: EventsBox): void {
  channel
    .on('presence', { event: 'sync' }, () => {
      box.current.onParticipantsChange(readParticipants(channel));
    })
    .on('broadcast', { event: 'start' }, ({ payload }) => {
      box.current.onStart(payload as StartPayload);
    })
    .on('broadcast', { event: 'roll' }, ({ payload }) => {
      box.current.onRoll(payload as RollLogEntry);
    })
    .on('broadcast', { event: 'requestState' }, () => {
      box.current.onRequestState();
    })
    .on('broadcast', { event: 'stateSnapshot' }, ({ payload }) => {
      box.current.onStateSnapshot(payload as StateSnapshotPayload);
    });
}

function readParticipants(channel: RealtimeChannel): RoomParticipant[] {
  const state = channel.presenceState<PresenceMeta>();
  const rows: PresenceMeta[] = [];
  for (const [key, metas] of Object.entries(state)) {
    const meta = metas[0];
    if (meta !== undefined) rows.push({ ...meta, id: key });
  }
  rows.sort((a, b) => a.joinedAt - b.joinedAt);
  return rows.map(({ id, name, handedness }) => ({ id, name, handedness }));
}

/**
 * 구독하고 처음 연결될 때까지 기다린다. `onStatus`는 이후에도 계속 불린다 —
 * 연결된 뒤 끊기는 것(CHANNEL_ERROR/CLOSED)을 호출부가 감지할 수 있게 한다.
 */
function subscribeAndWait(
  channel: RealtimeChannel,
  onStatus: (status: string) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    channel.subscribe((status) => {
      onStatus(status);
      if (settled) return;
      if (status === 'SUBSCRIBED') {
        settled = true;
        resolve(true);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        settled = true;
        resolve(false);
      }
    });
  });
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
