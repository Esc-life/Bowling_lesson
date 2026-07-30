/**
 * 용어 팝업.
 *
 * 레슨 본문의 밑줄 용어(.term 버튼)를 누르면 그 근처에 짧은 설명이 뜬다.
 * 컨테이너 하나에 위임(delegation)으로 붙어서, 레슨이 바뀌어도 다시
 * 연결할 필요가 없다.
 */

import { GLOSSARY } from '../tutorial/glossary';

export class GlossaryPopover {
  readonly element: HTMLElement;

  constructor(private readonly root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'glossary-pop';
    this.element.hidden = true;
    root.appendChild(this.element);

    root.addEventListener('click', (e) => {
      const term = (e.target as HTMLElement).closest<HTMLElement>('.term');
      if (term !== null) {
        this.show(term);
        e.stopPropagation();
        return;
      }
      // 팝업 자신을 누른 게 아니면 닫는다
      if (!this.element.contains(e.target as Node)) this.hide();
    });
  }

  private show(termEl: HTMLElement): void {
    const name = termEl.dataset['term'] ?? '';
    const meaning = GLOSSARY[name];
    if (meaning === undefined) return;

    this.element.innerHTML = `<b>${name}</b><span>${meaning}</span>`;
    this.element.hidden = false;

    // 용어 바로 아래, 컨테이너 밖으로 넘치지 않게
    const rootBox = this.root.getBoundingClientRect();
    const termBox = termEl.getBoundingClientRect();
    const popWidth = Math.min(280, rootBox.width - 24);
    this.element.style.width = `${popWidth}px`;

    let left = termBox.left - rootBox.left + termBox.width / 2 - popWidth / 2;
    left = Math.max(12, Math.min(left, rootBox.width - popWidth - 12));
    this.element.style.left = `${left}px`;
    this.element.style.top = `${termBox.bottom - rootBox.top + 8}px`;
  }

  hide(): void {
    this.element.hidden = true;
  }
}
