/**
 * 절차적 텍스처. 외부 이미지 파일을 하나도 쓰지 않는다.
 *
 * 코드로 그리면 치수를 config에서 가져올 수 있어서, 교육 자료에
 * "화살표는 파울라인에서 4m쯤"이라고 써 놓고 화면의 화살표는 다른 곳에
 * 있는 사고가 나지 않는다.
 */

import * as THREE from 'three';
import { createCanvas, circle, fill, text, woodGrain } from './canvas2d';
import { seededRandom } from '../util/random';

function toTexture(canvas: HTMLCanvasElement, repeatY = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, repeatY);
  tex.anisotropy = 8;
  return tex;
}

/** 레인 표면 — 밝은 단풍나무 */
export function laneWoodTexture(repeatY: number): THREE.CanvasTexture {
  const c = createCanvas(512, 512);
  woodGrain(c, seededRandom(1337), {
    boards: 39,
    base: '#d9a862',
    light: '#e8c288',
    dark: '#bd8a49',
  });
  return toTexture(c.canvas, repeatY);
}

/** 어프로치(걸어오는 곳) — 조금 더 어둡다 */
export function approachWoodTexture(repeatY: number): THREE.CanvasTexture {
  const c = createCanvas(512, 256);
  woodGrain(c, seededRandom(4242), {
    boards: 39,
    base: '#9c6b3c',
    light: '#b3814d',
    dark: '#7d5430',
  });
  return toTexture(c.canvas, repeatY);
}

/** 거터(양옆 홈) — 어두운 금속 느낌 */
export function gutterTexture(): THREE.CanvasTexture {
  const c = createCanvas(64, 256);
  fill(c, '#33373d');
  const rng = seededRandom(99);
  for (let i = 0; i < 200; i++) {
    c.ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.2)';
    c.ctx.fillRect(rng() * 64, rng() * 256, 2, 1);
  }
  return toTexture(c.canvas, 1);
}

/**
 * 핀 무늬. LatheGeometry의 UV는 v가 프로파일(아래→위) 방향이므로
 * 가로 띠를 그리면 핀을 감는 링이 된다.
 *
 * @param label 표시할 핀 번호. null이면 번호 없음(기본)
 */
export function pinTexture(label: number | null): THREE.CanvasTexture {
  const c = createCanvas(256, 512);
  const { ctx } = c;

  // 바탕은 살짝 노란빛이 도는 흰색 — 순백은 화면에서 떠 보인다
  fill(c, '#f6f4ee');

  // 목 부분 빨간 링 두 줄. v = 0(아래) ~ 1(위)이므로 y는 위에서 아래로
  // 뒤집어 계산한다.
  const band = (vFrom: number, vTo: number) => {
    const yTop = (1 - vTo) * c.h;
    const yBottom = (1 - vFrom) * c.h;
    ctx.fillStyle = '#d8342c';
    ctx.fillRect(0, yTop, c.w, yBottom - yTop);
  };
  band(0.7, 0.745);
  band(0.775, 0.82);

  // 아래쪽 살짝 그림자 — 입체감
  const grad = ctx.createLinearGradient(0, c.h * 0.75, 0, c.h);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, c.h * 0.75, c.w, c.h * 0.25);

  if (label !== null) {
    // 몸통 앞면(u ≈ 0.5)에 번호. 관찰 모드에서 켠다.
    text(ctx, String(label), c.w * 0.5, c.h * 0.62, {
      size: 74,
      color: '#1b2430',
      weight: '800',
    });
  }

  const tex = new THREE.CanvasTexture(c.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** 공 — 단색 + 소용돌이 + 손가락 구멍 세 개 */
export function ballTexture(): THREE.CanvasTexture {
  const c = createCanvas(512, 256);
  const { ctx } = c;

  fill(c, '#1f4fa8');

  // 소용돌이 무늬
  const rng = seededRandom(7);
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(120,190,255,0.22)' : 'rgba(10,25,70,0.28)';
    ctx.lineWidth = 6 + rng() * 16;
    const y = rng() * c.h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(c.w * 0.3, y + 40, c.w * 0.7, y - 40, c.w, y + 10);
    ctx.stroke();
  }

  // 손가락 구멍 세 개 — 실제로 구멍을 파지 않고 어두운 원으로 표현한다.
  // CSG는 이 게임에서 얻는 것보다 비용이 크다.
  const holes: [number, number][] = [
    [0.24, 0.3],
    [0.3, 0.3],
    [0.27, 0.4],
  ];
  for (const [u, v] of holes) {
    const x = u * c.w;
    const y = v * c.h;
    circle(ctx, x, y, 13);
    ctx.fillStyle = '#0a1024';
    ctx.fill();
    circle(ctx, x, y - 2, 13);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
