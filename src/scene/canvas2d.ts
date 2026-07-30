/**
 * Canvas2D 드로잉 헬퍼.
 *
 * 3D 텍스처(나뭇결, 핀 무늬)와 튜토리얼 다이어그램(핀 배치도, 점수판)이
 * 같은 헬퍼를 쓴다. 외부 이미지 에셋을 하나도 쓰지 않기 위한 기반이다.
 */

export type Canvas2D = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
};

export function createCanvas(w: number, h: number): Canvas2D {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('Canvas 2D 컨텍스트를 만들 수 없습니다.');
  return { canvas, ctx, w, h };
}

/** 화면 배율을 반영한 캔버스 (다이어그램용 — 고해상도 화면에서 선명하게) */
export function createDiagramCanvas(cssW: number, cssH: number): Canvas2D {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const c = createCanvas(Math.round(cssW * dpr), Math.round(cssH * dpr));
  c.canvas.style.width = `${cssW}px`;
  c.canvas.style.height = `${cssH}px`;
  c.ctx.scale(dpr, dpr);
  return { ...c, w: cssW, h: cssH };
}

export function fill(c: Canvas2D, color: string): void {
  c.ctx.fillStyle = color;
  c.ctx.fillRect(0, 0, c.canvas.width, c.canvas.height);
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
}

/** 위를 향한 이등변삼각형 (조준 화살표 모양) */
export function triangleUp(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  halfWidth: number,
  height: number,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, baseY - height);
  ctx.lineTo(cx + halfWidth, baseY);
  ctx.lineTo(cx - halfWidth, baseY);
  ctx.closePath();
}

export type TextOptions = {
  size?: number;
  color?: string;
  weight?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
};

export function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  opts: TextOptions = {},
): void {
  const size = opts.size ?? 16;
  ctx.save();
  ctx.fillStyle = opts.color ?? '#111';
  ctx.font = `${opts.weight ?? '600'} ${size}px "Malgun Gothic", "맑은 고딕", system-ui, sans-serif`;
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = opts.baseline ?? 'middle';
  ctx.fillText(value, x, y);
  ctx.restore();
}

/**
 * 나뭇결. 세로 스트라이프 + 결 선.
 * 볼링 레인은 좁은 단풍나무 판을 세로로 붙여 만든다.
 */
export function woodGrain(
  c: Canvas2D,
  rng: () => number,
  opts: { boards: number; base: string; light: string; dark: string },
): void {
  const { ctx } = c;
  const w = c.canvas.width;
  const h = c.canvas.height;

  fill(c, opts.base);

  const boardWidth = w / opts.boards;
  for (let i = 0; i < opts.boards; i++) {
    const x = i * boardWidth;
    // 판마다 밝기를 조금씩 다르게 — 실제 레인도 판마다 색이 다르다
    ctx.fillStyle = rng() > 0.5 ? opts.light : opts.dark;
    ctx.globalAlpha = 0.1 + rng() * 0.18;
    ctx.fillRect(x, 0, boardWidth, h);
    ctx.globalAlpha = 1;

    // 판 경계선
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // 결 무늬 — 길게 흐르는 얇은 선
  const grainCount = Math.round(h / 6);
  for (let i = 0; i < grainCount; i++) {
    const y = rng() * h;
    const x0 = rng() * w;
    const len = boardWidth * (0.3 + rng() * 0.6);
    ctx.strokeStyle = rng() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 0.5 + rng();
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.bezierCurveTo(x0 + len * 0.3, y + 8, x0 + len * 0.7, y - 8, x0 + len, y);
    ctx.stroke();
  }
}
