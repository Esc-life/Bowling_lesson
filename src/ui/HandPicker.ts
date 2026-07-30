/**
 * 첫 실행 시 "어느 손으로 던지나요?"를 묻는 화면.
 *
 * 왼손잡이 학생에게 오른손 기준 조준법을 가르치면 본인에게 맞지 않는 것을
 * 연습하게 된다. 시작할 때 한 번 물어보고 포켓·화살표·드릴 목표를 전부
 * 그 손에 맞춘다.
 *
 * 공용 PC에서 학생이 바뀔 때 진행률을 초기화하면 이 화면이 다시 나온다.
 */

import type { Handedness } from '../rules/pinLayout';

export class HandPicker {
  readonly element: HTMLElement;

  constructor(onPick: (hand: Handedness) => void) {
    this.element = document.createElement('div');
    this.element.className = 'overlay hand-picker';
    this.element.innerHTML = `
      <div class="panel">
        <h1>볼링을 시작해요</h1>
        <p class="lead">공을 어느 손으로 던지나요?</p>
        <div class="hand-choices">
          <button type="button" class="hand-choice" data-hand="left">
            <span class="hand-icon" aria-hidden="true">🤚</span>
            <span class="hand-name">왼손</span>
          </button>
          <button type="button" class="hand-choice" data-hand="right">
            <span class="hand-icon hand-icon--flip" aria-hidden="true">🤚</span>
            <span class="hand-name">오른손</span>
          </button>
        </div>
        <p class="note">나중에 설정에서 바꿀 수 있어요.</p>
      </div>
    `;

    this.element.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLElement>('.hand-choice');
      if (button === null) return;
      const hand = button.dataset['hand'];
      if (hand === 'left' || hand === 'right') onPick(hand);
    });
  }

  hide(): void {
    this.element.remove();
  }
}
