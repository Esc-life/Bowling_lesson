/**
 * 드래그 중에 보이는 조준선.
 *
 * 파워는 선의 길이와 색으로, 방향은 선의 각도로 보여준다. 회전(스핀)은
 * 선 끝의 휘어짐으로 암시한다. 아이가 "내가 지금 어떻게 던지려는지"를
 * 던지기 전에 알 수 있어야 한다.
 */

import * as THREE from 'three';
import { BALL, THROW } from '../config';

const SEGMENTS = 24;

export class AimGuide {
  readonly object: THREE.Object3D;

  private readonly line: THREE.Line;
  private readonly material: THREE.LineBasicMaterial;
  private readonly positions: Float32Array;

  constructor() {
    this.positions = new Float32Array((SEGMENTS + 1) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    this.material = new THREE.LineBasicMaterial({ color: 0x7ee787, transparent: true, opacity: 0.9 });
    this.line = new THREE.Line(geo, this.material);
    this.line.visible = false;
    this.line.frustumCulled = false;

    this.object = this.line;
  }

  hide(): void {
    this.line.visible = false;
  }

  /**
   * @param startX 공의 좌우 시작 위치
   * @param power  0~1
   * @param angle  발사 각도 (라디안)
   * @param spin   회전 (rad/s)
   */
  show(startX: number, power: number, angle: number, spin: number): void {
    this.line.visible = true;

    // 파워에 비례해 선이 길어진다. 최대 파워에서 화살표 근처까지.
    const length = 1.2 + power * 5.5;
    // 회전이 클수록 선 끝이 휜다 — 실제로 공이 휘는 방향과 같게
    const curve = (spin / THROW.maxSpin) * 0.55;

    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const z = t * length;
      // 직선 성분 + 뒤쪽에서 커지는 휘어짐(t²)
      const x = startX + Math.tan(angle) * z + curve * t * t;
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = BALL.radius * 0.4;
      this.positions[i * 3 + 2] = z;
    }

    const attr = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;

    // 초록 → 노랑 → 빨강. 파워가 셀수록 위험하다는 신호.
    this.material.color.setHSL(0.33 * (1 - power), 0.75, 0.6);
  }

  dispose(): void {
    this.line.geometry.dispose();
    this.material.dispose();
  }
}
