/**
 * 강체 생성과 재사용(풀링).
 *
 * 핀 10개와 공 1개는 게임 시작 시 딱 한 번 만들고, 이후에는 위치와 속도만
 * 되돌린다. 프레임마다 강체를 만들고 없애면 Rapier 내부 인덱스가 계속
 * 바뀌면서 성능도 안정성도 나빠진다.
 *
 * 공이 휘는 이유는 여기 있다: 레인 표면을 오일 구간과 드라이 구간으로
 * 나눠 마찰을 다르게 준다. 앞은 미끄러워 회전이 유지되고, 뒤는 마찰이
 * 커서 회전이 진행 방향을 바꾸는 힘으로 바뀐다.
 */

import { BALL, LANE, OIL, PIN } from '../config';
import { ALL_PINS, pinPosition, type PinNumber } from '../rules/pinLayout';
import { RAPIER, type PhysicsWorld } from './World';

export type Vec3 = { x: number; y: number; z: number };

export type LaunchInput = {
  /** 파울라인에서의 좌우 시작 위치 (m) */
  startX: number;
  /** 릴리즈 속도 (m/s) */
  speed: number;
  /** 발사 각도 (라디안) */
  angle: number;
  /**
   * 옆회전 (rad/s). 진행 방향(Z)을 축으로 한 회전이다.
   *
   * 여기가 훅의 핵심이다. 세로축(Y) 회전을 주면 공은 절대 휘지 않는다.
   * 접지점의 미끄럼 속도는 v + ω×r 이고 r = (0,-R,0) 이므로, ω가 Y축과
   * 나란하면 ω×r = 0 이 되어 마찰에 좌우 성분이 생기지 않는다.
   * ω가 Z축이면 ω×r = (ωz·R, 0, 0) 으로 좌우 미끄럼이 생기고, 마찰이
   * 그것을 막으면서 공을 옆으로 밀어낸다. 실제 볼링에서 회전축을 진행
   * 방향으로 기울여 던지는 것과 같은 원리다.
   */
  spin: number;
};

const HALF_WIDTH = LANE.width / 2;
const PIN_RADIUS = PIN.maxDiameter / 2;

/**
 * 물리 바닥의 반두께 (m). 보이는 레인 두께와 무관하게 두껍게 만든다.
 * 얇은 판은 세게 맞은 핀이 통과해 버린다.
 */
const SLAB_HALF = 0.5;

export class Bodies {
  readonly ball: RAPIER.RigidBody;
  /** 인덱스 0 = 1번 핀 */
  readonly pins: RAPIER.RigidBody[] = [];

  private readonly world: RAPIER.World;
  private readonly pinSpawn: Vec3[] = [];
  private ballLaunched = false;

  constructor(pw: PhysicsWorld) {
    this.world = pw.world;
    this.buildLane();
    this.ball = this.buildBall();
    this.buildPins();
    this.setPins(ALL_PINS);
  }

  // -------------------------------------------------------------------------
  // 레인
  // -------------------------------------------------------------------------

  private buildLane(): void {
    const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

    /**
     * 바닥 판 하나를 만든다. z0~z1 구간, 지정한 마찰.
     *
     * 물리 콜라이더는 보이는 두께(8cm)가 아니라 두꺼운 덩어리로 만든다.
     * 얇은 판으로 두면 세게 맞은 핀이 한 스텝(1/120초)에 판을 통과해
     * 무한히 떨어진다. 아래쪽은 보이지 않으므로 두껍게 해도 손해가 없다.
     */
    const surface = (z0: number, z1: number, friction: number) => {
      const halfLen = (z1 - z0) / 2;
      const desc = RAPIER.ColliderDesc.cuboid(HALF_WIDTH, SLAB_HALF, halfLen)
        // 윗면이 정확히 y=0에 오도록 아래로 내린다
        .setTranslation(0, -SLAB_HALF, z0 + halfLen)
        .setFriction(friction)
        .setRestitution(BALL.restitution)
        // Multiply 규칙: 공 마찰(1.0) × 레인 마찰 = 의도한 값이 그대로 나온다.
        // 기본 Average 규칙이면 오일 구간에서도 마찰이 0.5쯤으로 올라가 훅이 죽는다.
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply);
      this.world.createCollider(desc, ground);
    };

    // 어프로치(걸어오는 곳) — 파울라인 앞
    surface(-LANE.approachLength, 0, 0.4);
    // 오일 구간 — 미끄럽다
    surface(0, OIL.endZ, OIL.slickFriction);
    // 드라이 구간 + 핀덱 — 여기서 공이 휜다
    surface(OIL.endZ, LANE.pitZ, OIL.dryFriction);

