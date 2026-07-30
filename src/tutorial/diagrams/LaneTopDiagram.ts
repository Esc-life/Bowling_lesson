/**
 * 레인 상면도 — 파울선부터 핀덱까지 한눈에.
 *
 * 실제 레인은 길이 18m에 폭 1m라 비율대로 그리면 실처럼 보인다.
 * 교육용 그림이 다 그렇듯 폭을 과장한다. 위치 관계(화살표가 핀보다
 * 훨씬 가깝다, 기름은 앞쪽 2/3)만 정확하면 된다.
 *
 * 화면 오른쪽 = 월드 -X 규칙을 그대로 따른다.
 */

import { ARROWS, LANE, OIL } from '../../config';
import {
  ALL_PINS,
  arrowX,
  pinPosition,
  TARGET_ARROW,
  type Handedness,
} from '../../rules/pinLayout';
import { circle, createDiagramCanvas, text, triangleUp } from '../../scene/canvas2d';

export type LaneTopOptions = {
  showArrows?: boolean;
  showOil?: boolean;
  showBoards?: boolean;
};

const W = 300;
const H = 430;
const LANE_W_PX = 132;
const GUTTER_PX = 18;
const TOP_PAD = 14;
const BOTTOM_PAD = 26;

/** z 범위: 파울선 약간 앞(-1m)부터 핏(19.6m)까지 */
const Z_MIN = -1.2;
const Z_MAX = LANE.pitZ;

export function renderLaneTop(opts: LaneTopOptions, hand: Handedness): HTMLElement {
  const c = createDiagramCanvas(W, H);
  const { ctx } = c;

  const cx = W / 2;
  const sz = (H - TOP_PAD - BOTTOM_PAD) / (Z_MAX - Z_MIN);
  const toY = (z: number): number => TOP_PAD + (Z_MAX - z) * sz;
  const toX = (x: number): number => cx - (x / LANE.width) * LANE_W_PX;

  const laneLeft = cx - LANE_W_PX / 2;
  const foulY = toY(0);

  // 어프로치 (파울선 아래)
  ctx.fillStyle = '#5c4632';
  ctx.fillRect(laneLeft - GUTTER_PX, foulY, LANE_W_PX + GUTTER_PX * 2, H - BOTTOM_PAD - foulY + 8);

  // 거터
  ctx.fillStyle = '#23272e';
  ctx.fillRect(laneLeft - GUTTER_PX, TOP_PAD, GUTTER_PX, foulY - TOP_PAD);
  ctx.fillRect(laneLeft + LANE_W_PX, TOP_PAD, GUTTER_PX, foulY - TOP_PAD);

  // 레인 바닥
  ctx.fillStyle = '#a87d50';
  ctx.fillRect(laneLeft, TOP_PAD, LANE_W_PX, foulY - TOP_PAD);

  // 보드(나무판) 선
  if (opts.showBoards === true) {
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    for (let b = 1; b < 39; b++) {
      const x = laneLeft + (b / 39) * LANE_W_PX;
      ctx.beginPath();
      ctx.moveTo(x, TOP_PAD);
      ctx.lineTo(x, foulY);
      ctx.stroke();
    }
  }

  // 기름(오일) 구간
  if (opts.showOil === true) {
    ctx.fillStyle = 'rgba(58, 168, 224, 0.35)';
    ctx.fillRect(laneLeft, toY(OIL.endZ), LANE_W_PX, foulY - toY(OIL.endZ));
    text(ctx, '기름', cx, toY(OIL.endZ / 2) - 9, { size: 13, weight: '800', color: '#0d3a52' });
    text(ctx, '미끄러워요', cx, toY(OIL.endZ / 2) + 9, { size: 12, weight: '700', color: '#0d3a52' });
    const dryY = toY((OIL.endZ + LANE.headPinZ) / 2 + 1);
    text(ctx, '마른 곳', cx, dryY - 9, { size: 13, weight: '800', color: '#5a3d1e' });
    text(ctx, '여기서 휘어요', cx, dryY + 9, { size: 12, weight: '700', color: '#5a3d1e' });
  }

  // 화살표 7개 — 실제처럼 가운데가 제일 멀리 있는 V자 배치
  if (opts.showArrows === true) {
    for (let i = 1; i <= 7; i++) {
      const ax = toX(arrowX(i, hand));
      const az = ARROWS.nearZ + (1 - Math.abs(i - 4) / 3) * (ARROWS.farZ - ARROWS.nearZ);
      const isTarget = i === TARGET_ARROW;
      ctx.fillStyle = isTarget ? '#e8623c' : '#f0e6d2';
      triangleUp(ctx, ax, toY(az) + (isTarget ? 9 : 7), isTarget ? 7 : 5, isTarget ? 18 : 14);
      ctx.fill();
    }
    text(ctx, '조준 화살표', W - 4, toY(ARROWS.nearZ), {
      size: 12, weight: '700', color: '#f0e6d2', align: 'right',
    });
  }

  // 핀 10개
  for (const pin of ALL_PINS) {
    const { x, z } = pinPosition(pin);
    ctx.fillStyle = '#f5f1e8';
    circle(ctx, toX(x), toY(z), 5);
    ctx.fill();
  }

  // 파울선
  ctx.strokeStyle = '#e04848';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(laneLeft - GUTTER_PX, foulY);
  ctx.lineTo(laneLeft + LANE_W_PX + GUTTER_PX, foulY);
  ctx.stroke();

  // 이름표
  const labelColor = '#e8ecf2';
  text(ctx, '핀덱', laneLeft - GUTTER_PX - 6, toY(LANE.headPinZ + 0.4), {
    size: 12, weight: '700', color: labelColor, align: 'right',
  });
  text(ctx, '거터', laneLeft - GUTTER_PX - 6, toY(9), {
    size: 12, weight: '700', color: labelColor, align: 'right',
  });
  ctx.strokeStyle = 'rgba(232,236,242,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(laneLeft - GUTTER_PX - 4, toY(9));
  ctx.lineTo(laneLeft - GUTTER_PX / 2, toY(9));
  ctx.stroke();
  text(ctx, '파울선', laneLeft - GUTTER_PX - 6, foulY, {
    size: 12, weight: '700', color: '#ff9d9d', align: 'right',
  });
  text(ctx, '여기서 던져요', cx, foulY + 16, { size: 12, color: labelColor });
  text(ctx, `↑ 핀까지 ${LANE.headPinZ}m`, cx, toY(LANE.headPinZ / 2 + 3.5), {
    size: 11, color: 'rgba(255,255,255,0.75)',
  });

  const wrap = document.createElement('div');
  wrap.className = 'diagram diagram--lanetop';
  wrap.appendChild(c.canvas);
  return wrap;
}
