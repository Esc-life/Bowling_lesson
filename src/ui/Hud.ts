/**
 * 화면 위 안내 요소: 프레임 표시, 파워 게이지, 큰 문구, 조작 안내.
 *
 * 초등 대상이라 글씨와 버튼을 크게 두고, 지금 무엇을 해야 하는지 항상
 * 한 줄로 알려 준다. "다음에 뭘 해야 하지?"에서 막히면 게임이 끝난다.
 */

export type HudCallbacks = {
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onRestart: () => void;
};

export class Hud {
  readonly element: HTMLElement;

  private readonly frameLabel: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly powerFill: HTMLElement;
  private readonly powerWrap: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly positionLabel: HTMLElement;

  private bannerTimer: number | null = null;

  constructor(callbacks: HudCallbacks) {
    this.element = document.createElement('div');
    this.element.className = 'hud';
    this.element.innerHTML = `
      <div class="hud-top">
        <div class="frame-label"></div>
      </div>
      <div class="hud-banner"></div>
      <div class="hud-bottom">
        <div class="hud-hint"></div>
        <div class="hud-controls">
          <button type="button" class="round-btn" data-act="left" aria-label="왼쪽으로">◀</button>
          <div class="position-label"></div>
          <button type="button" class="round-btn" data-act="right" aria-label="오른쪽으로">▶</button>
        </div>
        <div class="power-wrap">
          <div class="power-fill"></div>
        </div>
      </div>
      <button type="button" class="text-btn restart-btn" data-act="restart">처음부터</button>
    `;

    this.frameLabel = this.must('.frame-label');
    this.hint = this.must('.hud-hint');
    this.powerFill = this.must('.power-fill');
    this.powerWrap = this.must('.power-wrap');
    this.banner = this.must('.hud-banner');
    this.positionLabel = this.must('.position-label');

    this.element.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      switch (target.dataset['act']) {
        case 'left':
          callbacks.onMoveLeft();
          break;
        case 'right':
          callbacks.onMoveRight();
          break;
        case 'restart':
          callbacks.onRestart();
          break;
        default:
          break;
      }
    });
  }

  private must(selector: string): HTMLElement {
    const el = this.element.querySelector<HTMLElement>(selector);
    if (el === null) throw new Error(`HUD 요소를 찾을 수 없습니다: ${selector}`);
    return el;
  }

  setFrame(frame: number, ball: number): void {
    this.frameLabel.textContent = `${frame}번째 프레임 · ${ball}번째 공`;
  }

  setHint(text: string): void {
    this.hint.textContent = text;
  }

  setPower(power: number, active: boolean): void {
    this.powerWrap.classList.toggle('is-active', active);
    this.powerFill.style.width = `${Math.round(power * 100)}%`;
    // 레인 골드(약할 때) → 핀 레드(셀 때) — 앱 색 체계 안에서만 움직인다
    this.powerFill.style.background = `hsl(${Math.round(40 - 36 * power)} 72% 54%)`;
  }

  /** 서는 위치를 보드 번호로 알려 준다 (조준 레슨과 연결된다) */
  setPosition(board: number): void {
    this.positionLabel.textContent = `${board}번 판`;
  }

  /** 큰 문구를 잠깐 띄운다 */
  showBanner(text: string, durationMs = 1800): void {
    this.banner.textContent = text;
    this.banner.classList.add('is-visible');
    if (this.bannerTimer !== null) window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => {
      this.banner.classList.remove('is-visible');
      this.bannerTimer = null;
    }, durationMs);
  }

  hideBanner(): void {
    this.banner.classList.remove('is-visible');
  }
}
