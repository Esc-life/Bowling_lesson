/**
 * 앱 시작점.
 *
 * 흐름: 게임 시작 → 조준·투구 반복
 *       우상단 '배우기' 버튼 → 튜토리얼 (영역 메뉴 → 레슨 → 퀴즈/드릴)
 *
 * 쿼리스트링
 *   ?debug=1    숫자 키(0~9, 0=10개)로 물리를 건너뛰고 핀 수를 직접 입력.
 *               점수판 로직을 물리 대기 없이 10프레임 통과시킬 수 있다.
 *   ?lesson=B3  해당 레슨을 바로 연다 (수업 딥링크)
 *   ?area=D     영역 메뉴를 해당 영역이 강조된 채로 연다
 */

import { Game } from './core/Game';
import { settings } from './settings';
import { DebugPanel } from './ui/DebugPanel';
import { Hud } from './ui/Hud';
import { ObserveControls } from './ui/ObserveControls';
import { Scoreboard } from './ui/Scoreboard';
import { TutorialUI } from './ui/TutorialUI';
import type { MatchThrowResult } from './rules/MatchMachine';
import type { AreaId } from './tutorial/types';

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

  const tutorial = new TutorialUI(game, ui, {
    onSessionChange: ({ hideScoreboard }) => {
      // 핀 일부만 세우는 드릴에서는 점수가 의미가 없어 점수판을 감춘다
      scoreboard.element.classList.toggle('is-hidden', hideScoreboard);
    },
  });

  const learnBtn = document.createElement('button');
  learnBtn.type = 'button';
  learnBtn.className = 'text-btn learn-btn';
  learnBtn.setAttribute('aria-label', '배우기');
  learnBtn.innerHTML = '<span aria-hidden="true">📖</span><span class="btn-label"> 배우기</span>';
  learnBtn.addEventListener('click', () => tutorial.openMenu());
  ui.appendChild(learnBtn);

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
    onReady: () => {
      tutorial.handleReady();
      refresh();
    },
    onThrowResolved: (result: MatchThrowResult) => {
      // 드릴 중에는 튜토리얼이 결과를 소비한다 — 핀 일부만 세운 드릴에서는
      // 기계가 계산한 "스트라이크!" 문구가 틀리므로 기본 배너를 막는다.
      const suppressBanner = tutorial.handleThrowResolved(result);
      if (!suppressBanner && result.message !== null) hud.showBanner(result.message);
      refresh();
      if (!suppressBanner && result.gameOver) {
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

  // 수업용 딥링크 — 특정 레슨/영역을 바로 연다
  const lessonParam = params.get('lesson');
  const areaParam = params.get('area');
  if (lessonParam !== null) {
    tutorial.openLesson(lessonParam.toUpperCase());
  } else if (areaParam !== null) {
    const area = areaParam.toUpperCase();
    const isAreaId = (v: string): v is AreaId => ['A', 'B', 'C', 'D', 'E'].includes(v);
    tutorial.openMenu(isAreaId(area) ? area : undefined);
  }

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
