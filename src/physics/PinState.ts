/**
 * 핀 넘어짐 판정과 정지(settle) 감지.
 *
 * 판정 시점이 중요하다. 공이 핀에 닿은 직후에 세면 아직 흔들리는 핀을
 * 넘어진 것으로 잘못 세거나 그 반대가 된다. 그래서 "모든 것이 멈춘 뒤
 * 딱 한 번" 센다.
 *
 * 멈춘 것을 어떻게 아는가:
 *   (공이 핀덱을 지났거나 거터·핏으로 떨어졌다)
 *   AND (공과 핀 전부가 0.5초 연속으로 조용하다)
 * 둘 중 하나라도 영원히 성립하지 않는 경우가 있으므로 7초 하드 타임아웃을 둔다.
 */

import { PIN, SETTLE } from '../config';
import { ALL_PINS, type PinNumber } from '../rules/pinLayout';
import type { Bodies } from './Bodies';

const FALLEN_TILT_COS = Math.cos((PIN.fallenTiltDeg * Math.PI) / 180);

/**
 * 핀이 넘어졌는가.
 *
 * 세 가지 중 하나라도 해당하면 넘어진 것으로 본다.
 *  1. 기울기가 45도를 넘었다
 *  2. 제자리에서 10cm 이상 밀려났다 (기울지 않고 밀려나기만 한 경우)
 *  3. 핀덱 아래로 떨어졌다
 */
export function isPinFallen(bodies: Bodies, pin: PinNumber): boolean {
  const body = bodies.pins[pin - 1]!;
  if (!body.isEnabled()) return true;

  const p = body.translation();
  if (p.y < -0.05) return true;

  const spawn = bodies.pinSpawnPosition(pin);
  const moved = Math.hypot(p.x - spawn.x, p.z - spawn.z);
  if (moved > PIN.fallenMoveDistance) return true;

  // 핀의 로컬 +Y축을 월드로 회전시켜 월드 +Y와의 내적을 본다.
  // 쿼터니언 (x,y,z,w)로 (0,1,0)을 회전한 결과의 y 성분:
  //   1 - 2(x² + z²)
  const q = body.rotation();
  const upDotWorldUp = 1 - 2 * (q.x * q.x + q.z * q.z);
  return upDotWorldUp < FALLEN_TILT_COS;
}

/** 아직 서 있는 핀 번호 */
export function standingPins(bodies: Bodies, wereStanding: readonly PinNumber[]): PinNumber[] {
  return wereStanding.filter((pin) => !isPinFallen(bodies, pin));
}

/** 지금 물리적으로 서 있는 모든 핀 (디버그 표시용) */
export function allStandingPins(bodies: Bodies): PinNumber[] {
  return ALL_PINS.filter((pin) => bodies.pinEnabled(pin) && !isPinFallen(bodies, pin));
}

export type SettleStatus = 'rolling' | 'waiting' | 'settled';

/**
 * 공을 던진 뒤 결과가 확정될 때까지 지켜본다.
 *
 * 게임 루프에서 매 프레임 update()를 호출하고, 'settled'가 나오면
 * 그때 딱 한 번 핀을 센다.
 */
export class SettleWatcher {
  private quietTime = 0;
  private elapsed = 0;
  private ballWasOut = false;
  private done = false;

  reset(): void {
    this.quietTime = 0;
    this.elapsed = 0;
    this.ballWasOut = false;
    this.done = false;
  }

  /** @param dt 물리 시간 기준 경과 (초). 슬로모션이면 그만큼 느리게 흐른다 */
  update(bodies: Bodies, dt: number): SettleStatus {
    if (this.done) return 'settled';

    this.elapsed += dt;
    if (bodies.ballIsOut()) this.ballWasOut = true;

    if (this.elapsed >= SETTLE.hardTimeout) {
      this.done = true;
      return 'settled';
    }

    if (!this.ballWasOut) {
      this.quietTime = 0;
      // 공이 아직 레인 위에 있는데 모두 멈췄다면 (예: 파워가 너무 약해 공이
      // 굴러가다 멈췄다) 그것도 결과로 인정해야 한다.
      if (bodies.allQuiet(SETTLE.linearVelocityThreshold, SETTLE.angularVelocityThreshold)) {
        this.done = true;
        return 'settled';
      }
      return 'rolling';
    }

    // 공은 이미 핏에 떨어졌다. 핏 바닥에서 공이 굴러다니는 것은 결과와
    // 무관하므로 핀만 본다. 공까지 기다리면 매 투구가 7초로 늘어난다.
    if (bodies.pinsQuiet(SETTLE.linearVelocityThreshold, SETTLE.angularVelocityThreshold)) {
      this.quietTime += dt;
      if (this.quietTime >= SETTLE.quietDuration) {
        this.done = true;
        return 'settled';
      }
      return 'waiting';
    }

    this.quietTime = 0;
    return 'waiting';
  }

  get secondsElapsed(): number {
    return this.elapsed;
  }
}
