/**
 * 전역 표시 설정 (난이도, 관찰 옵션).
 *
 * 투구 손은 여기 없다. 공용 PC에서 왼손잡이와 오른손잡이가 번갈아 쓰면
 * 전역 설정이 서로 덮어써 버린다. 손은 플레이어마다 저장한다
 * (players/PlayerStore.ts).
 *
 * 스키마 버전을 키에 넣어 두면 나중에 설정 항목이 바뀌어도 옛 저장
 * 데이터가 앱을 깨뜨리지 않는다. 모르는 값은 조용히 기본값으로 되돌린다.
 */

import { DIFFICULTY, type DifficultyName } from './config';

const STORAGE_KEY = 'bowling3d.settings.v2';

export type Settings = {
  difficulty: DifficultyName;
  /** 관찰 모드: 핀 번호 표시 */
  showPinNumbers: boolean;
  /** 관찰 모드: 오일 구간 표시 */
  showOilZone: boolean;
  /** 관찰 모드: 공 궤적 표시 */
  showTrajectory: boolean;
};

const DEFAULTS: Settings = {
  difficulty: 'easy',
  showPinNumbers: false,
  showOilZone: false,
  showTrajectory: false,
};

function isDifficulty(v: unknown): v is DifficultyName {
  return typeof v === 'string' && v in DIFFICULTY;
}

function sanitize(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULTS };
  const o = raw as Record<string, unknown>;
  return {
    difficulty: isDifficulty(o['difficulty']) ? o['difficulty'] : DEFAULTS.difficulty,
    showPinNumbers: o['showPinNumbers'] === true,
    showOilZone: o['showOilZone'] === true,
    showTrajectory: o['showTrajectory'] === true,
  };
}

type Listener = (s: Settings) => void;

class SettingsStore {
  private current: Settings;
  private readonly listeners = new Set<Listener>();

  constructor() {
    this.current = sanitize(readStorage());
  }

  get value(): Readonly<Settings> {
    return this.current;
  }

  update(patch: Partial<Settings>): void {
    this.current = sanitize({ ...this.current, ...patch });
    writeStorage(this.current);
    for (const fn of this.listeners) fn(this.current);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** 공용 PC에서 다음 학생을 위해 전부 비운다 */
  clear(): void {
    this.current = { ...DEFAULTS };
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* 사생활 보호 모드 등에서 실패할 수 있다 — 메모리 상태만 되돌린다 */
    }
    for (const fn of this.listeners) fn(this.current);
  }
}

function readStorage(): unknown {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStorage(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* 저장 실패해도 게임은 계속되어야 한다 */
  }
}

export const settings = new SettingsStore();
