/**
 * 관찰 모드 — 수업 시연용 도구.
 *
 * 원래는 개발용 디버그 오버레이였다. 슬로모션·궤적·오일 구간 표시는
 * 만드는 비용이 거의 없는데, "공은 왜 휘나요?"를 설명할 때 그대로
 * 교구가 된다. 그래서 개발 도구로 숨기지 않고 정식 기능으로 노출한다.
 */

import { OBSERVE } from '../config';
import { settings } from '../settings';

export type ObserveState = {
  /** 1 = 정상 속도 */
  timeScale: number;
  paused: boolean;
};

export class ObserveControls {
  readonly element: HTMLElement;
  private readonly body: HTMLElement;
  private readonly toggle: HTMLButtonElement;

  private rateIndex = 0;
  private paused = false;
  private readonly onChange: (state: ObserveState) => void;

  constructor(onChange: (state: ObserveState) => void) {
    this.onChange = onChange;

    this.element = document.createElement('div');
    this.element.className = 'observe';

    // 좁은 화면에서 이 설정 박스가 경기 장면을 가리는 것을 막기 위해
    // 접을 수 있게 한다 — Scoreboard와 같은 .panel-toggle 패턴.
    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.className = 'panel-toggle';
    this.toggle.setAttribute('aria-expanded', 'true');
    this.toggle.setAttribute('aria-label', '관찰 모드 접기');
    this.toggle.textContent = '▾';
    this.toggle.addEventListener('click', () => this.toggleCollapsed());

    this.body = document.createElement('div');
    this.body.className = 'observe-body';
    this.body.innerHTML = `
      <button type="button" class="obs-btn" data-act="speed">속도 1x</button>
      <button type="button" class="obs-btn" data-act="pause">일시정지</button>
      <label class="obs-toggle"><input type="checkbox" data-toggle="trajectory"> 공이 간 길</label>
      <label class="obs-toggle"><input type="checkbox" data-toggle="oil"> 기름칠한 곳</label>
      <label class="obs-toggle"><input type="checkbox" data-toggle="numbers"> 핀 번호</label>
    `;

    this.element.append(this.toggle, this.body);

    this.element.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset['act'];
      if (act === 'speed') this.cycleSpeed();
      if (act === 'pause') this.togglePause();
    });

    this.element.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      switch (input.dataset['toggle']) {
        case 'trajectory':
          settings.update({ showTrajectory: input.checked });
          break;
        case 'oil':
          settings.update({ showOilZone: input.checked });
          break;
        case 'numbers':
          settings.update({ showPinNumbers: input.checked });
          break;
        default:
          break;
      }
    });

    this.syncToggles();
  }

  private toggleCollapsed(): void {
    const collapsed = this.element.classList.toggle('is-collapsed');
    this.toggle.textContent = collapsed ? '▸' : '▾';
    this.toggle.setAttribute('aria-expanded', String(!collapsed));
    this.toggle.setAttribute('aria-label', collapsed ? '관찰 모드 펼치기' : '관찰 모드 접기');
  }

  /** 설정이 밖에서 바뀌었을 때 체크박스를 맞춘다 (튜토리얼이 자동으로 켠다) */
  syncToggles(): void {
    const s = settings.value;
    this.checkbox('trajectory').checked = s.showTrajectory;
    this.checkbox('oil').checked = s.showOilZone;
    this.checkbox('numbers').checked = s.showPinNumbers;
  }

  private checkbox(name: string): HTMLInputElement {
    const el = this.element.querySelector<HTMLInputElement>(`[data-toggle="${name}"]`);
    if (el === null) throw new Error(`관찰 모드 토글을 찾을 수 없습니다: ${name}`);
    return el;
  }

  private cycleSpeed(): void {
    this.rateIndex = (this.rateIndex + 1) % OBSERVE.slowMotionRates.length;
    const rate = OBSERVE.slowMotionRates[this.rateIndex]!;
    const label = rate === 1 ? '1x' : `1/${Math.round(1 / rate)}x`;
    this.button('speed').textContent = `속도 ${label}`;
    this.emit();
  }

  private togglePause(): void {
    this.paused = !this.paused;
    this.button('pause').textContent = this.paused ? '계속하기' : '일시정지';
    this.emit();
  }

  private button(act: string): HTMLElement {
    const el = this.element.querySelector<HTMLElement>(`[data-act="${act}"]`);
    if (el === null) throw new Error(`관찰 모드 버튼을 찾을 수 없습니다: ${act}`);
    return el;
  }

  get state(): ObserveState {
    return {
      timeScale: OBSERVE.slowMotionRates[this.rateIndex]!,
      paused: this.paused,
    };
  }

  private emit(): void {
    this.onChange(this.state);
  }
}
