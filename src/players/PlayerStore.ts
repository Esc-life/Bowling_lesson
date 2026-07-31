/**
 * 플레이어 목록 저장소.
 *
 * 진행률을 사람별로 나눈다. 공용 PC에서 왼손잡이와 오른손잡이가 번갈아
 * 쓰는데 손 설정과 진도가 전역이면 서로 계속 덮어쓴다.
 *
 * 옛 버전은 진행률을 기기당 하나(bowling3d.progress.v1)로 저장했다.
 * 그 데이터가 남아 있으면 첫 플레이어를 만들 때 진행률을 그대로 물려주고
 * 옛 키를 지운다. 쓰던 학생이 진도를 잃지 않아야 한다.
 *
 * 손은 물려받지 않는다. 만들기 화면에서 방금 고른 손이 언제나 이긴다.
 * 옛 값은 그 화면의 초기 선택(pendingHandedness)으로만 쓴다.
 */

import type { Handedness } from '../rules/pinLayout';
import { emptyProgress, type ProgressState } from '../tutorial/TutorialFlow';
import type { Player, StorageLike } from './types';

export type { Player, StorageLike } from './types';

const STORAGE_KEY = 'bowling3d.players.v1';
const LEGACY_PROGRESS_KEY = 'bowling3d.progress.v1';
const LEGACY_SETTINGS_KEY = 'bowling3d.settings.v1';

export const MAX_NAME_LENGTH = 12;

export type NameCheck = { ok: true; name: string } | { ok: false; reason: string };

/** 이름이 쓸 수 있는지 본다. 통과하면 공백을 지운 이름을 돌려준다 */
export function checkName(raw: string, existing: readonly Player[]): NameCheck {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, reason: '이름을 적어 주세요.' };
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, reason: `이름은 ${MAX_NAME_LENGTH}자까지 쓸 수 있어요.` };
  }
  if (existing.some((p) => p.name === name)) {
    return { ok: false, reason: '이미 있는 이름이에요. 다른 이름을 지어 주세요.' };
  }
  return { ok: true, name };
}

/** 테스트와 사생활 보호 모드에서 쓰는 메모리 저장소 */
export function memoryStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function browserStorage(): StorageLike {
  try {
    // 사생활 보호 모드에서는 접근만으로도 던질 수 있다
    const probe = '__bowling3d_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return memoryStorage();
  }
}

function isProgressState(v: unknown): v is ProgressState {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  // quizScores의 null을 반드시 걸러야 한다. typeof null이 'object'라
  // 그냥 통과시키면 TutorialFlow의 Object.entries(null)에서 터지고,
  // 그건 앱이 아예 뜨지 않는다는 뜻이다.
  const scores = o['quizScores'];
  if (typeof scores !== 'object' || scores === null) return false;
  return Array.isArray(o['completedLessons']);
}

function sanitizePlayer(v: unknown): Player | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const id = o['id'];
  const name = o['name'];
  const hand = o['handedness'];
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof name !== 'string' || name.trim().length === 0) return null;
  if (hand !== 'left' && hand !== 'right') return null;
  return {
    id,
    name: name.trim(),
    handedness: hand,
    progress: isProgressState(o['progress']) ? (o['progress'] as ProgressState) : emptyProgress(),
    createdAt: typeof o['createdAt'] === 'number' ? o['createdAt'] : 0,
  };
}

function newId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

type Listener = (store: PlayerStore) => void;

