/**
 * Rapier 물리 세계와 고정 timestep 루프.
 *
 * 왜 1/120초인가: 핀은 얇고 길며(지름 12cm, 높이 38cm) 공은 18m를
 * 8m/s로 달린다. 1/60초에서는 한 스텝에 13cm를 이동하므로 핀을 통과하거나
 * 핀 더미가 불안정해진다.
 *
 * 슬로모션은 timestep을 줄이지 않고 "쌓는 시간"을 줄여서 구현한다.
 * timestep을 건드리면 물리 결과 자체가 달라져서, 수업에서 느리게 보여준
 * 궤적과 실제 속도의 궤적이 달라진다.
 */

import RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS } from '../config';

let rapierReady: Promise<void> | null = null;

/** Rapier의 WASM 모듈을 한 번만 초기화한다 */
export function initRapier(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

export class PhysicsWorld {
  readonly world: RAPIER.World;
  private accumulator = 0;
  /** 렌더 보간용: 마지막 스텝 이후 남은 시간의 비율 (0~1) */
  private _alpha = 0;
  private _stepsLastFrame = 0;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 });
    this.world.timestep = PHYSICS.timestep;
  }

  get alpha(): number {
    return this._alpha;
  }

  get stepsLastFrame(): number {
    return this._stepsLastFrame;
  }

  /**
   * 실제 경과 시간을 넣으면 필요한 만큼 고정 스텝을 돌린다.
   *
   * @param realDt   실제 경과 시간 (초)
   * @param timeScale 1 = 정상 속도, 1/4 = 슬로모션
   * @returns 이번에 실행한 스텝 수
   */
  advance(realDt: number, timeScale = 1): number {
    // 탭 전환 후 복귀하면 realDt가 수 초로 튄다. 그대로 쌓으면 수백 스텝을
    // 한 프레임에 돌리려 하다가 브라우저가 멈춘다.
    const clamped = Math.min(realDt, PHYSICS.maxStepsPerFrame * PHYSICS.timestep);
    this.accumulator += clamped * timeScale;

    let steps = 0;
    while (this.accumulator >= PHYSICS.timestep && steps < PHYSICS.maxStepsPerFrame) {
      this.world.step();
      this.accumulator -= PHYSICS.timestep;
      steps++;
    }

    // 상한에 걸렸으면 남은 시간은 버린다 (계속 쌓이면 영구히 뒤처진다)
    if (steps >= PHYSICS.maxStepsPerFrame) this.accumulator = 0;

    this._alpha = this.accumulator / PHYSICS.timestep;
    this._stepsLastFrame = steps;
    return steps;
  }

  /** 정지 상태에서 다시 시작할 때 누적 시간을 비운다 */
  resetAccumulator(): void {
    this.accumulator = 0;
    this._alpha = 0;
  }

  dispose(): void {
    this.world.free();
  }
}

export { RAPIER };
