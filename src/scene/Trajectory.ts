/**
 * 공이 지나간 길을 선으로 남긴다.
 *
 * 튜토리얼 D3("공은 왜 휘나요?")의 핵심 교구다. 물리엔진이 이미 계산하고
 * 있는 것을 시각화만 하므로 비용이 거의 없는데, 회전을 준 공과 주지 않은
 * 공의 궤적을 나란히 남기면 오일 구간의 역할이 눈으로 보인다.
 */

import * as THREE from 'three';
import { OBSERVE } from '../config';

const MAX = OBSERVE.trajectoryMaxPoints;

class Trail {
  readonly line: THREE.Line;
  private readonly positions = new Float32Array(MAX * 3);
  private count = 0;

  constructor(color: number, opacity: number) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setDrawRange(0, 0);
    this.line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );
    this.line.frustumCulled = false;
  }

  clear(): void {
    this.count = 0;
    this.line.geometry.setDrawRange(0, 0);
  }

  push(x: number, y: number, z: number): void {
    if (this.count >= MAX) return;
    const i = this.count * 3;
    this.positions[i] = x;
    this.positions[i + 1] = y;
    this.positions[i + 2] = z;
    this.count++;
    this.line.geometry.setDrawRange(0, this.count);
    (this.line.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  get length(): number {
    return this.count;
  }

  dispose(): void {
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
  }
}

export class Trajectory {
  readonly group = new THREE.Group();

  /** 지금 굴러가는 공 */
  private readonly live = new Trail(0xffd166, 0.95);
  /** 직전 투구 — 비교용으로 남긴다 */
  private readonly previous = new Trail(0x8f9aa8, 0.45);

  private sampleTimer = 0;

  constructor() {
    this.group.add(this.live.line);
    this.group.add(this.previous.line);
    this.group.visible = false;
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /** 새 투구를 시작한다. 직전 궤적은 회색으로 남는다. */
  beginThrow(): void {
    if (this.live.length > 0) {
      this.previous.clear();
      this.copyLiveToPrevious();
    }
    this.live.clear();
    this.sampleTimer = 0;
  }

  private copyLiveToPrevious(): void {
    const attr = this.live.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const n = this.live.length;
    for (let i = 0; i < n; i++) {
      this.previous.push(attr.getX(i), attr.getY(i), attr.getZ(i));
    }
  }

  /** 매 프레임 공 위치를 넣는다. 너무 촘촘히 쌓지 않도록 간격을 둔다. */
  sample(dt: number, x: number, y: number, z: number): void {
    this.sampleTimer += dt;
    if (this.sampleTimer < 1 / 60) return;
    this.sampleTimer = 0;
    // 레인 표면 살짝 위에 그려야 선이 바닥에 파묻히지 않는다
    this.live.push(x, Math.max(y, 0.01), z);
  }

  clearAll(): void {
    this.live.clear();
    this.previous.clear();
  }

  dispose(): void {
    this.live.dispose();
    this.previous.dispose();
  }
}
