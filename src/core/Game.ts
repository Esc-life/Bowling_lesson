/**
 * 게임 루프 오케스트레이션.
 *
 * 물리(Rapier) · 그림(Three.js) · 규칙(순수 로직)을 연결한다. 규칙 계층은
 * 여기서만 호출되고, 반대로 규칙이 물리를 부르는 일은 없다.
 *
 * 한 번의 투구가 흐르는 순서
 *   조준 → (드래그로 던짐) → 굴러감 → 멈춤 대기 → 핀 세기 → 다음 배치
 */

import * as THREE from 'three';
import { BALL, DIFFICULTY, LANE, PHYSICS, THROW } from '../config';
import { Bodies } from '../physics/Bodies';
import { SettleWatcher, standingPins } from '../physics/PinState';
import { initRapier, PhysicsWorld } from '../physics/World';
import type { FrameMachine } from '../rules/FrameMachine';
import { MatchMachine, soloMatch, type MatchThrowResult } from '../rules/MatchMachine';
import { ALL_PINS, xToBoard, type Handedness, type PinNumber } from '../rules/pinLayout';
import { AimGuide } from '../scene/AimGuide';
import { Ball } from '../scene/Ball';
import { CameraRig } from '../scene/CameraRig';
import { Lane } from '../scene/Lane';
import { Pins } from '../scene/Pin';
import { SceneSetup } from '../scene/SceneSetup';
import { Trajectory } from '../scene/Trajectory';
import { settings } from '../settings';
import { clamp } from '../util/random';
import { DragInput, type ThrowInput } from './Input';

export type GameEvents = {
  /** 한 번의 투구 결과가 확정되었을 때 */
  onThrowResolved: (result: MatchThrowResult) => void;
  /** 조준 가능 상태가 되었을 때 */
  onReady: () => void;
  /** 상태 표시가 바뀔 때마다 (프레임/파워/위치) */
  onStateChanged: () => void;
  /**
   * 내 물리 시뮬레이션이 실제로 굴림 하나를 정지시켰을 때 (온라인 대전 전용).
   * `applyRemoteThrow()`로 반영한 굴림에는 발화하지 않는다 — 남에게서 받은
   * 결과를 다시 방송하면 무한 루프가 된다.
   */
  onLocalRoll: (remaining: PinNumber[], playerId: string) => void;
};

/** 서는 위치를 버튼 한 번에 옮기는 폭 (m) — 보드 2장쯤 */
const NUDGE_STEP = 0.054;

export class Game {
  readonly scene: SceneSetup;
  readonly input: DragInput;

  /** 지금 진행 중인 매치. 자유 연습은 1명짜리 매치다 */
  private _match: MatchMachine = soloMatch();

  private readonly physics: PhysicsWorld;
  private readonly bodies: Bodies;
  private readonly lane: Lane;
  private readonly pins: Pins;
  private readonly ball: Ball;
  private readonly camera: CameraRig;
  private readonly aimGuide: AimGuide;
  private readonly trajectory: Trajectory;
  private readonly watcher = new SettleWatcher();

  private readonly ballVec = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();

  private lastTime = 0;
  private running = false;
  private rafHandle = 0;
  private timeScale = 1;
  private paused = false;

  /** 헤드핀 Z를 지나는 순간의 공 x — 포켓 판정에 쓴다 */
  private ballXAtHeadPin: number | null = null;
  private hand: Handedness;

  private events: GameEvents = {
    onThrowResolved: () => {},
    onReady: () => {},
    onStateChanged: () => {},
    onLocalRoll: () => {},
  };

  /**
   * 지금 조준을 시작해도 되는가. 온라인 대전에서 내 차례가 아니면 여기서
   * 막는다. 로컬 전용 모드(같은 기기 대전·자유 연습·드릴)는 항상 true다.
   */
  private canAim: () => boolean = () => true;

  private constructor(container: HTMLElement, physics: PhysicsWorld) {
    this.hand = this._match.active.handedness;
    this.physics = physics;

    this.scene = new SceneSetup(container);
    this.bodies = new Bodies(physics);

    this.lane = new Lane(this.hand);
    this.pins = new Pins();
    this.ball = new Ball();
    this.aimGuide = new AimGuide();
    this.trajectory = new Trajectory();

    this.scene.scene.add(this.lane.group);
    this.scene.scene.add(this.pins.group);
    this.scene.scene.add(this.ball.mesh);
    this.scene.scene.add(this.aimGuide.object);
    this.scene.scene.add(this.trajectory.group);

    this.camera = new CameraRig(this.scene.camera);

    this.input = new DragInput(this.scene.renderer.domElement);
    this.input.difficulty = settings.value.difficulty;
    this.input.onThrow((throwInput) => this.throwBall(throwInput));
    this.input.onChange((state) => {
      if (state.active) {
        this.aimGuide.show(state.startX, state.power, state.angle, state.spin);
      } else {
        this.aimGuide.hide();
      }
      this.events.onStateChanged();
    });

    settings.subscribe(() => this.applyDisplaySettings());
    this.applyDisplaySettings();
    this.syncMeshes();
    this.beginAiming();
  }

