/**
 * 튜토리얼 전체 흐름의 지휘자.
 *
 * 메뉴 ↔ 레슨 패널 ↔ 드릴/관찰(3D 화면) 사이의 전환, 진행률 저장,
 * 게임과의 연결을 전부 여기서 맡는다. 패널·메뉴·리포트는 화면만 그린다.
 *
 * 드릴 중 게임 규칙 처리
 *  - 핀 일부만 세우는 드릴에서도 FrameMachine은 그대로 돈다. 점수는
 *    쓰지 않으므로 매 시도 전에 machine.reset() + setupDrill()로 되돌린다.
 *    이렇게 하면 12번 시도가 쌓여도 "게임 종료"에 걸리지 않는다.
 *  - 점수 드릴(10프레임 완주)만 진짜 게임 그대로 진행한다.
 */

import type { Game } from '../core/Game';
import { players } from '../players/PlayerStore';
import type { ThrowResult } from '../rules/FrameMachine';
import { soloMatch, type MatchMachine } from '../rules/MatchMachine';
import type { Handedness } from '../rules/pinLayout';
import { settings } from '../settings';
import { DrillRunner } from '../tutorial/DrillRunner';
import { findLesson } from '../tutorial/curriculum';
import { Progress } from '../tutorial/Progress';
import { TutorialFlow, type QuizScore } from '../tutorial/TutorialFlow';
import type { AreaId, Drill, Lesson } from '../tutorial/types';
import { AreaMenu, type ResumableGame } from './AreaMenu';
import { ReportScreen } from './ReportScreen';
import { TutorialPanel, type LessonContext } from './TutorialPanel';

export type TutorialHooks = {
  /** 드릴/관찰 세션이 켜지거나 꺼질 때 (점수판 숨김 등에 쓴다) */
  onSessionChange?: (state: { active: boolean; hideScoreboard: boolean }) => void;
  /** 홈에서 자유 연습을 골랐을 때 */
  onFreePractice: () => void;
  /** 홈에서 대전을 골랐을 때 */
  onMatch: () => void;
  /** 홈에서 온라인 대전을 골랐을 때 */
  onOnlineMatch: () => void;
  /** 홈에서 플레이어 바꾸기를 골랐을 때 */
  onSwitchPlayer: () => void;
  /** 홈에서 "치던 경기로 돌아가기"를 골랐을 때 */
  onResumeGame: () => void;
  /**
   * 홈을 그릴 때마다 불러 "치던 경기로 돌아가기" 버튼을 보일지 정한다.
   *
   * openMenu()는 main.ts의 openHome() 말고도 레슨 패널의 ✕(onClose/onMenu)
   * 처럼 TutorialUI 내부에서 직접 불리는 경로가 있다. 값을 한 번 받아 두면
   * 그 경로들에서 낡은(또는 없는) 값을 쓰게 되므로, 그릴 때마다 다시 묻는다.
   */
  getResumableGame: () => ResumableGame | null;
};

type DrillSession = { kind: 'drill'; lessonId: string; runner: DrillRunner };
type ObserveSession = { kind: 'observe'; lessonId: string; times: number; count: number };

/** 결과 연출(핀 넘어지는 것)을 보여준 뒤 패널을 다시 여는 대기 시간 */
const RESULT_LINGER_MS = 1800;

export class TutorialUI {
  /** 플레이어가 바뀌면 통째로 갈아 끼운다 (reloadProgress) */
  private flow: TutorialFlow;
  private readonly panel: TutorialPanel;
  private readonly menu: AreaMenu;
  private readonly report: ReportScreen;
  private readonly bar: HTMLElement;
  private readonly barToggle: HTMLButtonElement;
  private readonly barBody: HTMLElement;

  private currentLessonId: string | null = null;
  private session: DrillSession | ObserveSession | null = null;
  /**
   * 드릴/관찰을 시작하기 직전에 진행 중이던 솔로 10프레임 경기.
   *
   * 홈에서 레슨으로 들어와 드릴을 시작하면 beginOwnMatch()가 매치를 통째로
   * 갈아 끼운다 — 그 전에 학생이 치던 경기(홈의 "돌아가기" 버튼이 가리키는
   * 바로 그 경기)가 여기 저장돼 있지 않으면 조용히 사라진다. 세션이 끝나면
   * 이걸 되돌린다.
   */
  private savedMatch: MatchMachine | null = null;
  private reopenTimer: number | null = null;

