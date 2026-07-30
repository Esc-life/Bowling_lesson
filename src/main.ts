/**
 * 앱 시작점.
 *
 * 흐름: 손 고르기(첫 실행만) → 게임 시작 → 조준·투구 반복
 *
 * 쿼리스트링
 *   ?debug=1   숫자 키(0~9, 0=10개)로 물리를 건너뛰고 핀 수를 직접 입력.
 *              점수판 로직을 물리 대기 없이 10프레임 통과시킬 수 있다.
 *   ?hand=left 손 선택 화면을 건너뛰고 바로 지정 (수업 시연용)
 */

import { Game } from './core/Game';
import { settings } from './settings';
import { DebugPanel } from './ui/DebugPanel';
import { Hud } from './ui/Hud';
import { HandPicker } from './ui/HandPicker';
import { ObserveControls } from './ui/ObserveControls';
import { Scoreboard } from './ui/Scoreboard';
import type { ThrowResult } from './rules/FrameMachine';

const params = new URLSearchParams(location.search);
const debugMode = params.get('debug') === '1';

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`#${id} 요소를 찾을 수 없습니다.`);
  return el as T;
}

async function main(): Promise<void> {
  const stage = must('stage');
  const ui = must('ui');
  const loading = must('loading');

  // ?hand=left/right 로 선택 화면을 건너뛸 수 있다
  const handParam = params.get('hand');
  if (handParam === 'left' || handParam === 'right') {
    settings.update({ handedness: handParam });
  }

  if (settings.needsHandChoice) {
    await new Promise<void>((resolve) => {
      const picker = new HandPicker((hand) => {
        settings.update({ handedness: hand });
        picker.hide();
        resolve();
      });
      ui.appendChild(picker.element);
      loading.classList.add('is-hidden');
    });
  }

  loading.classList.remove('is-hidden');
  loading.textContent = '볼링장을 만드는 중…';

  const game = await Game.create(stage);

  // ---- UI 구성 ----
  const hud = new Hud({
    onMoveLeft: () => game.nudge('left'),
    onMoveRight: () => game.nudge('right'),
    onRestart: () => game.restart(),
  });
  const scoreboard = new Scoreboard();
  const observe = new ObserveControls((state) => game.setObserveState(state));

  ui.appendChild(hud.element);
  ui.appendChild(scoreboard.element);
  ui.appendChild(observe.element);

  const refresh = (): void => {
    const machine = game.machine;
    hud.setFrame(machine.currentFrame, machine.ballInFrame);
    hud.setPosition(game.currentBoard);
    hud.setPower(game.input.state.power, game.input.state.active);
    scoreboard.render(machine.scorecard, { activeFrame: machine.currentFrame });

    if (machine.isGameOver) {
      hud.setHint(`게임이 끝났어요! 점수는 ${machine.scorecard.total}점이에요.`);
    } else if (machine.phase === 'aiming') {
      hud.setHint('아래로 끌어당겼다가 놓으면 공이 굴러가요');
    } else {
      hud.setHint('공이 굴러가는 중…');
    }
  };

  game.on({
    onStateChanged: refresh,
    onReady: refresh,
    onThrowResolved: (result: ThrowResult) => {
      if (result.message !== null) hud.showBanner(result.message);
      refresh();
      if (result.gameOver) {
        hud.showBanner(`끝! ${game.machine.scorecard.total}점`, 4000);
      }
    },
  });

  settings.subscribe(() => observe.syncToggles());

  // ---- 키보드 ----
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;

    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        game.nudge('left');
        return;
      case 'ArrowRight':
      case 'd':
      case 'D':
        game.nudge('right');
        return;
      case 'r':
      case 'R':
        game.restart();
        return;
      default:
        break;
    }

    // 디버그: 숫자 키로 쓰러진 핀 수를 직접 넣는다 (0 = 10개)
    if (debugMode && e.key >= '0' && e.key <= '9') {
      const digit = Number(e.key);
      game.debugKnock(digit === 0 ? 10 : digit);
    }
  });

  game.start();
  refresh();
  loading.classList.add('is-hidden');

  if (debugMode) {
    const debug = new DebugPanel();
    ui.appendChild(debug.element);
    window.setInterval(() => debug.update(game), 100);
    // 콘솔에서 상태를 들여다보고 정해진 값으로 던져 볼 수 있게 노출한다.
    // 물리 튜닝과 수업 시연 준비에 쓴다.
    Object.assign(window, { bowling: { game, settings } });
    console.info('[디버그] 숫자 키 0~9 = 쓰러진 핀 수 직접 입력 (0은 10개).');
    console.info('[디버그] window.bowling.game 으로 상태를 볼 수 있습니다.');
  }
}

main().catch((error: unknown) => {
  const loading = document.getElementById('loading');
  if (loading !== null) {
    loading.textContent = '시작하지 못했습니다. 콘솔을 확인해 주세요.';
    loading.classList.remove('is-hidden');
  }
  console.error(error);
});
