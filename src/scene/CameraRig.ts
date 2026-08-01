/**
 * 카메라 모드 전환.
 *
 * 이름 붙은 모드를 두고 위치·시선을 부드럽게 보간한다. 공이 18m를 가는
 * 동안 카메라가 고정되어 있으면 핀이 점처럼 작아져서 무슨 일이 일어나는지
 * 알 수 없다.
 */

import * as THREE from 'three';
import { LANE } from '../config';

export type CameraMode =
  /** 조준 — 공 뒤에서 레인을 내려다본다 */
  | 'aim'
  /** 추적 — 공을 따라간다 */
  | 'follow'
  /** 핀덱 — 핀 뒤쪽에서 본다 */
  | 'pindeck'
  /** 결과 — 남은 핀이 보이게 물러난다 */
  | 'result'
  /** 상면도 — 조준선과 오일 구간 설명용 (수업 시연) */
  | 'topdown';

type Shot = { position: THREE.Vector3; look: THREE.Vector3 };

/** 공이 이 Z를 넘으면 핀덱 카메라로 컷 */
export const PINDECK_CUT_Z = 15;

export class CameraRig {
  private mode: CameraMode = 'aim';
  private readonly position = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly targetPosition = new THREE.Vector3();
  private readonly targetLook = new THREE.Vector3();
  private snapNext = true;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    const shot = this.shotFor('aim', new THREE.Vector3(0, 0, 0));
    this.position.copy(shot.position);
    this.look.copy(shot.look);
    this.apply();
  }

  get current(): CameraMode {
    return this.mode;
  }

  setMode(mode: CameraMode, snap = false): void {
    if (this.mode === mode) return;
    this.mode = mode;
    if (snap) this.snapNext = true;
  }

  /** 공 위치에 따라 자동으로 모드를 고른다 (자유 투구 중) */
  autoMode(ballZ: number, thrown: boolean): void {
    if (!thrown) {
      this.setMode('aim');
    } else if (ballZ > PINDECK_CUT_Z) {
      // follow 카메라는 공을 바짝 쫓아가고 pindeck 카메라는 핀 뒤 고정
      // 위치라, 둘 사이를 보간하면 공이 핀 쪽으로 순간이동하는 것처럼
      // 보인다("점프"). 그래서 부드럽게 넘기지 않고 실제로 컷한다.
      this.setMode('pindeck', true);
    } else {
      this.setMode('follow');
    }
  }

  private shotFor(mode: CameraMode, ball: THREE.Vector3): Shot {
    switch (mode) {
      case 'aim':
        // 공 바로 뒤에 붙이면 공이 화면 아래로 잘린다. 실제 투구자가 서는
        // 어프로치 뒤쪽(약 4.3m)까지 물러나면 공이 화면 중간 아래에 온다.
        return {
          position: new THREE.Vector3(ball.x * 0.6, 1.5, -4.3),
          look: new THREE.Vector3(ball.x * 0.3, 0.3, 9.0),
        };
      case 'follow':
        return {
          position: new THREE.Vector3(ball.x * 0.8, 0.95, ball.z - 2.6),
          look: new THREE.Vector3(ball.x * 0.5, 0.2, ball.z + 4.5),
        };
      case 'pindeck':
        // follow에서 컷할 때 x=0으로 완전히 고정하면, 회전이 강해 공이
        // 레인 옆쪽으로 많이 흘러간 상태에서 컷될 때 프레임 안에서 공이
        // 크게 옆으로 튀는 것처럼 보인다("점프"). 공의 실제 x를 일부만
        // 반영해 컷 폭을 줄인다 (follow의 0.8보다 훨씬 약하게 — 완전히
        // 따라가면 다시 "핀 쪽으로 순간이동" 문제가 재현된다).
        return {
          position: new THREE.Vector3(ball.x * 0.25, 1.5, LANE.headPinZ + 3.4),
          look: new THREE.Vector3(ball.x * 0.15, 0.25, LANE.headPinZ + 0.2),
        };
      case 'result':
        return {
          position: new THREE.Vector3(0, 2.1, LANE.headPinZ - 3.0),
          look: new THREE.Vector3(0, 0.2, LANE.headPinZ + 0.5),
        };
      case 'topdown':
        // 완전히 수직으로 내려다보면 시야에 12m 폭이 들어와 1m짜리 레인이
        // 가느다란 띠가 되고, 카메라 up 벡터도 불안정해진다. 비스듬히 내려보며
        // 화살표와 조준선이 함께 보이게 잡는다 (수업 시연용).
        return {
          position: new THREE.Vector3(0, 5.2, -0.6),
          look: new THREE.Vector3(0, 0, 7.0),
        };
    }
  }

  /**
   * @param dt 실제 경과 시간 (초)
   * @param ball 공의 현재 위치
   */
  update(dt: number, ball: THREE.Vector3): void {
    const shot = this.shotFor(this.mode, ball);
    this.targetPosition.copy(shot.position);
    this.targetLook.copy(shot.look);

    if (this.snapNext) {
      this.position.copy(this.targetPosition);
      this.look.copy(this.targetLook);
      this.snapNext = false;
    } else {
      // 프레임레이트에 무관한 지수 감쇠 보간
      const t = 1 - Math.exp(-6 * dt);
      this.position.lerp(this.targetPosition, t);
      this.look.lerp(this.targetLook, t);
    }

    this.apply();
  }

  private apply(): void {
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.look);
  }
}