  static async create(container: HTMLElement): Promise<Game> {
    // Rapier는 WASM이라 첫 사용 전에 초기화가 필요하다
    await initRapier();
    return new Game(container, new PhysicsWorld());
  }

  on(events: Partial<GameEvents>): void {
    this.events = { ...this.events, ...events };
  }

  // -------------------------------------------------------------------------
  // 매치
  // -------------------------------------------------------------------------

  get match(): MatchMachine {
    return this._match;
  }

  /**
   * 지금 차례인 사람의 프레임 상태.
   *
   * HUD·점수판·튜토리얼이 1인 시절부터 쓰던 이름이라 그대로 남긴다.
   * 매치가 1명이면 예전과 완전히 같게 동작한다.
   */
  get machine(): FrameMachine {
    return this._match.activeMachine;
  }

  /** 매치를 갈아 끼운다 (자유 연습 시작, 대전 시작) */
  setMatch(match: MatchMachine): void {
    this._match = match;
    this.setHandedness(match.active.handedness);
    this.trajectory.clearAll();
    this.bodies.setPins([...ALL_PINS]);
    this.beginAiming();
  }

  /** 투구 손을 바꾼다 — 대전에서 차례가 넘어갈 때마다 부른다 */
  setHandedness(hand: Handedness): void {
    if (hand === this.hand) return;
    this.hand = hand;
    this.lane.setHandedness(hand);
    this.syncMeshes();
  }

  /** 온라인 대전 전용 — 지금 조준해도 되는지 판정하는 함수를 갈아 끼운다 */
  setAimGate(canAim: () => boolean): void {
    this.canAim = canAim;
    this.events.onStateChanged();
  }

  // -------------------------------------------------------------------------
  // 설정 반영
  // -------------------------------------------------------------------------

  private applyDisplaySettings(): void {
    const s = settings.value;
    this.input.difficulty = s.difficulty;
    this.pins.setNumbersVisible(s.showPinNumbers);
    this.lane.setOilZoneVisible(s.showOilZone);
    this.trajectory.setVisible(s.showTrajectory);
  }

  setObserveState(state: { timeScale: number; paused: boolean }): void {
    this.timeScale = state.timeScale;
    this.paused = state.paused;
  }

  // -------------------------------------------------------------------------
  // 투구
  // -------------------------------------------------------------------------

  /** 조준 상태로 들어간다 */
  beginAiming(): void {
    if (this.machine.isGameOver) {
      this.input.enabled = false;
      this.events.onStateChanged();
      return;
    }
    this.bodies.setPins(this.machine.standingPins);
    this.bodies.placeBall(this.input.startX);
    this.ballXAtHeadPin = null;
    this.watcher.reset();
    this.physics.resetAccumulator();
    this.input.reset();
    this.input.enabled = this.canAim();
    this.camera.setMode('aim');
    this.syncMeshes();
    this.events.onReady();
    this.events.onStateChanged();
  }

  private throwBall(input: ThrowInput): void {
    // machine.phase는 settle() 안에서 다음 조준 상태로 즉시 바뀌지만, 핀을
    // 다시 세우고 공을 놓는 beginAiming()은 결과를 보여주는 1400ms 뒤에야
    // 실행된다(updateThrowProgress 참고). phase만 보고 막으면 그 1400ms
    // 사이에 던져진 공이 아직 이전 핀이 남아 있는 레인을 지나가며 0개로
    // 기록된다. 사람의 드래그는 Input.enabled가 이 창을 이미 막아 주지만
    // throwProgrammatically()(레슨 시연 투구)는 이 메서드를 직접 부르므로
    // 같은 조건을 여기서도 강제해야 한다.
    if (this.machine.phase !== 'aiming' || !this.input.enabled) return;

    this.input.enabled = false;
    this._match.throwBall();
    this.watcher.reset();
    this.ballXAtHeadPin = null;
    this.trajectory.beginThrow();
    this.aimGuide.hide();

    this.bodies.launchBall({
      startX: input.startX,
      speed: DragInput.powerToSpeed(input.power),
      angle: input.angle,
      spin: input.spin,
    });

    this.events.onStateChanged();
  }