    // 거터(양옆 홈) — 레인보다 낮고 미끄럽다
    for (const side of [-1, 1]) {
      const cx = side * (HALF_WIDTH + LANE.gutterWidth / 2);
      const halfLen = (LANE.pitZ + LANE.approachLength) / 2;
      const desc = RAPIER.ColliderDesc.cuboid(LANE.gutterWidth / 2, SLAB_HALF, halfLen)
        .setTranslation(cx, -LANE.gutterDepth - SLAB_HALF, LANE.pitZ - halfLen)
        .setFriction(0.05)
        .setRestitution(0.1);
      this.world.createCollider(desc, ground);

      // 거터 안쪽 벽 (레인 가장자리에서 거터로 떨어지는 단차)
      const lipDesc = RAPIER.ColliderDesc.cuboid(0.03, LANE.gutterDepth / 2, halfLen)
        .setTranslation(side * HALF_WIDTH, -LANE.gutterDepth / 2, LANE.pitZ - halfLen)
        .setFriction(0.1);
      this.world.createCollider(lipDesc, ground);

      // 바깥 벽 — 공과 핀이 씬 밖으로 나가지 않게.
      //
      // 핏 구간까지 이어져야 한다. 레인이 끝나는 곳에서 벽이 끊기면 핏이
      // 뚫린 상자가 되어, 떨어진 공과 핀이 옆으로 빠져나가 끝없이 추락한다.
      const wallHalfLen = (LANE.pitZ + 2.6 + LANE.approachLength) / 2;
      const wallDesc = RAPIER.ColliderDesc.cuboid(0.15, 1.7, wallHalfLen)
        .setTranslation(
          side * (HALF_WIDTH + LANE.gutterWidth + 0.15),
          -0.2,
          LANE.pitZ + 2.6 - wallHalfLen,
        )
        .setFriction(0.2)
        .setRestitution(0.2);
      this.world.createCollider(wallDesc, ground);
    }

    // 핏(공과 핀이 떨어지는 곳) 바닥과 뒷벽 — 역시 두껍게
    const pitFloor = RAPIER.ColliderDesc.cuboid(HALF_WIDTH + LANE.gutterWidth, SLAB_HALF, 1.2)
      .setTranslation(0, -1.2 - SLAB_HALF, LANE.pitZ + 1.2)
      .setFriction(0.9)
      .setRestitution(0.05);
    this.world.createCollider(pitFloor, ground);

    const backWall = RAPIER.ColliderDesc.cuboid(HALF_WIDTH + LANE.gutterWidth, 1.9, 0.2)
      .setTranslation(0, 0, LANE.pitZ + 2.4)
      .setRestitution(0.1);
    this.world.createCollider(backWall, ground);

