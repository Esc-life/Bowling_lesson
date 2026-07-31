/**
 * 용어집.
 *
 * 어려운 낱말을 본문에서 풀어 쓰면 문장이 길어져 150자 제한에 걸린다.
 * 대신 본문의 용어에 밑줄을 긋고, 누르면 짧은 설명 팝업을 띄운다.
 * 별도의 용어 암기 레슨은 만들지 않는다 — 필요한 순간에 보는 게 낫다.
 */

import { escapeHtml } from '../util/html';

export const GLOSSARY: Record<string, string> = {
  레인: '공이 굴러가는 긴 나무 길이에요.',
  파울선: '넘으면 안 되는 선이에요. 밟으면 그 공은 0점!',
  거터: '레인 양옆에 파인 홈이에요. 빠지면 핀을 못 맞혀요.',
  핀덱: '핀 10개가 서 있는 곳이에요. 레인 맨 끝에 있어요.',
  포켓: '1번 핀 바로 옆의 좁은 틈이에요. 여기로 들어가면 스트라이크가 잘 나와요.',
  프레임: '한 게임을 열 번으로 나눈 것 중 하나예요. 프레임마다 두 번 던져요.',
  스페어: '두 번 던져서 핀 10개를 다 쓰러뜨린 거예요. 다음 공 한 번을 더해요.',
  스트라이크: '첫 공에 핀 10개를 다 쓰러뜨린 거예요. 다음 공 두 번을 더해요.',
  화살표: '레인 바닥에 그려진 조준용 표시예요. 핀보다 가까워서 맞히기 쉬워요.',
};

/**
 * 본문 텍스트에서 용어집에 있는 낱말을 찾아 밑줄 링크로 바꾼다.
 *
 * 원문에서 위치를 먼저 다 찾은 뒤 HTML을 조립한다. 치환을 반복하면
 * 이미 만들어진 태그 속 문자열을 다시 치환하는 사고가 난다.
 * 용어마다 첫 등장 한 번만 링크한다 — 매번 밑줄이면 오히려 어지럽다.
 */
export function linkTerms(text: string): string {
  type Hit = { start: number; end: number; term: string };
  const hits: Hit[] = [];

  for (const term of Object.keys(GLOSSARY)) {
    const start = text.indexOf(term);
    if (start < 0) continue;
    const end = start + term.length;
    // 이미 찾은 다른 용어와 겹치면 건너뛴다
    if (hits.some((h) => start < h.end && end > h.start)) continue;
    hits.push({ start, end, term });
  }

  hits.sort((a, b) => a.start - b.start);

  let out = '';
  let cursor = 0;
  for (const hit of hits) {
    out += escapeHtml(text.slice(cursor, hit.start));
    out += `<button type="button" class="term" data-term="${escapeHtml(hit.term)}">${escapeHtml(hit.term)}</button>`;
    cursor = hit.end;
  }
  out += escapeHtml(text.slice(cursor));
  return out;
}