  /** 지금 배우는 사람의 손. 포켓·화살표·드릴 목표가 전부 여기에 맞춰진다 */
  private get hand(): Handedness {
    return players.current?.handedness ?? 'right';
  }

  constructor(
    private readonly game: Game,
    container: HTMLElement,
    private readonly hooks: TutorialHooks,
  ) {
    this.flow = new TutorialFlow(Progress.load());
    this.currentLessonId = this.flow.currentLessonId;

    this.panel = new TutorialPanel(this.hand, {
      onMenu: () => {
        this.abandonSession();
        this.openMenu();
      },
      // 레슨 패널의 ✕는 홈으로 돌아간다. 게임 화면으로 빠져나가면
      // 자유 연습·대전 잠금을 건너뛰는 뒷문이 된다.
      onClose: () => {
        this.abandonSession();
        this.openMenu();
      },
      onNext: () => this.goNext(),
      onComplete: (score?: QuizScore) => this.markComplete(score),
      onStartDrill: (drill) => this.startDrill(drill),
      onStartTrajectoryObserve: (times) => this.startObserve(times),
    });

    this.menu = new AreaMenu({
      onOpenLesson: (id) => this.openLesson(id),
      onReport: () => {
        this.menu.hide();
        this.report.show(this.flow);
      },
      onReset: () => {
        // 이 플레이어의 진도만 비운다. 손은 플레이어에 저장되어 있고,
        // 관찰 옵션 같은 전역 설정은 다른 사람 것이기도 하므로 남겨 둔다.
        Progress.clear();
        location.reload();
      },
      onFreePractice: () => {
        this.closeAll();
        this.hooks.onFreePractice();
      },
      onMatch: () => {
        this.closeAll();
        this.hooks.onMatch();
      },
      onOnlineMatch: () => {
        this.closeAll();
        this.hooks.onOnlineMatch();
      },
      onSwitchPlayer: () => {
        this.closeAll();
        this.hooks.onSwitchPlayer();
      },
      onResumeGame: () => {
        this.closeAll();
        this.hooks.onResumeGame();
      },
    });

    this.report = new ReportScreen(() => {
      this.report.hide();
      this.openMenu();
    });

    this.bar = document.createElement('div');
    this.bar.className = 'drill-bar';
    this.bar.hidden = true;
    this.bar.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset['act'];
      if (act === 'quit') this.quitSession();
      if (act === 'demo-straight') this.demoThrow(0);
      if (act === 'demo-hook') this.demoThrow(this.hand === 'right' ? 12 : -12);
      if (act === 'toggle-bar') this.toggleBarCollapsed();
    });

    // 좁은 화면에서 드릴 안내가 경기 장면을 가리는 것을 막기 위해 접을 수
    // 있게 한다. updateBar()는 barBody의 내용만 갈아 끼우므로 접기 상태는
    // 다시 그려도 안 풀린다.
    this.barToggle = document.createElement('button');
    this.barToggle.type = 'button';
    this.barToggle.className = 'panel-toggle';
    this.barToggle.dataset['act'] = 'toggle-bar';
    this.barToggle.setAttribute('aria-expanded', 'true');
    this.barToggle.setAttribute('aria-label', '드릴 안내 접기');
    this.barToggle.textContent = '▾';

    this.barBody = document.createElement('div');
    this.barBody.className = 'drill-bar-body';

    this.bar.append(this.barToggle, this.barBody);

    container.appendChild(this.panel.element);
    container.appendChild(this.menu.element);
    container.appendChild(this.report.element);
    container.appendChild(this.bar);

    players.subscribe(() => this.panel.setHand(this.hand));
  }

  // -------------------------------------------------------------------------
  // 화면 전환
  // -------------------------------------------------------------------------

  get isOpen(): boolean {
    return this.panel.visible || this.menu.visible || this.report.visible || this.session !== null;
  }

  /**
   * 플레이어가 바뀌었을 때 그 사람의 진도로 다시 읽는다.
   *
   * 이걸 빠뜨리면 앞사람의 진도를 들고 있다가 다음 저장에서 새 플레이어의
   * 진도를 덮어쓴다.
   */
  reloadProgress(): void {
    this.flow = new TutorialFlow(Progress.load());
    this.currentLessonId = this.flow.currentLessonId;
    this.panel.setHand(this.hand);
  }

  /**
   * 홈(영역 메뉴)을 연다.
   * @param notice 홈 맨 위에 한 줄 알릴 말 (예: 대전을 그만뒀다는 안내)
   */
  openMenu(focusArea?: AreaId, notice?: string): void {
    this.panel.hide();
    this.report.hide();
    this.menu.show(this.flow, focusArea, notice, this.hooks.getResumableGame());
  }

  openLesson(lessonId: string): void {
    const found = findLesson(lessonId);
    if (found === null) {
      this.openMenu();
      return;
    }
    this.currentLessonId = lessonId;
    this.flow.setCurrent(lessonId);
    this.save();

    this.menu.hide();
    this.report.hide();
    this.panel.setHand(this.hand);
    const lesson = found.area.lessons.find((l) => l.id === lessonId)!;
    this.panel.showLesson(lesson, this.lessonContext(lesson));
  }

  /** 튜토리얼 화면을 전부 닫고 게임 화면으로 */
  closeAll(): void {
    this.abandonSession();
    this.panel.hide();
    this.menu.hide();
    this.report.hide();
  }

  private goNext(): void {
    const current = this.currentLessonId;
    const next = current === null ? null : this.flow.nextOverall(current);
    if (next !== null) {
      this.openLesson(next);
    } else {
      // 마지막 레슨이었다 — 리포트로 마무리
      this.panel.hide();
      this.report.show(this.flow);
    }
  }

  private markComplete(score?: QuizScore): void {
    const id = this.currentLessonId;
    if (id === null) return;
    this.flow.complete(id, score);
    this.save();
  }

  private save(): void {
    Progress.save(this.flow.toState());
  }

  private lessonContext(lesson: Lesson, drillResult?: LessonContext['drillResult']): LessonContext {
    const found = findLesson(lesson.id);
    const ctx: LessonContext = {
      areaTitle: found?.area.title ?? '',
      completed: this.flow.isCompleted(lesson.id),
      hasNext: this.flow.nextOverall(lesson.id) !== null,
    };
    if (drillResult !== undefined) ctx.drillResult = drillResult;
    return ctx;
  }

  // -------------------------------------------------------------------------
  // 드릴 세션
  // -------------------------------------------------------------------------

  private startDrill(drill: Drill): void {
    const lessonId = this.currentLessonId;
    if (lessonId === null) return;

    const runner = new DrillRunner(drill, this.hand);
    this.session = { kind: 'drill', lessonId, runner };
    this.panel.hide();
    this.menu.hide();
    this.showBar();
    this.hooks.onSessionChange?.({ active: true, hideScoreboard: runner.freshRackEachThrow });

    this.saveMatchIfResumable();
    // setMatch → beginAiming → onReady → handleReady()가 드릴 핀을 세운다
    this.beginOwnMatch();
    this.updateBar(null);
  }

  private startObserve(times: number): void {
    const lessonId = this.currentLessonId;
    if (lessonId === null) return;

    this.session = { kind: 'observe', lessonId, times, count: 0 };
    // 관찰에 필요한 보조 표시를 자동으로 켠다 (관찰 모드 체크박스도 따라간다)
    settings.update({ showTrajectory: true, showOilZone: true });
    this.panel.hide();
    this.menu.hide();
    this.showBar();
    this.hooks.onSessionChange?.({ active: true, hideScoreboard: false });
    this.saveMatchIfResumable();
    this.beginOwnMatch();
    this.updateBar(null);
  }

  /**
   * 드릴·관찰이 쓸 매치를 지금 배우는 사람 기준으로 새로 만든다.
   *
   * game.restart()를 쓰면 안 된다. 그건 화면에 올라와 있던 매치를 그대로
   * 이어 쓰는데, 대전 중이었다면 친구들이 치던 점수를 통째로 지우고,
   * 게다가 reset() 뒤의 차례는 언제나 참가자[0]이라 레인·화살표는 A의 손,
   * 드릴 목표 핀은 B의 손으로 갈려 미러링이 반쪽만 걸린다.
   *
   * 드릴이 제 매치를 들고 있으면 손은 늘 players.current 기준이 된다.
   */
  private beginOwnMatch(): void {
    this.game.setMatch(soloMatch(players.current?.name ?? '나', 10, this.hand));
  }

  /**
   * 드릴/관찰을 시작하기 직전의 매치를 봐 두고, 되돌릴 가치가 있으면 저장한다.
   *
   * 되돌릴 가치 = 혼자 치는 경기(대전 아님) + 적어도 한 번은 던졌음
   * (lastResult) + 아직 안 끝남. 갓 만든 빈 매치나 대전은 저장하지 않는다 —
   * 대전은 main.ts의 openHome()이 홈으로 나가는 순간 이미 끝내므로 레슨
   * 화면까지 들고 올 일이 없다.
   */
  private saveMatchIfResumable(): void {
    const m = this.game.match;
    if (m.isMultiplayer) return;
    const fm = m.activeMachine;
    if (fm.lastResult !== null && !fm.isGameOver) this.savedMatch = m;
  }

  /** 저장해 둔 경기가 있으면 되돌리고, 없으면 늘 하던 대로 새로 만든다 */
  private restoreOrBeginOwnMatch(): void {
    if (this.savedMatch !== null) {
      this.game.setMatch(this.savedMatch);
      this.savedMatch = null;
    } else {
      this.beginOwnMatch();
    }
  }

  /** 조준 상태가 될 때마다 (Game.onReady) — 드릴 핀을 다시 세운다 */
  handleReady(): void {
    const s = this.session;
    if (s === null || s.kind !== 'drill') return;
    const runner = s.runner;
    if (runner.isFinished) return;
    if (runner.freshRackEachThrow) {
      this.game.machine.reset();
      this.game.setupDrill(runner.pins, runner.startX);
    }
  }

  /**
   * 투구 결과 하나가 확정되었을 때 (Game.onThrowResolved).
   * @returns true면 기본 배너(스트라이크! 등)를 띄우지 말 것 —
   *          핀 일부만 세운 드릴에서는 기계가 계산한 문구가 틀리다.
   */
  handleThrowResolved(result: ThrowResult): boolean {
    const s = this.session;
    if (s === null) return false;

    if (s.kind === 'observe') {
      s.count++;
      if (s.count >= s.times) {
        this.flow.complete(s.lessonId);
        this.save();
        this.updateBar('👀 잘 봤어요! 공이 뒤쪽에서 휘는 게 보였나요?');
        this.scheduleReopen(() => this.endSession());
      } else {
        this.updateBar(null);
      }
      return false;
    }

    const runner = s.runner;
    if (runner.isFinished) return false;

    const outcome = runner.recordThrow({
      result,
      pocketX: this.game.pocketEntryX,
      totalScore: this.game.machine.scorecard.total,
      gameOver: this.game.machine.isGameOver,
    });

    if (outcome.finished) {
      // 성공하든 못 하든 완료로 기록한다 — 목적은 통과가 아니라 이해다
      this.flow.complete(s.lessonId);
      this.save();
      const message = outcome.success
        ? '🎉 성공! 정말 잘했어요!'
        : '기회를 다 썼어요. 그래도 많이 늘었어요!';
      this.updateBar(message);
      this.scheduleReopen(() =>
        this.endSession({
          success: outcome.success,
          message: outcome.success
            ? '🎉 성공했어요!'
            : '이번엔 아쉬웠어요. 다시 도전해 볼까요?',
        }),
      );
    } else {
      this.updateBar(
        runner.drill.goal.kind === 'minScore'
          ? null
          : outcome.hit
            ? '👍 좋아요! 한 번 더!'
            : '아깝다! 다시 한 번!',
      );
    }

    return runner.freshRackEachThrow && runner.pins.length < 10;
  }

  /** 결과 연출을 잠깐 보여준 뒤 패널로 돌아간다 */
  private scheduleReopen(fn: () => void): void {
    if (this.reopenTimer !== null) window.clearTimeout(this.reopenTimer);
    this.reopenTimer = window.setTimeout(() => {
      this.reopenTimer = null;
      fn();
    }, RESULT_LINGER_MS);
  }

  /** 세션을 끝내고 레슨 패널로 돌아간다 */
  private endSession(drillResult?: LessonContext['drillResult']): void {
    const s = this.session;
    this.session = null;
    this.bar.hidden = true;
    this.hooks.onSessionChange?.({ active: false, hideScoreboard: false });
    // 드릴이 남겨 둔 반쪽 랙을 치운다. 드릴 전에 진행 중이던 경기를 저장해
    // 뒀다면 그걸 되돌리고, 없었으면 늘 하던 대로 자기 매치를 새로 만든다 —
    // 어느 쪽이든 손이 어긋나는 경로는 남기지 않는다.
    this.restoreOrBeginOwnMatch();

    const lessonId = s?.lessonId ?? this.currentLessonId;
    const found = lessonId === null ? null : findLesson(lessonId);
    if (found === null || lessonId === null) return;
    const lesson = found.area.lessons.find((l) => l.id === lessonId)!;
    this.panel.showLesson(lesson, this.lessonContext(lesson, drillResult));
  }

  /** '그만하기' — 완료 기록 없이 패널로 */
  private quitSession(): void {
    if (this.reopenTimer !== null) {
      window.clearTimeout(this.reopenTimer);
      this.reopenTimer = null;
    }
    this.endSession();
  }

  /** 화면 전환 없이 세션만 중단 (메뉴로 갈 때 등) */
  private abandonSession(): void {
    if (this.session === null) return;
    if (this.reopenTimer !== null) {
      window.clearTimeout(this.reopenTimer);
      this.reopenTimer = null;
    }
    this.session = null;
    this.bar.hidden = true;
    this.hooks.onSessionChange?.({ active: false, hideScoreboard: false });
    this.restoreOrBeginOwnMatch();
  }

  private demoThrow(spin: number): void {
    // 곧은 공은 한가운데에서, 휘는 공은 반대쪽에서 출발해 포켓 쪽으로 휜다
    const startX = spin === 0 ? 0 : this.hand === 'right' ? 0.15 : -0.15;
    this.game.throwProgrammatically({ startX, power: 0.55, angle: 0, spin });
  }

  // -------------------------------------------------------------------------
  // 드릴/관찰 안내 바
  // -------------------------------------------------------------------------

  private showBar(): void {
    this.bar.hidden = false;
    // 새 드릴/관찰은 항상 펼쳐진 채로 시작한다 — 안내 목표를 놓치지 않게.
    this.bar.classList.remove('is-collapsed');
    this.barToggle.textContent = '▾';
    this.barToggle.setAttribute('aria-expanded', 'true');
  }

  private toggleBarCollapsed(): void {
    const collapsed = this.bar.classList.toggle('is-collapsed');
    this.barToggle.textContent = collapsed ? '▸' : '▾';
    this.barToggle.setAttribute('aria-expanded', String(!collapsed));
    this.barToggle.setAttribute('aria-label', collapsed ? '드릴 안내 펼치기' : '드릴 안내 접기');
  }

  private updateBar(message: string | null): void {
    const s = this.session;
    if (s === null) return;

    if (s.kind === 'observe') {
      this.barBody.innerHTML = `
        <div class="drill-bar-goal">👀 공이 굴러간 길을 봐요 (${s.count} / ${s.times})</div>
        <div class="drill-bar-msg">${message ?? '아래 버튼으로 굴리거나 직접 드래그해 봐요.'}</div>
        <div class="drill-bar-actions">
          <button type="button" class="text-btn" data-act="demo-straight">곧은 공 굴리기</button>
          <button type="button" class="text-btn" data-act="demo-hook">휘는 공 굴리기</button>
          <button type="button" class="text-btn" data-act="quit">그만하기</button>
        </div>`;
      return;
    }

    const runner = s.runner;
    const isScoreDrill = runner.drill.goal.kind === 'minScore';
    const progress = isScoreDrill
      ? `지금 ${this.game.machine.scorecard.total}점 · ${runner.attemptsUsed}번 던졌어요`
      : `성공 ${runner.successes} / ${runner.target} · 기회 ${runner.attemptsMax - runner.attemptsUsed}번 남음`;

    this.barBody.innerHTML = `
      <div class="drill-bar-goal">🎯 ${runner.goalLabel}</div>
      <div class="drill-bar-progress">${progress}</div>
      <div class="drill-bar-msg">${message ?? runner.hint ?? ''}</div>
      <div class="drill-bar-actions">
        <button type="button" class="text-btn" data-act="quit">그만하기</button>
      </div>`;
  }
}
