/**
 * 앱 시작점.
 *
 * 흐름: 플레이어 고르기 → 홈(영역 메뉴) → 배우기 / 자유 연습 / 대전
 *
 * 홈이 영역 메뉴다. 게임 화면은 거기서 들어간다. 다 배운 학생만 자유
 * 연습과 대전을 열 수 있고, 잠긴 버튼은 감추지 않고 이유와 함께 보여 준다.
 *
 * 쿼리스트링
 *   ?debug=1      숫자 키(0~9, 0=10개)로 물리를 건너뛰고 핀 수를 직접 입력.
 *   ?player=민준  플레이어 선택 화면을 건너뛴다 (수업 시연용)
 *   ?lesson=B3    해당 레슨을 바로 연다 (수업 딥링크)
 *   ?area=D       영역 메뉴를 해당 영역이 강조된 채로 연다
 *
 * ?player= 없이 ?lesson=/?area=만 들어오면 시연 모드로 열린다 — 화면은
 * 다 돌아가지만 진행률을 저장하지 않는다. 누가 보는지 모르는 채로 저장하면
 * 애먼 학생의 진도가 링크 한 번에 바뀌기 때문이다.
 */

import { players } from './players/PlayerStore';
import { PracticeSession } from './practice/PracticeSession';
import { MatchMachine, soloMatch, type MatchPlayer, type MatchThrowResult } from './rules/MatchMachine';
import type { PinNumber } from './rules/pinLayout';
import { settings } from './settings';
import { DebugPanel } from './ui/DebugPanel';
import { Hud } from './ui/Hud';
import { MatchSetup } from './ui/MatchSetup';
import { ObserveControls } from './ui/ObserveControls';
import { PlayerPicker } from './ui/PlayerPicker';
import { PracticeSetup } from './ui/PracticeSetup';
import { Progress } from './tutorial/Progress';
import { Scoreboard } from './ui/Scoreboard';
import { TutorialUI } from './ui/TutorialUI';
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

  // ?player=이름 으로 선택 화면을 건너뛴다 (수업 시연용).
  // 게임보다 먼저 골라야 튜토리얼이 그 사람의 진도로 열린다.
  // 이름을 못 찾으면 resolved가 null이고, 그때는 선택 화면을 띄운다 —
  // 오타 하나로 엉뚱한 학생의 진도에 기록되면 안 된다.
  const playerParam = params.get('player');
  const resolved = playerParam === null ? null : players.findByName(playerParam);
  if (resolved !== null) players.select(resolved.id);

  // Three.js·Rapier(WASM)를 별도 청크로 분리한다. 정적 import면 번들 하나가
  // 2.8MB(gzip 1MB)로 묶여, 교실 와이파이에서는 플레이어 고르기 화면조차
  // 그 전부를 내려받아야 뜬다. 동적 import로 쪼개면 이 청크는 필요한 시점에
  // 따로 내려받으므로 Vite 빌드 경고("chunks larger than 500kB")도 해소된다.
  const { Game } = await import('./core/Game');
  const game = await Game.create(stage);

  // ---- UI 구성 ----
  const hud = new Hud({
    onMoveLeft: () => game.nudge('left'),
    onMoveRight: () => game.nudge('right'),
    onRestart: () => restart(),
  });
  const scoreboard = new Scoreboard();
  const observe = new ObserveControls((state) => game.setObserveState(state));

  ui.appendChild(hud.element);
  ui.appendChild(scoreboard.element);
  ui.appendChild(observe.element);

  /** 연습 투구 중이면 그 세션. 정식 경기·대전 중에는 null */
  let practice: PracticeSession | null = null;

  // 서로를 콜백 안에서 참조하므로 먼저 이름만 만들어 둔다.
  // 실제로 불리는 시점에는 이미 대입돼 있다.
  let tutorial: TutorialUI;

  const picker = new PlayerPicker(() => {
    picker.hide();
    onPlayerReady();
  });
  ui.appendChild(picker.element);
  picker.hide();

  // ---- 모드 시작 ----

  /**
   * 지금 플레이어 혼자 치는 새 경기로 되돌린다.
   *
   * 손을 매치에 박아 둔다 — 이걸 빼면 restart()가 왼손 학생을 오른손으로
   * 되돌려 레인이 뒤집힌다. 레슨 드릴도 이 매치 위에서 돌아가므로,
   * 플레이어를 고른 직후에도 한 번 불러 손을 맞춘다.
   */
  function resetSolo(): void {
    practice = null;
    const me = players.current;
    game.setMatch(soloMatch(me?.name ?? '나', 10, me?.handedness ?? 'right'));
    scoreboard.element.classList.remove('is-hidden');
  }

  /** 10프레임 정식 경기 (혼자) */
  function startFreeGame(): void {
    resetSolo();
    refresh();
  }

  /** 연습 투구 — 점수 없이 같은 배치로 계속 던진다 */
  function startPractice(rack: PinNumber[]): void {
    resetSolo();
    practice = new PracticeSession(rack);
    // 점수가 의미 없으므로 점수판을 감춘다 (드릴과 같은 방침)
    scoreboard.element.classList.add('is-hidden');
    game.setupDrill(practice.rack);
    refresh();
  }

  /** 여러 명이 번갈아 치는 대전 */
  function startMatch(participants: MatchPlayer[], totalFrames: number): void {
    practice = null;
    game.setMatch(new MatchMachine(participants, totalFrames));
    scoreboard.element.classList.remove('is-hidden');
    hud.showBanner(`${game.match.active.name} 차례`);
    refresh();
  }

  /** 지금 여러 명이 치는 대전이 진행 중인가 */
  function matchInProgress(): boolean {
    return practice === null && game.match.isMultiplayer && !game.match.isMatchOver;
  }

  /**
   * 지금 혼자 치는 10프레임 경기가 진행 중인가 (적어도 한 번은 던졌고, 아직 안 끝남).
   *
   * 홈으로 나가도 이 경기의 매치 객체는 그대로 남는다(openHome이 지우지 않는다).
   * 문제는 돌아갈 길이 없었다는 것 — 이 값이 있으면 홈에 "돌아가기" 버튼을 보여준다.
   */
  function soloGameInProgress(): boolean {
    if (practice !== null || game.match.isMultiplayer) return false;
    return game.machine.lastResult !== null && !game.machine.isGameOver;
  }

  function resumableGame(): { frame: number; total: number } | null {
    if (!soloGameInProgress()) return null;
    return { frame: game.machine.currentFrame, total: game.machine.scorecard.total };
  }

  /**
   * 홈으로 — 진행 중이던 드릴·연습 세션은 여기서 끝난다.
   *
   * 대전 중에 홈으로 나가면 대전도 끝난다. 점수를 들고 있다가 되돌리는
   * 길은 만들지 않았다(레슨 드릴이 매치를 갈아 끼우므로 범위가 커진다).
   * 대신 조용히 지우지 않는다 — 홈 버튼이 미리 "대전 그만두기"로 바뀌어
   * 있고, 나가고 나면 홈 맨 위에 그 사실을 한 줄로 알린다.
   */
  function openHome(): void {
    // closeAll()이 드릴 세션을 접으면서 매치를 갈아 끼우므로 먼저 본다
    const quitMatch = matchInProgress();

    // 드릴 세션을 먼저 접는다. openMenu()만으로는 세션이 살아 있어
    // 점수판을 되돌리는 onSessionChange가 발화하지 않는다.
    tutorial.closeAll();

    // 연습 투구는 물리 랙만 3개짜리로 바꿔 둔 상태다. 매치를 새로 만들어
    // 되돌리지 않으면, 다음 경기에서 세우지도 않은 핀 7개가 "쓰러졌다"고
    // 세어져 첫 프레임이 스트라이크로 기록된다.
    // 대전은 여기서 끝나므로 함께 혼자 치는 매치로 되돌린다.
    if (practice !== null || quitMatch) resetSolo();

    scoreboard.element.classList.remove('is-hidden');
    tutorial.openMenu(undefined, quitMatch ? '대전을 그만뒀어요. 점수는 남지 않아요.' : undefined);
    refresh();
  }

  /** 플레이어를 고른 직후 */
  function onPlayerReady(): void {
    // 플레이어가 바뀌면 그 사람의 진도로 튜토리얼을 다시 읽는다
    tutorial.reloadProgress();
    // 레인과 드릴이 이 사람의 손으로 돌아가게 매치도 새로 만든다
    resetSolo();
    openHome();
  }

  function restart(): void {
    practice?.reset();
    game.restart();
  }

  // ---- 자유 연습 · 대전 화면 ----

  const practiceSetup = new PracticeSetup(
    (choice) => {
      practiceSetup.hide();
      if (choice.kind === 'game') startFreeGame();
      else startPractice(choice.rack);
    },
    () => {
      practiceSetup.hide();
      openHome();
    },
  );
  const matchSetup = new MatchSetup(
    (choice) => {
      matchSetup.hide();
      startMatch(choice.participants, choice.totalFrames);
    },
    () => {
      matchSetup.hide();
      openHome();
    },
  );
  ui.appendChild(practiceSetup.element);
  ui.appendChild(matchSetup.element);

  tutorial = new TutorialUI(game, ui, {
    onSessionChange: ({ hideScoreboard }) => {
      // 핀 일부만 세우는 드릴에서는 점수가 의미가 없어 점수판을 감춘다
      scoreboard.element.classList.toggle('is-hidden', hideScoreboard);
    },
    onFreePractice: () => practiceSetup.show(),
    onMatch: () => matchSetup.show(),
    onSwitchPlayer: () => picker.show(),
    onResumeGame: () => {
      scoreboard.element.classList.remove('is-hidden');
      refresh();
    },
    getResumableGame: () => resumableGame(),
  });

  const homeBtn = document.createElement('button');
  homeBtn.type = 'button';
  homeBtn.className = 'text-btn learn-btn';
  homeBtn.addEventListener('click', () => openHome());
  ui.appendChild(homeBtn);

  /**
   * 홈 버튼의 글자를 지금 상황에 맞춘다.
   *
   * 대전 중에는 이 버튼이 대전을 끝낸다. "홈"이라고만 적혀 있으면 잠깐
   * 나갔다 오는 버튼처럼 보여서, 4명이 치던 판이 예고 없이 사라진다.
   *
   * refresh()는 드래그하는 동안에도 계속 불린다. 바뀔 때만 다시 그린다.
   */
  let homeBtnQuitting: boolean | null = null;
  const syncHomeButton = (): void => {
    const quitting = matchInProgress();
    if (quitting === homeBtnQuitting) return;
    homeBtnQuitting = quitting;
    homeBtn.setAttribute('aria-label', quitting ? '대전 그만두고 홈으로' : '홈으로');
    homeBtn.classList.toggle('is-quit', quitting);
    homeBtn.innerHTML = `<span aria-hidden="true">${quitting ? '🚪' : '🏠'}</span><span class="btn-label"> ${
      quitting ? '대전 그만두기' : '홈'
    }</span>`;
  };
  syncHomeButton();

  const refresh = (): void => {
    const machine = game.machine;
    hud.setFrame(machine.currentFrame, machine.ballInFrame);
    hud.setPosition(game.currentBoard);
    hud.setPower(game.input.state.power, game.input.state.active);
    scoreboard.renderMatch(game.match);
    syncHomeButton();

    if (practice !== null) {
      hud.setHint(`연습 중이에요. ${practice.throws}번 던졌어요`);
    } else if (game.match.isMatchOver) {
      // 다인전이면 이긴 사람 점수를 말한다. 마지막에 던진 사람 점수를
      // 그대로 쓰면, 배너는 "○○ 승리"인데 아래 한 줄은 딴 사람 점수다.
      const top = game.match.ranking[0];
      hud.setHint(
        game.match.isMultiplayer && top !== undefined
          ? `게임이 끝났어요! ${top.player.name} 승리, ${top.total}점이에요.`
          : `게임이 끝났어요! 점수는 ${machine.scorecard.total}점이에요.`,
      );
    } else if (machine.phase === 'aiming') {
      const who = game.match.isMultiplayer ? `${game.match.active.name}, ` : '';
      hud.setHint(`${who}아래로 끌어당겼다가 놓으면 공이 굴러가요`);
    } else {
      hud.setHint('공이 굴러가는 중…');
    }
  };

  game.on({
    onStateChanged: refresh,
    onReady: () => {
      tutorial.handleReady();
      if (practice !== null) {
        // 연습 투구는 매번 같은 배치로 다시 세운다. 프레임이 쌓여 "게임 종료"에
        // 걸리지 않도록 매치도 함께 되돌린다 (튜토리얼 드릴과 같은 방침).
        game.match.reset();
        game.setupDrill(practice.rack);
      }
      refresh();
    },
    onThrowResolved: (result: MatchThrowResult) => {
      // 드릴 중에는 튜토리얼이 결과를 소비한다 — 핀 일부만 세운 드릴에서는
      // 기계가 계산한 "스트라이크!" 문구가 틀리므로 기본 배너를 막는다.
      const suppressBanner = tutorial.handleThrowResolved(result);

      if (practice !== null) {
        // 연습 투구 — 프레임도 점수도 없다. 세우지도 않은 핀까지 "쓰러졌다"고
        // 세므로(FrameMachine은 늘 10개로 센다) 고른 랙 안에서만 다시 센다.
        const rack = practice.rack;
        const knocked = result.knockedPins.filter((pin) => rack.includes(pin)).length;
        practice.record(knocked);
        hud.showBanner(practice.lastMessage ?? '');
        refresh();
        return;
      }

      refresh();
      if (suppressBanner) return;

      if (result.matchOver) {
        const rank = game.match.ranking;
        const text = game.match.isMultiplayer
          ? `${rank[0]!.player.name} 승리! ${rank[0]!.total}점`
          : `끝! ${rank[0]!.total}점`;
        hud.showBanner(text, 4000);
        return;
      }

      // 배너는 한 번만 띄운다. 따로 두 번 띄우면 뒤엣것이 화면에 그려지기도
      // 전에 앞엣것을 덮어써, 다인전에서는 "스트라이크!"가 아예 보이지 않는다.
      const turnNote =
        result.turnChanged && game.match.isMultiplayer ? `${game.match.active.name} 차례` : null;

      // 차례 안내와 나란히 둘 수 있는 것은 축하뿐이다. 나머지 문구("다시 해
      // 볼까요?" 같은 것)는 방금 던진 사람에게 하는 조언이라, 차례가 넘어간
      // 뒤에 붙이면 누구한테 하는 말인지 어긋난다. 그때는 차례만 알린다.
      // 문자열이 아니라 isStrike/isSpare로 가른다 — 문구가 바뀌어도 안 깨진다.
      const isPraise = result.isStrike || result.isSpare;

      if (turnNote === null) {
        if (result.message !== null) hud.showBanner(result.message);
      } else if (isPraise && result.message !== null) {
        hud.showBanner(`${result.message} 이제 ${turnNote}`, 2600);
      } else {
        hud.showBanner(turnNote);
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
        restart();
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

  // ---- 첫 화면 정하기 ----

  // 수업용 딥링크 — 특정 레슨/영역을 바로 연다.
  const lessonParam = params.get('lesson');
  const areaParam = params.get('area');
  const hasDeepLink = lessonParam !== null || areaParam !== null;

  // ?player= 없이 딥링크만 들어오면 누가 보는지 알 수 없다. 그런데
  // PlayerStore는 저장된 사람이 하나라도 있으면 목록의 첫 사람을 현재로
  // 잡아 둔다 — "플레이어가 없으니 저장이 버려져 안전하다"는 말은 틀렸다.
  // 그대로 두면 링크를 여는 것만으로 그 학생의 진도·퀴즈 점수가 바뀌고,
  // 배우지도 않은 해금이 열린다. 그래서 시연 모드로 열고 저장을 막는다.
  if (hasDeepLink && resolved === null) {
    Progress.enterDemoMode();
    const badge = document.createElement('div');
    badge.className = 'demo-badge';
    badge.textContent = '시연 모드 · 배운 기록이 저장되지 않아요';
    ui.appendChild(badge);
  }

  if (hasDeepLink) {
    picker.hide();
    // 딥링크는 onPlayerReady()를 타지 않는다. 손을 맞추는 resetSolo()를
    // 여기서 직접 부르지 않으면 레인은 기본 오른손인데 드릴 목표 핀만
    // 그 학생의 손으로 미러링돼 반쪽만 뒤집힌 화면이 된다.
    tutorial.reloadProgress();
    resetSolo();
    refresh();

    if (lessonParam !== null) {
      tutorial.openLesson(lessonParam.toUpperCase());
    } else {
      const area = (areaParam ?? '').toUpperCase();
      const isAreaId = (v: string): v is AreaId => ['A', 'B', 'C', 'D', 'E'].includes(v);
      tutorial.openMenu(isAreaId(area) ? area : undefined);
    }
  } else if (resolved === null) {
    picker.show();
  } else {
    onPlayerReady();
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
