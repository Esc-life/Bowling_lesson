/**
 * 개발·수업용 상태 표시 (`?debug=1`).
 *
 * 화면만 보고는 "공이 실제로 몇 m/s로 가고 있는지", "왜 아직 정지 판정이
 * 안 났는지"를 알 수 없다. 카메라가 공을 따라다니면 공이 화면에서 거의
 * 움직이지 않기 때문이다. 숫자를 띄워 두면 물리 튜닝이 추측에서 관찰로 바뀐다.
 */

import type { Game } from '../core/Game';

export class DebugPanel {
  readonly element: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'debug-panel';
  }

  update(game: Game): void {
    const s = game.snapshot;
    const rows: [string, string][] = [
      ['상태', s.phase],
      ['프레임', `${s.frame} · ${s.ball}구`],
      ['공 위치 z', `${s.ballZ.toFixed(2)} m`],
      ['공 위치 x', `${s.ballX.toFixed(3)} m`],
      ['공 속도', `${s.ballSpeed.toFixed(2)} m/s`],
      ['공 옆회전(훅)', `${s.ballSideSpin.toFixed(1)} rad/s`],
      ['서 있는 핀', s.standing.length === 0 ? '없음' : s.standing.join(', ')],
      ['물리 스텝/프레임', String(s.steps)],
      ['정지 대기', `${s.settleElapsed.toFixed(1)} s`],
      ['포켓 통과 x', s.pocketX === null ? '—' : `${s.pocketX.toFixed(3)} m`],
    ];

    this.element.innerHTML = rows
      .map(([k, v]) => `<div class="debug-row"><span>${k}</span><b>${v}</b></div>`)
      .join('');
  }
}