    // 마지막 안전망. 위의 벽·바닥으로 막았지만, 물리엔진에서 물체가 틈으로
    // 새는 일은 완전히 없앨 수 없다. 아래에 넓은 바닥을 하나 깔아 두면
    // 무언가 빠져나가도 끝없이 추락해 좌표가 폭주하는 일은 생기지 않는다.
    // (핀덱 아래로 떨어진 핀은 어차피 '넘어짐'으로 세므로 규칙에도 맞다.)
    const catchFloor = RAPIER.ColliderDesc.cuboid(6, 0.5, 20)
      .setTranslation(0, -3.5, LANE.pitZ / 2)
      .setFriction(0.9);
    this.world.createCollider(catchFloor, ground);
  }

  // -------------------------------------------------------------------------
  // 공
  // -------------------------------------------------------------------------

  private buildBall(): RAPIER.RigidBody {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, BALL.radius, 0)
        .setLinearDamping(BALL.linearDamping)
        .setAngularDamping(BALL.angularDamping)
        // 최대 파워에서 한 스텝에 7cm를 이동한다. 핀 두께(12cm)보다는 작지만
        // 얇은 벽과 핀 사이를 통과하는 사고를 막기 위해 CCD를 켠다.
        .setCcdEnabled(true),
    );

    const volume = (4 / 3) * Math.PI * BALL.radius ** 3;
    const desc = RAPIER.ColliderDesc.ball(BALL.radius)
      .setDensity(BALL.mass / volume)
      .setFriction(BALL.friction)
      .setRestitution(BALL.restitution)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply);
    this.world.createCollider(desc, body);

    return body;
  }

  /** 공을 파울라인의 지정 위치에 세운다 */
  placeBall(startX: number): void {
    this.ball.setTranslation({ x: startX, y: BALL.radius, z: 0 }, true);
    this.ball.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.ballLaunched = false;
  }

  /** 공을 굴린다 */
  launchBall(input: LaunchInput): void {
    this.placeBall(input.startX);
    const vx = Math.sin(input.angle) * input.speed;
    const vz = Math.cos(input.angle) * input.speed;
    this.ball.setLinvel({ x: vx, y: 0, z: vz }, true);
    // 앞으로 굴러가는 회전(X축) + 훅을 만드는 옆회전(Z축)
    this.ball.setAngvel({ x: vz / BALL.radius, y: 0, z: input.spin }, true);
    this.ballLaunched = true;
  }

  get launched(): boolean {
    return this.ballLaunched;
  }

  ballPosition(): Vec3 {
    return this.ball.translation();
  }

  /** 공이 핀덱을 지났거나 거터·핏으로 떨어졌는가 */
  ballIsOut(): boolean {
    const p = this.ball.translation();
    return p.z > LANE.pitZ || p.y < -LANE.gutterDepth - 0.02;
  }

  // -------------------------------------------------------------------------
  // 핀
  // -------------------------------------------------------------------------

  private buildPins(): void {
    // 상대 밀도를 실제 질량(1.53kg)에 맞추는 보정 계수를 먼저 구한다.
    // 이렇게 하면 config에서 density 비율만 만져 무게중심을 조절할 수 있고,
    // 총 질량은 항상 규격대로 유지된다.
    let weighted = 0;
    for (const seg of PIN.segments) {
      const h = seg.hFrac * PIN.height;
      const r = seg.radiusFrac * PIN_RADIUS;
      weighted += Math.PI * r * r * h * seg.density;
    }
    const densityScale = PIN.mass / weighted;

    for (const pin of ALL_PINS) {
      const { x, z } = pinPosition(pin);
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, 0, z)
          .setLinearDamping(0.15)
          .setAngularDamping(0.15)
          // 세게 맞은 핀은 한 스텝에 수십 cm를 날아간다. 두꺼운 바닥과
          // 함께 쓰는 이중 안전장치.
          .setCcdEnabled(true),
      );

      for (const seg of PIN.segments) {
        const h = seg.hFrac * PIN.height;
        const r = seg.radiusFrac * PIN_RADIUS;
        const desc = RAPIER.ColliderDesc.cylinder(h / 2, r)
          .setTranslation(0, seg.yFrac * PIN.height, 0)
          .setDensity(seg.density * densityScale)
          .setFriction(PIN.friction)
          .setRestitution(PIN.restitution);
        this.world.createCollider(desc, body);
      }

      this.pins.push(body);
      this.pinSpawn.push({ x, y: 0, z });
    }
  }

  /**
   * 지정한 핀만 세운다. 나머지는 물리에서 빼 둔다.
   *
   * 스페어 상황("넘어진 핀만 치우고 서 있는 핀은 그대로")과 튜토리얼
   * 드릴("7번 핀만 세우기")이 이 함수 하나를 함께 쓴다.
   */
  setPins(standing: readonly PinNumber[]): void {
    const wanted = new Set(standing);
    for (const pin of ALL_PINS) {
      const body = this.pins[pin - 1]!;
      const spawn = this.pinSpawn[pin - 1]!;

      if (wanted.has(pin)) {
        body.setEnabled(true);
        body.setTranslation(spawn, true);
        body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        body.wakeUp();
      } else {
        // 물리에서 제외한다. 씬 밖으로 치우는 것보다 확실하고, 꺼진 강체는
        // 계산 비용도 들지 않는다.
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        body.setEnabled(false);
      }
    }
  }

  /** 핀이 물리 계산에 참여하고 있는가 */
  pinEnabled(pin: PinNumber): boolean {
    return this.pins[pin - 1]!.isEnabled();
  }

  pinSpawnPosition(pin: PinNumber): Vec3 {
    return this.pinSpawn[pin - 1]!;
  }

  private static isQuiet(
    body: RAPIER.RigidBody,
    linearThreshold: number,
    angularThreshold: number,
  ): boolean {
    if (!body.isEnabled()) return true;
    const v = body.linvel();
    const w = body.angvel();
    return (
      Math.hypot(v.x, v.y, v.z) < linearThreshold &&
      Math.hypot(w.x, w.y, w.z) < angularThreshold
    );
  }

  /**
   * 결과를 바꿀 수 있는 핀이 모두 조용한가.
   *
   * 핏으로 떨어진 핀은 이미 '넘어짐'으로 확정되었고 다른 핀을 건드릴 수도
   * 없다. 그런데 옆으로 누운 핀은 핏 바닥에서 한참 굴러다닌다. 그것까지
   * 기다리면 매 투구가 하드 타임아웃(7초)까지 끌린다.
   *
   * 그래서 아직 핀덱 위에 있는 핀만 본다. 공에 같은 논리를 적용한 것이
   * ballIsOut()이다.
   */
  pinsQuiet(linearThreshold: number, angularThreshold: number): boolean {
    for (const body of this.pins) {
      if (!body.isEnabled()) continue;
      const p = body.translation();
      // 핏에 떨어졌거나 덱 아래로 내려간 핀은 결과와 무관하다
      if (p.z > LANE.pitZ || p.y < -0.05) continue;
      if (!Bodies.isQuiet(body, linearThreshold, angularThreshold)) return false;
    }
    return true;
  }

  /** 공과 핀이 모두 조용한가 (공이 레인 위에서 멈춘 경우 판정용) */
  allQuiet(linearThreshold: number, angularThreshold: number): boolean {
    if (!Bodies.isQuiet(this.ball, linearThreshold, angularThreshold)) return false;
    return this.pinsQuiet(linearThreshold, angularThreshold);
  }
}
