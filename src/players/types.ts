/**
 * 플레이어 저장에 쓰는 타입.
 *
 * 계정은 교사만 만든다(TeacherRegister). 학생은 교사가 발급한 로그인 코드로만
 * 들어오므로, 이 로컬 레코드는 서버 계정(`code`)의 이 기기용 사본이다. `code`도
 * `isMaster`도 없는 플레이어는 없다 — 있다면 옛 버전(이름만으로 만들던 시절)의
 * 잔재다.
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
  /** 교사가 발급한 로그인 코드. 이 값으로 서버 계정과 진행률을 동기화한다 */
  code?: string;
  /** 마스터(교사) 계정 — 실제 진행률과 무관하게 항상 다 배운 것으로 취급한다 */
  isMaster?: boolean;
  /**
   * 로그인할 때 확인한 교사 인증 코드. isMaster 계정에만 있다.
   * 학생 등록·학생 기록 조회가 이 값을 그대로 재사용해, 계정을 고른 뒤에는
   * 코드를 또 묻지 않는다(로그인은 목록에서 계정을 고를 때 한 번으로 끝난다).
   */
  teacherCode?: string;
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
