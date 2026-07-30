/**
 * 볼링 레인 메시. 기본 도형 + 절차적 텍스처만 쓴다.
 *
 * 화살표와 도트의 위치는 config에서 가져온다. 튜토리얼이 "화살표를 보고
 * 조준하세요"라고 가르치는데 화면의 화살표가 실제 규격과 다른 곳에 있으면
 * 교육 자료로서 틀린 것이 된다.
 */

import * as THREE from 'three';
import { ARROWS, LANE, OIL } from '../config';
import { arrowX, boardToX, TARGET_ARROW, type Handedness } from '../rules/pinLayout';
import { approachWoodTexture, gutterTexture, laneWoodTexture } from './Textures';

const HALF_WIDTH = LANE.width / 2;
const OUTER_X = HALF_WIDTH + LANE.gutterWidth;

/** 레인 표시선의 높이. 오일 오버레이(0.004)보다 위여야 가려지지 않는다 */
const MARKING_Y = 0.006;

/** y=0 평면에 눕힌 사각형 */
function flatPlane(width: number, length: number, material: THREE.Material): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(width, length);
  geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, material);
}

/**
 * 위를 향한 삼각형 여러 개를 XZ 평면에 직접 만든다.
 * ShapeGeometry를 회전시키는 것보다 좌표를 직접 쓰는 편이 헷갈리지 않는다.
 *
 * @param indices 그릴 화살표 번호들 (주손 쪽에서 1번부터)
 * @param scale   크기 배율 (기준 화살표를 조금 크게 그리는 데 쓴다)
 */
