/**
 * 자유 연습·대전이 열렸는지 판정한다.
 *
 * 순수 함수만 둔다. 화면은 "왜 잠겼는지"를 그대로 보여 주기만 하면 된다.
 * 잠긴 버튼을 감추지 않고 이유와 함께 보여 주는 것이 이 앱의 방침이다 —
 * 목표가 보여야 배울 마음이 생기고, 감추면 있는 줄도 모른다.
 */

import { allLessons } from '../tutorial/curriculum';
import { TutorialFlow } from '../tutorial/TutorialFlow';
import { MAX_PLAYERS } from '../rules/MatchMachine';
import type { Player } from './types';

/** 한 레인에 설 수 있는 최소 인원 */
export const MIN_MATCH_PLAYERS = 2;

export type LessonCount = { done: number; total: number };

export function lessonCount(player: Player): LessonCount {
  // TutorialFlow가 커리큘럼에 없는 레슨 ID를 걸러 준다
  const flow = new TutorialFlow(player.progress);
  const total = allLessons().length;
  const done = allLessons().filter((l) => flow.isCompleted(l.lessonId)).length;
  return { done, total };
}

export function isGraduated(player: Player): boolean {
  // 마스터(교사) 계정은 실제 진행률과 무관하게 항상 다 배운 것으로 친다 —
  // 수업 시간에 바로 자유 연습·대전 예시를 보여줄 수 있어야 한다.
  if (player.isMaster === true) return true;
  const { done, total } = lessonCount(player);
  return done >= total;
}

/** 자유 연습이 잠긴 이유. 열려 있으면 null */
export function practiceLockReason(player: Player): string | null {
  if (isGraduated(player)) return null;
  const { done, total } = lessonCount(player);
  return `${total}개 중 ${done}개를 배웠어요. 다 배우면 열려요.`;
}

/** 대전이 잠긴 이유. 열려 있으면 null */
export function matchLockReason(participants: readonly Player[]): string | null {
  if (participants.length < MIN_MATCH_PLAYERS) {
    return `대전은 ${MIN_MATCH_PLAYERS}명부터 할 수 있어요.`;
  }
  if (participants.length > MAX_PLAYERS) {
    return `대전은 ${MAX_PLAYERS}명까지 할 수 있어요.`;
  }
  const notYet = participants.filter((p) => !isGraduated(p));
  if (notYet.length > 0) {
    const names = notYet.map((p) => p.name).join(', ');
    return `${names}는 아직 다 배우지 않았어요.`;
  }
  return null;
}