  /**
   * 코드로 정해진 값으로 던진다.
   *
   * 레슨 D3("공은 왜 휘나요?")에서 회전을 0으로 준 공과 크게 준 공을
   * 똑같은 파워·각도로 던져 궤적을 비교해 보여줄 때 쓴다. 사람이 드래그로
   * 같은 조건을 두 번 만들 수는 없으므로 시연에는 이 경로가 필요하다.
   */
  throwProgrammatically(input: ThrowInput): void {
    if (this.machine.phase !== 'aiming') return;
    this.input.setStartX(input.startX);
    this.throwBall(input);
  }

  /**
   * 물리를 건너뛰고 쓰러진 핀 수만 넣는다 (`?debug=1`의 숫자 키).
   * 점수 로직을 물리 대기 없이 10프레임 통과시킬 수 있다.
   */
  debugKnock(count: number): void {
    if (this.machine.isGameOver) return;
    const clamped = clamp(count, 0, this.machine.standingPins.length);
    const result = this._match.settleWithCount(Math.round(clamped));
    if (result.turnChanged && !result.matchOver) {
      this.setHandedness(this._match.active.handedness);
    }
    this.events.onThrowResolved(result);
    this.beginAiming();
  }

  /**
   * 온라인 대전에서 상대가 던진 결과를 반영한다 (온라인 대전 전용).
   *
   * 상대의 물리를 이 기기에서 재현하지 않는다 — `remaining`(굴림 뒤 남은 핀)은
   * 상대 기기의 물리가 이미 확정한 값을 그대로 받은 것이다. 공이 굴러가는
   * 과정 없이 핀이 곧장 그 결과로 바뀌고, 배너·차례 안내는
   * `onThrowResolved`를 그대로 타므로 로컬 대전과 문구가 같다.
   */
  applyRemoteThrow(remaining: readonly PinNumber[]): MatchThrowResult {
    this._match.throwBall();
    const result = this._match.settle(remaining);

    if (result.turnChanged && !result.matchOver) {
      this.setHandedness(this._match.active.handedness);
    }

    // 굴러가는 연출 없이 결과만 즉시 보여준다 — 던진 사람 화면의 '결과 표시' 순간과 같다
    this.bodies.setPins(remaining);
    this.syncMeshes();
    this.camera.setMode('result');
    this.events.onThrowResolved(result);

    window.setTimeout(() => {
      if (!this.machine.isGameOver) this.beginAiming();
      else this.events.onStateChanged();
    }, 1400);

    return result;
  }

  /**
   * 서는 위치를 화면 기준 좌우로 옮긴다.
   *
   * 화면 오른쪽이 월드 -x이므로 부호를 뒤집어야 한다. 이걸 빠뜨리면
   * ▶ 버튼을 눌렀을 때 공이 왼쪽으로 간다.
   */
  nudge(screenDirection: 'left' | 'right'): void {
    if (!this.input.enabled) return;
    const worldSign = screenDirection === 'right' ? -1 : 1;
    this.input.nudgeStartX(worldSign * NUDGE_STEP);
    this.bodies.placeBall(this.input.startX);
    this.syncMeshes();
    this.events.onStateChanged();
  }

  /** 튜토리얼 드릴: 지정한 핀만 세우고 시작 위치를 정한다 */
  setupDrill(standing: readonly PinNumber[], startX?: number): void {
    this.bodies.setPins(standing);
    if (startX !== undefined) this.input.setStartX(startX);
    this.bodies.placeBall(this.input.startX);
    this.watcher.reset();
    this.input.enabled = true;
    this.camera.setMode('aim');
    this.syncMeshes();
    this.events.onStateChanged();
  }

  restart(): void {
    this._match.reset();
    this.setHandedness(this._match.active.handedness);
    this.trajectory.clearAll();
    this.beginAiming();
  }

