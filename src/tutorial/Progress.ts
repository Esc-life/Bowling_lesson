/**
 * 진행률 저장/복원 — 현재 플레이어의 것.
 *
 * 실제 저장은 PlayerStore가 한다. 이 모듈은 "지금 누구인지"를 아는
 * 얇은 창구다. 튜토리얼 코드가 플레이어 개념을 몰라도 되게 하려고 남긴다.
 *
 * 현재 플레이어가 없으면(플레이어 선택 화면 이전) 빈 진행률을 돌려주고
 * 저장은 조용히 버린다. 튜토리얼이 그 상태로 열릴 일은 없지만,
 * 열려도 앱이 깨지지는 않아야 한다.
 *
 * 시연 모드
 *   ?lesson= / ?area= 딥링크를 누가 눌렀는지는 알 수 없다. 그런데
 *   PlayerStore는 목록의 첫 사람을 늘 현재로 잡아 두므로, 그대로 저장하면
 *   엉뚱한 학생의 진도가 링크 한 번에 바뀐다(해금까지 딸려 온다).
 *   그래서 그런 딥링크로 들어오면 저장을 통째로 막는다.
 */

import { players } from '../players/PlayerStore';
import { emptyProgress, type ProgressState } from './TutorialFlow';

/** 시연 모드에서는 어떤 쓰기도 하지 않는다 */
let demo = false;

export const Progress = {
  /** 시연 모드를 켠다. 한번 켜면 그 화면이 닫힐 때까지 저장하지 않는다 */
  enterDemoMode(): void {
    demo = true;
  },

  get isDemo(): boolean {
    return demo;
  },

  load(): ProgressState {
    return players.current?.progress ?? emptyProgress();
  },

  save(state: ProgressState): void {
    if (demo) return;
    const current = players.current;
    if (current === null) return;
    players.saveProgress(current.id, state);
  },

  /** 이 플레이어의 진도만 비운다. 다른 플레이어는 그대로다 */
  clear(): void {
    // 시연 모드에서는 누구 진도인지 모르는 채로 지우게 된다 — 막는다
    if (demo) return;
    const current = players.current;
    if (current === null) return;
    players.saveProgress(current.id, emptyProgress());
  },
};