export class PlayerStore {
  private list: Player[] = [];
  private currentId: string | null = null;
  private legacy: { progress: ProgressState; handedness: Handedness | null } | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly storage: StorageLike = browserStorage()) {
    this.load();
    if (this.list.length === 0) this.legacy = this.readLegacy();
  }

  get players(): readonly Player[] {
    return this.list;
  }

  get current(): Player | null {
    return this.list.find((p) => p.id === this.currentId) ?? null;
  }

  /** 옛 진행률이 남아 있어 첫 플레이어가 물려받을 수 있는가 */
  get pendingMigration(): boolean {
    return this.legacy !== null;
  }

  /**
   * 옛 설정에 저장돼 있던 손. 이관할 것이 없거나 옛 설정이 깨졌으면 null.
   *
   * 만들기 화면의 손 버튼을 어느 쪽으로 켜 둘지 정하는 데만 쓴다.
   * 강제하지 않는다 — 최종 결정은 화면에서 고른 값이다.
   */
  get pendingHandedness(): Handedness | null {
    return this.legacy?.handedness ?? null;
  }

  select(id: string): void {
    if (!this.list.some((p) => p.id === id)) {
      throw new Error(`없는 플레이어입니다: ${id}`);
    }
    this.currentId = id;
    this.persist();
  }

  create(rawName: string, handedness: Handedness): Player {
    const check = checkName(rawName, this.list);
    if (!check.ok) throw new Error(check.reason);

    // 옛 진행률은 물려받는다. 손은 물려받지 않는다 — 방금 화면에서 고른
    // 값이 언제나 이긴다. 옛 값이 이기면, 왼손 학생이 왼손을 눌러도
    // 오른손으로 굳어 버리고 손을 바꾸는 화면이 없어 되돌릴 수가 없다.
    // 옛 손은 pendingHandedness로 노출해 만들기 화면의 초기 선택에만 쓴다.
    const inherited = this.legacy;
    const player: Player = {
      id: newId(),
      name: check.name,
      handedness,
      progress: inherited?.progress ?? emptyProgress(),
      createdAt: Date.now(),
    };

    if (inherited !== null) {
      this.legacy = null;
      this.storage.removeItem(LEGACY_PROGRESS_KEY);
    }

    this.list.push(player);
    this.currentId = player.id;
    this.persist();
    return player;
  }

  remove(id: string): void {
    this.list = this.list.filter((p) => p.id !== id);
    if (this.currentId === id) {
      this.currentId = this.list[0]?.id ?? null;
    }
    this.persist();
  }

  saveProgress(id: string, progress: ProgressState): void {
    const player = this.list.find((p) => p.id === id);
    if (player === undefined) throw new Error(`없는 플레이어입니다: ${id}`);
    player.progress = progress;
    this.persist();
  }

  findByName(name: string): Player | null {
    const trimmed = name.trim();
    return this.list.find((p) => p.name === trimmed) ?? null;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  // ---------------------------------------------------------------------------

  private load(): void {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw === null) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // 깨진 데이터 — 빈 목록으로 시작한다
    }
    if (typeof parsed !== 'object' || parsed === null) return;

    const o = parsed as Record<string, unknown>;
    const players = Array.isArray(o['players']) ? o['players'] : [];
    this.list = players
      .map(sanitizePlayer)
      .filter((p): p is Player => p !== null);

    const last = o['lastPlayerId'];
    this.currentId =
      typeof last === 'string' && this.list.some((p) => p.id === last)
        ? last
        : (this.list[0]?.id ?? null);
  }

  private readLegacy(): { progress: ProgressState; handedness: Handedness | null } | null {
    const raw = this.storage.getItem(LEGACY_PROGRESS_KEY);
    if (raw === null) return null;

    let progress: unknown;
    try {
      progress = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!isProgressState(progress)) return null;

    let handedness: Handedness | null = null;
    const settingsRaw = this.storage.getItem(LEGACY_SETTINGS_KEY);
    if (settingsRaw !== null) {
      try {
        const s = JSON.parse(settingsRaw) as Record<string, unknown>;
        const h = s['handedness'];
        if (h === 'left' || h === 'right') handedness = h;
      } catch {
        /* 설정이 깨졌으면 초기 선택 없이 기본값(오른손)으로 연다 */
      }
    }

    return { progress: progress as ProgressState, handedness };
  }

  private persist(): void {
    try {
      this.storage.setItem(
        STORAGE_KEY,
        JSON.stringify({ players: this.list, lastPlayerId: this.currentId }),
      );
    } catch {
      /* 저장 실패해도 수업은 계속되어야 한다 */
    }
    for (const fn of this.listeners) fn(this);
  }
}

/** 앱 전역에서 쓰는 인스턴스 */
export const players = new PlayerStore();
