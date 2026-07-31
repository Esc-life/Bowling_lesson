/**
 * 자유 연습 시작 화면.
 *
 * 두 갈래다. 10프레임 정식 경기는 배운 규칙을 전부 써 보는 자리이고,
 * 연습 투구는 점수 없이 감을 익히는 자리다. 연습 투구에서는 세울 핀을
 * 직접 골라 스페어 상황을 반복할 수 있다.
 *
 * 핀 고르기 화면에 "왼쪽/오른쪽"을 쓰지 않는다. 왼손 학생은 핀 배치가
 * 미러링되지만 글은 미러링되지 않기 때문이다. 번호로만 부른다.
 */

import { ALL_PINS, type PinNumber } from '../rules/pinLayout';

export type PracticeChoice =
  | { kind: 'game' }
  | { kind: 'throws'; rack: PinNumber[] };

export class PracticeSetup {
  readonly element: HTMLElement;
  private rack = new Set<PinNumber>(ALL_PINS);
  private step: 'kind' | 'rack' = 'kind';

  constructor(
    private readonly onStart: (choice: PracticeChoice) => void,
    private readonly onCancel: () => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'overlay practice-setup';
    this.element.hidden = true;
    this.element.addEventListener('click', (e) => this.handleClick(e));
    this.render();
  }

  show(): void {
    this.step = 'kind';
    this.rack = new Set<PinNumber>(ALL_PINS);
    this.element.hidden = false;
    this.render();
  }

  hide(): void {
    this.element.hidden = true;
  }

  private render(): void {
    this.element.innerHTML = this.step === 'kind' ? this.kindHtml() : this.rackHtml();
  }

  private kindHtml(): string {
    return `
      <div class="panel">
        <h1>자유 연습</h1>
        <div class="play-buttons">
          <button type="button" class="play-btn" data-kind="game">
            <span class="play-icon" aria-hidden="true">🎳</span>
            <span class="play-name">10프레임 경기</span>
            <span class="play-desc">점수를 매기며 한 게임을 끝까지 쳐요</span>
          </button>
          <button type="button" class="play-btn" data-kind="throws">
            <span class="play-icon" aria-hidden="true">🔁</span>
            <span class="play-name">연습 투구</span>
            <span class="play-desc">점수 없이 계속 던져요. 세울 핀도 고를 수 있어요</span>
          </button>
        </div>
        <button type="button" class="text-btn" data-cancel="1">뒤로</button>
      </div>
    `;
  }

  private rackHtml(): string {
    const pins = ALL_PINS.map((n) => {
      const on = this.rack.has(n);
      return `<button type="button" class="pin-toggle${on ? ' is-on' : ''}"
                data-pin="${n}" aria-pressed="${on}">${n}</button>`;
    }).join('');

    const empty = this.rack.size === 0;
    return `
      <div class="panel">
        <h1>어떤 핀을 세울까요?</h1>
        <p class="lead">번호를 눌러 켜고 끌 수 있어요. 던질 때마다 이 모양으로 다시 세워져요.</p>
        <div class="pin-grid">${pins}</div>
        <div class="row-buttons">
          <button type="button" class="text-btn" data-preset="all">전부 세우기</button>
          <button type="button" class="text-btn" data-preset="none">전부 치우기</button>
        </div>
        <p class="form-error" role="alert">${empty ? '핀을 최소 하나는 세워 주세요.' : ''}</p>
        <div class="row-buttons">
          <button type="button" class="primary-btn" data-go="1"${empty ? ' disabled' : ''}>시작하기</button>
          <button type="button" class="text-btn" data-back="1">뒤로</button>
        </div>
      </div>
    `;
  }

  private handleClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-kind],[data-cancel],[data-pin],[data-preset],[data-go],[data-back]',
    );
    if (el === null) return;
    const d = el.dataset;

    if (d['kind'] === 'game') {
      this.onStart({ kind: 'game' });
      return;
    }
    if (d['kind'] === 'throws') {
      this.step = 'rack';
      this.render();
      return;
    }
    if (d['cancel'] !== undefined) {
      this.onCancel();
      return;
    }
    if (d['back'] !== undefined) {
      this.step = 'kind';
      this.render();
      return;
    }
    if (d['pin'] !== undefined) {
      const n = Number(d['pin']) as PinNumber;
      if (this.rack.has(n)) this.rack.delete(n);
      else this.rack.add(n);
      this.render();
      return;
    }
    if (d['preset'] === 'all') {
      this.rack = new Set<PinNumber>(ALL_PINS);
      this.render();
      return;
    }
    if (d['preset'] === 'none') {
      this.rack.clear();
      this.render();
      return;
    }
    if (d['go'] !== undefined && this.rack.size > 0) {
      this.onStart({ kind: 'throws', rack: [...this.rack].sort((a, b) => a - b) });
    }
  }
}
