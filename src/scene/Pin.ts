/**
 * 핀 메시. LatheGeometry로 실제 핀의 실루엣을 만든다.
 *
 * 물리 콜라이더(원기둥 3단)와 시각 모양은 일부러 다르다. 콜라이더는 단순해야
 * 안정적이고, 보이는 쪽은 실제 모양이어야 아이가 "볼링 핀"으로 알아본다.
 */

import * as THREE from 'three';
import { PIN } from '../config';
import { ALL_PINS, type PinNumber } from '../rules/pinLayout';
import { pinTexture } from './Textures';

const PIN_RADIUS = PIN.maxDiameter / 2;

/**
 * 핀 단면 (바닥 → 위). [높이 비율, 반지름 비율]
 * 실제 핀은 바닥에서 30% 지점이 가장 두껍고(벨리), 66% 지점에서 목이
 * 가장 좁아졌다가 머리에서 다시 부푼다.
 */
const PROFILE: readonly [number, number][] = [
  [0.0, 0.0],
  [0.0, 0.42],
  [0.02, 0.45],
  [0.08, 0.55],
  [0.18, 0.82],
  [0.3, 1.0],
  [0.42, 0.94],
  [0.55, 0.7],
  [0.66, 0.5],
  [0.72, 0.5],
  [0.79, 0.6],
  [0.88, 0.56],
  [0.95, 0.38],
  [1.0, 0.0],
];

function pinGeometry(): THREE.LatheGeometry {
  const points = PROFILE.map(
    ([yFrac, rFrac]) => new THREE.Vector2(rFrac * PIN_RADIUS, yFrac * PIN.height),
  );
  return new THREE.LatheGeometry(points, 24);
}

export class Pins {
  readonly group = new THREE.Group();
  /** 인덱스 0 = 1번 핀 */
  readonly meshes: THREE.Mesh[] = [];

  private readonly geometry: THREE.LatheGeometry;
  private plainMaterial: THREE.MeshStandardMaterial;
  private numberedMaterials: THREE.MeshStandardMaterial[];

  constructor() {
    this.geometry = pinGeometry();

    this.plainMaterial = new THREE.MeshStandardMaterial({
      map: pinTexture(null),
      roughness: 0.35,
      metalness: 0.05,
    });

    // 관찰 모드용 — 번호가 적힌 핀. 핀마다 텍스처가 달라야 하므로 10개.
    this.numberedMaterials = ALL_PINS.map(
      (pin) =>
        new THREE.MeshStandardMaterial({
          map: pinTexture(pin),
          roughness: 0.35,
          metalness: 0.05,
        }),
    );

    for (const pin of ALL_PINS) {
      const mesh = new THREE.Mesh(this.geometry, this.plainMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `pin-${pin}`;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
  }

  meshFor(pin: PinNumber): THREE.Mesh {
    return this.meshes[pin - 1]!;
  }

  setNumbersVisible(visible: boolean): void {
    for (const pin of ALL_PINS) {
      this.meshFor(pin).material = visible ? this.numberedMaterials[pin - 1]! : this.plainMaterial;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.plainMaterial.map?.dispose();
    this.plainMaterial.dispose();
    for (const m of this.numberedMaterials) {
      m.map?.dispose();
      m.dispose();
    }
  }
}
