/**
 * 플레이어 저장에 쓰는 타입.
 *
 * 계정이 아니다. 공용 PC 한 대에서 여러 학생이 이름만 구분해 쓰는 것이
 * 목적이라 비밀번호도 서버도 없다.
 */

import type { Handedness } from '../rules/pinLayout';
import type { ProgressState } from '../tutorial/TutorialFlow';

export type Player = {
  id: string;
  name: string;
  /** 만들 때 고른 손. 포켓·화살표·드릴 목표가 전부 이 값에 맞춰진다 */
  handedness: Handedness;
  progress: ProgressState;
  createdAt: number;
};

/**
 * localStorage와 같은 모양의 최소 인터페이스.
 *
 * 테스트가 environment: 'node'에서 돌기 때문에 localStorage가 없다.
 * 주입할 수 있게 열어 두면 저장 로직을 그대로 테스트할 수 있다.
 */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
