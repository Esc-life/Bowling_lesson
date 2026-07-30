/**
 * 사용자 설정 (투구 손, 난이도, 표시 옵션).
 *
 * 스키마 버전을 키에 넣어 두면 나중에 설정 항목이 바뀌어도 옛 저장
 * 데이터가 앱을 깨뜨리지 않는다. 모르는 값은 조용히 기본값으로 되돌린다.
 */

import { DIFFICULTY, type DifficultyName } from './config';
import type { Handedness } from './rules/pinLayout';

const STORAGE_KEY = 'bowling3d.settings.v1';

export type Settings = {
  /** 아직 한 번도 고르지 않았으면 null → 시작 화면에서 물어본다 */
  handedness: Handedness | null;
  difficulty: DifficultyName;
  /** 관찰 모드: 핀 번호 표시 */
  showPinNumbers: boolean;
  /** 관찰 모드: 오일 구간 표시 */
  showOilZone: boolean;
  /** 관찰 모드: 공 궤적 표시 */
  showTrajectory: boolean;
};

const DEFAULTS: Settings = {
  handedness: null,
  difficulty: 'easy',
  showPinNumbers: false,
  showOilZone: false,
  showTrajectory: false,
};

function isHandedness(v: unknown): v is Handedness {
  return v === 'right' || v === 'left';
}

function isDifficulty(v: unknown): v is DifficultyName {
  return typeof v === 'string' && v in DIFFICULTY;
}

function sanitize(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULTS };
  const o = raw as Record<string, unknown>;
  return {
    handedness: isHandedness(o['handedness']) ? o['handedness'] : DEFAULTS.handedness,
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

  /** 손을 아직 고르지 않았는가 → 시작 화면을 띄울지 판단 */
  get needsHandChoice(): boolean {
    return this.current.handedness === null;
  }

  /** 손을 고르기 전에도 판정이 필요할 때의 기본값 */
  get hand(): Handedness {
    return this.current.handedness ?? 'right';
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
