/**
 * 핀 배치도 (위에서 본 그림).
 *
 * 좌표는 게임과 같은 pinLayout을 쓴다 — 다이어그램과 실제 게임 화면이
 * 어긋날 수 없다. 화면 오른쪽 = 월드 -X 규칙도 그대로 따른다.
 *
 * 미러링: 핀 배치 자체는 좌우 대칭이라 그대로 그리고, 포켓 표시와
 * 강조 핀 번호만 학생의 손에 맞게 바뀐다.
 */

import { createDiagramCanvas, circle, text } from '../../scene/canvas2d';
import {
  ALL_PINS,
  forHand,
  pinPosition,
  pocketPins,
  pocketX,
  type Handedness,
  type PinNumber,
} from '../../rules/pinLayout';
import { LANE, PIN } from '../../config';

export type PinDeckOptions = {
  highlight?: PinNumber[];
  showPocket?: boolean;
  showNumbers?: boolean;
};

const W = 300;
const H = 290;
/** px per meter */
const S = 240;
const PIN_R = 20;

export function renderPinDeck(opts: PinDeckOptions, hand: Handedness): HTMLElement {
  const c = createDiagramCanvas(W, H);
  const { ctx } = c;

  const cx = W / 2;
  const bottomPad = 52;
  const toScreen = (x: number, z: number): [number, number] => [
    cx - x * S,
    H - bottomPad - (z - LANE.headPinZ) * S,
  ];

  // 핀덱 바닥
  ctx.fillStyle = '#8a6a48';
  ctx.beginPath();
  ctx.roundRect(10, 8, W - 20, H - 44, 12);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.roundRect(10, 8, W - 20, H - 44, 12);
  ctx.stroke();

  const highlighted = new Set(forHand(opts.highlight ?? [], hand));

  // 뒷줄부터 그려야 앞 핀이 살짝 겹칠 때 자연스럽다
  const byRow = [...ALL_PINS].sort((a, b) => pinPosition(b).z - pinPosition(a).z);
  for (const pin of byRow) {
    const { x, z } = pinPosition(pin);
    const [sx, sy] = toScreen(x, z);
    const isHi = highlighted.has(pin);

    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    circle(ctx, sx + 2, sy + 3, PIN_R);
    ctx.fill();

    ctx.fillStyle = isHi ? '#ff8c42' : '#f5f1e8';
    circle(ctx, sx, sy, PIN_R);
    ctx.fill();
    ctx.lineWidth = isHi ? 3 : 1.5;
    ctx.strokeStyle = isHi ? '#c9541a' : 'rgba(0,0,0,0.35)';
    circle(ctx, sx, sy, PIN_R);
    ctx.stroke();

    // 핀 목의 빨간 줄 (실제 핀 무늬)
    ctx.strokeStyle = isHi ? 'rgba(255,255,255,0.7)' : '#c03434';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sx, sy, PIN_R * 0.62, 0, Math.PI * 2);
    ctx.stroke();

    if (opts.showNumbers === true) {
      text(ctx, String(pin), sx, sy, { size: 14, weight: '800', color: isHi ? '#fff' : '#222' });
    }
  }

  if (opts.showPocket === true) {
    const px = pocketX(hand);
    const [sx] = toScreen(px, LANE.headPinZ);
    const [, headY] = toScreen(0, LANE.headPinZ);
    const [pair0, pair1] = pocketPins(hand);

    // 아래(투구자 쪽)에서 포켓 틈으로 들어가는 화살표
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(sx, H - 6);
    ctx.lineTo(sx, headY + PIN.maxDiameter * S * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(sx, headY + 12);
    ctx.lineTo(sx - 7, headY + 26);
    ctx.lineTo(sx + 7, headY + 26);
    ctx.closePath();
    ctx.fill();

    text(ctx, `포켓 (${pair0}번과 ${pair1}번 사이)`, sx, H - 20, {
      size: 13,
      weight: '700',
      color: '#ffd166',
    });
  }

  const wrap = document.createElement('div');
  wrap.className = 'diagram diagram--pindeck';
  wrap.appendChild(c.canvas);
  return wrap;
}
