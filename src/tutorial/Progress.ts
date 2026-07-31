/**
 * 진행률 저장/복원 — 현재 플레이어의 것.
 *
 * 실제 저장은 PlayerStore가 한다. 이 모듈은 "지금 누구인지"를 아는
 * 얇은 창구다. 튜토리얼 코드가 플레이어 개념을 몰라도 되게 하려고 남긴다.
 *
 * 현재 플레이어가 없으면(플레이어 선택 화면 이전) 빈 진행률을 돌려주고
 * 저장은 조용히 버린다. 튜토리얼이 그 상태로 열릴 일은 없지만,
 * 열려도 앱이 깨지지는 않아야 한다.
 */

import { players } from '../players/PlayerStore';
import { emptyProgress, type ProgressState } from './TutorialFlow';

export const Progress = {
  load(): ProgressState {
    return players.current?.progress ?? emptyProgress();
  },

  save(state: ProgressState): void {
    const current = players.current;
    if (current === null) return;
    players.saveProgress(current.id, state);
  },

  /** 이 플레이어의 진도만 비운다. 다른 플레이어는 그대로다 */
  clear(): void {
    const current = players.current;
    if (current === null) return;
    players.saveProgress(current.id, emptyProgress());
  },
};