  // -------------------------------------------------------------------------
  // 루프
  // -------------------------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;
      this.tick(dt);
      this.rafHandle = requestAnimationFrame(loop);
    };
    this.rafHandle = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafHandle);
  }

  private tick(realDt: number): void {
    const scale = this.paused ? 0 : this.timeScale;
    const steps = this.physics.advance(realDt, scale);
    // 물리가 실제로 흐른 시간. 슬로모션이면 실제 시간보다 느리게 흐른다.
    const physicsDt = steps * PHYSICS.timestep;

    this.syncMeshes();
    this.recordHeadPinCrossing();

    if (physicsDt > 0) {
      this.trajectory.sample(physicsDt, this.ballVec.x, this.ballVec.y, this.ballVec.z);
      this.updateThrowProgress(physicsDt);
    }

    this.camera.autoMode(this.ballVec.z, this.machine.phase !== 'aiming');
    this.camera.update(realDt, this.ballVec);
    this.scene.render();
  }

  private updateThrowProgress(physicsDt: number): void {
    const phase = this.machine.phase;
    if (phase !== 'thrown' && phase !== 'settling') return;

    if (this.bodies.ballIsOut()) this._match.beginSettling();

    const status = this.watcher.update(this.bodies, physicsDt);
    if (status !== 'settled') return;

    const remaining = standingPins(this.bodies, this.machine.standingPins);
    // 던진 사람 — settle()이 차례를 넘기기 전에 잡아 둔다
    const throwerId = this._match.active.id;
    const result = this._match.settle(remaining);
    this.events.onLocalRoll(remaining, throwerId);

    // 차례가 넘어갔으면 다음 사람의 손으로 레인 표시를 바꾼다
    if (result.turnChanged && !result.matchOver) {
      this.setHandedness(this._match.active.handedness);
    }

    this.camera.setMode('result');
    this.events.onThrowResolved(result);

    // 결과를 잠깐 보여준 뒤 다음 조준으로
    window.setTimeout(() => {
      if (!this.machine.isGameOver) this.beginAiming();
      else this.events.onStateChanged();
    }, 1400);
  }

  /** 공이 헤드핀 라인을 지나는 순간의 x를 한 번만 기록한다 */
  private recordHeadPinCrossing(): void {
    if (this.ballXAtHeadPin !== null) return;
    if (this.ballVec.z >= LANE.headPinZ) {
      this.ballXAtHeadPin = this.ballVec.x;
    }
  }

  get pocketEntryX(): number | null {
    return this.ballXAtHeadPin;
  }

  /** 물리 → 그림 위치 동기화 */
  private syncMeshes(): void {
    const bp = this.bodies.ballPosition();
    this.ballVec.set(bp.x, bp.y, bp.z);
    this.ball.mesh.position.copy(this.ballVec);
    const bq = this.bodies.ball.rotation();
    this.quaternion.set(bq.x, bq.y, bq.z, bq.w);
    this.ball.mesh.quaternion.copy(this.quaternion);

    for (const pin of ALL_PINS) {
      const body = this.bodies.pins[pin - 1]!;
      const mesh = this.pins.meshFor(pin);
      const enabled = body.isEnabled();
      mesh.visible = enabled;
      if (!enabled) continue;
      const p = body.translation();
      const q = body.rotation();
      mesh.position.set(p.x, p.y, p.z);
      mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
  }

  // -------------------------------------------------------------------------
  // 표시용 정보
  // -------------------------------------------------------------------------

  get currentBoard(): number {
    return xToBoard(this.input.startX, this.hand);
  }

  /** 디버그 표시용 상태 묶음 */
  get snapshot(): {
    phase: string;
    frame: number;
    ball: number;
    ballX: number;
    ballZ: number;
    ballSpeed: number;
    /** 옆회전 = 진행 방향(Z)을 축으로 한 회전. 훅을 만드는 성분 */
    ballSideSpin: number;
    standing: readonly PinNumber[];
    steps: number;
    settleElapsed: number;
    pocketX: number | null;
  } {
    const v = this.bodies.ball.linvel();
    const w = this.bodies.ball.angvel();
    return {
      phase: this.machine.phase,
      frame: this.machine.currentFrame,
      ball: this.machine.ballInFrame,
      ballX: this.ballVec.x,
      ballZ: this.ballVec.z,
      ballSpeed: Math.hypot(v.x, v.y, v.z),
      ballSideSpin: w.z,
      standing: this.machine.standingPins,
      steps: this.physics.stepsLastFrame,
      settleElapsed: this.watcher.secondsElapsed,
      pocketX: this.ballXAtHeadPin,
    };
  }

  get maxAngleDeg(): number {
    return THROW.maxAngleDeg * DIFFICULTY[this.input.difficulty].angle;
  }

  get ballHeight(): number {
    return BALL.radius;
  }

  dispose(): void {
    this.stop();
    this.input.dispose();
    this.aimGuide.dispose();
    this.trajectory.dispose();
    this.pins.dispose();
    this.ball.dispose();
    this.scene.dispose();
    this.physics.dispose();
  }
}