function arrowsGeometry(
  hand: Handedness,
  indices: readonly number[],
  scale = 1,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const halfW = 0.028 * scale;
  const nearZ = ARROWS.nearZ;
  const farZ = ARROWS.nearZ + (ARROWS.farZ - ARROWS.nearZ) * scale;

  for (const i of indices) {
    const cx = arrowX(i, hand);
    // 앞이 뾰족한 삼각형 (진행 방향 = +Z).
    //
    // 정점 순서가 중요하다. 반시계 방향으로 감아야 법선이 +Y(위)를 향한다.
    // 순서를 뒤집으면 법선이 아래를 보고, 기본 앞면 컬링에 걸려 위에서
    // 볼 때 아무것도 보이지 않는다.
    positions.push(cx, 0, farZ);
    positions.push(cx + halfW, 0, nearZ);
    positions.push(cx - halfW, 0, nearZ);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/** 기준 화살표를 뺀 나머지 번호 */
function otherArrows(): number[] {
  const all: number[] = [];
  for (let i = 1; i <= ARROWS.count; i++) {
    if (i !== TARGET_ARROW) all.push(i);
  }
  return all;
}

export class Lane {
  readonly group = new THREE.Group();

  private readonly oilOverlay: THREE.Mesh;
  private arrows: THREE.Mesh;
  private targetArrow: THREE.Mesh;
  private dots: THREE.Group;
  private readonly markingMaterial: THREE.MeshBasicMaterial;
  private readonly targetMaterial: THREE.MeshBasicMaterial;

  constructor(hand: Handedness) {
    const laneLength = LANE.pitZ;

    // ---- 레인 표면 ----
    const laneMat = new THREE.MeshStandardMaterial({
      map: laneWoodTexture(laneLength / LANE.width),
      roughness: 0.28,
      metalness: 0.0,
    });
    const lane = flatPlane(LANE.width, laneLength, laneMat);
    lane.position.set(0, 0, laneLength / 2);
    lane.receiveShadow = true;
    this.group.add(lane);

    // ---- 어프로치 (파울라인 앞, 걸어오는 곳) ----
    const approachMat = new THREE.MeshStandardMaterial({
      map: approachWoodTexture(LANE.approachLength / LANE.width),
      roughness: 0.5,
    });
    const approach = flatPlane(LANE.width + LANE.gutterWidth * 2, LANE.approachLength, approachMat);
    approach.position.set(0, 0, -LANE.approachLength / 2);
    approach.receiveShadow = true;
    this.group.add(approach);

    // ---- 핀덱 (핀이 서는 부분은 재질이 다르다) ----
    const deckMat = new THREE.MeshStandardMaterial({ color: 0xb9b3a6, roughness: 0.5 });
    const deckStart = 17.9;
    const deck = flatPlane(LANE.width, LANE.pitZ - deckStart, deckMat);
    deck.position.set(0, 0.001, deckStart + (LANE.pitZ - deckStart) / 2);
    deck.receiveShadow = true;
    this.group.add(deck);

    // ---- 거터 ----
    const gutterMat = new THREE.MeshStandardMaterial({
      map: gutterTexture(),
      roughness: 0.45,
      metalness: 0.35,
    });
    for (const side of [-1, 1]) {
      const gutter = flatPlane(LANE.gutterWidth, laneLength, gutterMat);
      gutter.position.set(side * (HALF_WIDTH + LANE.gutterWidth / 2), -LANE.gutterDepth, laneLength / 2);
      this.group.add(gutter);

      // 레인과 거터 사이 단차
      const lipGeo = new THREE.PlaneGeometry(laneLength, LANE.gutterDepth);
      const lip = new THREE.Mesh(lipGeo, gutterMat);
      lip.rotation.y = side * (Math.PI / 2);
      lip.position.set(side * HALF_WIDTH, -LANE.gutterDepth / 2, laneLength / 2);
      this.group.add(lip);

      // 바깥 벽
      const wallGeo = new THREE.PlaneGeometry(laneLength, 1.0);
      const wall = new THREE.Mesh(
        wallGeo,
        new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.85, side: THREE.DoubleSide }),
      );
      wall.rotation.y = side * (Math.PI / 2);
      wall.position.set(side * OUTER_X, 0.5 - LANE.gutterDepth, laneLength / 2);
      this.group.add(wall);
    }

    // ---- 파울라인 ----
    this.markingMaterial = new THREE.MeshBasicMaterial({ color: 0x3a2a18 });
    // 표시선들은 오일 오버레이(y=0.004)보다 위에 둔다. 아래에 두면 관찰
    // 모드를 켰을 때 조준 화살표가 파란 막에 덮여 보이지 않는다.
    const foulLine = flatPlane(LANE.width + LANE.gutterWidth * 2, 0.03, this.markingMaterial);
    foulLine.position.set(0, MARKING_Y, 0);
    this.group.add(foulLine);

    // ---- 조준 화살표 7개 ----
    //
    // 화살표의 위치 자체는 좌우 대칭이므로 손을 바꿔도 그대로다. 바뀌는 것은
    // "몇 번 화살표인가"이고, 기본 조준점인 2번 화살표는 주손 쪽에 있다.
    // 그래서 2번만 색과 크기를 달리해 표시한다 — 레슨 D1이 가르치는 바로
    // 그 기준점을 아이가 화면에서 찾을 수 있어야 한다.
    this.arrows = new THREE.Mesh(arrowsGeometry(hand, otherArrows()), this.markingMaterial);
    this.arrows.position.y = MARKING_Y;
    this.group.add(this.arrows);

    this.targetMaterial = new THREE.MeshBasicMaterial({ color: 0xe8623c });
    this.targetArrow = new THREE.Mesh(
      arrowsGeometry(hand, [TARGET_ARROW], 1.35),
      this.targetMaterial,
    );
    this.targetArrow.position.y = MARKING_Y + 0.001;
    this.group.add(this.targetArrow);

    // ---- 어프로치 도트 (서는 위치의 기준점) ----
    this.dots = this.buildDots(hand);
    this.group.add(this.dots);

    // ---- 오일 구간 표시 (관찰 모드에서 켠다) ----
    //
    // 수업에서 "여기까지가 기름칠한 곳"을 보여주는 교구다. 은근하게 깔면
    // 따뜻한 조명에 묻혀 아이 눈에 안 보인다. 교구는 명확해야 한다.
    const oilMat = new THREE.MeshBasicMaterial({
      color: 0x3aa8e0,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    this.oilOverlay = flatPlane(LANE.width, OIL.endZ, oilMat);
    this.oilOverlay.position.set(0, 0.004, OIL.endZ / 2);
    this.oilOverlay.visible = false;
    this.group.add(this.oilOverlay);

    // ---- 핏 (공과 핀이 떨어지는 곳) ----
    const pitMat = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 1 });
    const pitFloor = flatPlane(LANE.width + LANE.gutterWidth * 2, 2.4, pitMat);
    pitFloor.position.set(0, -1.2, LANE.pitZ + 1.2);
    this.group.add(pitFloor);

    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(LANE.width + LANE.gutterWidth * 2 + 1, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x1b2028, roughness: 0.9 }),
    );
    backWall.position.set(0, 0.1, LANE.pitZ + 2.4);
    backWall.rotation.y = Math.PI;
    this.group.add(backWall);
  }

  private buildDots(hand: Handedness): THREE.Group {
    const group = new THREE.Group();
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x3a2a18 });
    const geo = new THREE.CircleGeometry(0.012, 12);
    geo.rotateX(-Math.PI / 2);

    // 파울라인 바로 앞 도트 7개 + 뒤쪽(약 3.7m) 도트 5개
    const rows: { z: number; boards: number[] }[] = [
      { z: -0.15, boards: [5, 10, 15, 20, 25, 30, 35] },
      { z: -3.6, boards: [10, 15, 20, 25, 30] },
    ];

    for (const row of rows) {
      for (const board of row.boards) {
        const dot = new THREE.Mesh(geo, dotMat);
        dot.position.set(boardToX(board, hand), MARKING_Y, row.z);
        group.add(dot);
      }
    }
    return group;
  }

  /**
   * 왼손/오른손을 바꾼다.
   *
   * 화살표와 도트의 위치는 좌우 대칭이라 그대로지만, 기준(2번) 화살표는
   * 주손 쪽으로 옮겨져야 한다.
   */
  setHandedness(hand: Handedness): void {
    this.arrows.geometry.dispose();
    this.arrows.geometry = arrowsGeometry(hand, otherArrows());

    this.targetArrow.geometry.dispose();
    this.targetArrow.geometry = arrowsGeometry(hand, [TARGET_ARROW], 1.35);

    this.group.remove(this.dots);
    disposeGroup(this.dots);
    this.dots = this.buildDots(hand);
    this.group.add(this.dots);
  }

  setOilZoneVisible(visible: boolean): void {
    this.oilOverlay.visible = visible;
  }
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.geometry.dispose();
  });
}
