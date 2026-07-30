/**
 * 튜토리얼 콘텐츠. 5개 영역 18개 레슨.
 *
 * ── 초등 고학년(10~12세)용 글쓰기 규칙 ──────────────────────────────
 *  · 한 문장 = 한 줄, 25자 안쪽
 *  · 레슨 본문 150자 이내, 불릿 3개 이내
 *  · 어려운 한자어 금지 (전도→넘어짐, 기립→서 있는, 정렬→나란히)
 *  · 큰 숫자는 비유를 붙인다 (config.ts의 ANALOGIES)
 *  · 영문 병기는 하지 않는다 — 초등에게는 방해가 된다
 *  · 어려운 낱말은 본문에 두지 않고 용어집(glossary.ts)으로 뺀다
 *
 * 이 규칙은 TutorialFlow.test.ts의 정합성 테스트가 기계로 검사한다.
 * 문서에만 적어 두면 아홉 번째 레슨쯤에서 무너진다.
 * ────────────────────────────────────────────────────────────────
 *
 * 드릴의 핀 번호는 **오른손 기준**으로 쓴다. 왼손 학생에게는
 * pinLayout.forHand()가 자동으로 좌우를 뒤집어 준다. 콘텐츠를 두 벌
 * 쓰지 않기 위한 장치다.
 */

import { ANALOGIES } from '../config';
import type { Area } from './types';

/** 1~9프레임을 1핀씩 채운 굴림 (프레임당 2점, 합 18점) — 10프레임 문항용 */
function nineOpenFrames(): number[] {
  return new Array<number>(18).fill(1);
}

export const CURRICULUM: Area[] = [
  // ═══════════════════════════════════════════════════ 영역 A
  {
    id: 'A',
    title: '볼링장 둘러보기',
    summary: '레인이 어떻게 생겼는지, 핀은 어떻게 놓이는지 알아봐요.',
    lessons: [
      {
        id: 'A1',
        title: '레인은 어떻게 생겼나요?',
        estimatedMinutes: 2,
        body: [
          { kind: 'text', text: `공이 굴러가는 길을 레인이라고 해요.` },
          { kind: 'text', text: `길이는 ${ANALOGIES.laneLength}예요.` },
          {
            kind: 'bullets',
            items: [
              '파울선: 넘으면 안 되는 선이에요.',
              '거터: 양옆에 파인 홈이에요.',
              '핀덱: 핀이 서 있는 곳이에요.',
            ],
          },
        ],
        diagram: { kind: 'laneTop', showBoards: true },
      },
      {
        id: 'A2',
        title: '핀에는 번호가 있어요',
        estimatedMinutes: 3,
        body: [
          { kind: 'text', text: '핀 10개는 삼각형으로 놓여요.' },
          { kind: 'text', text: '맨 앞이 1번, 맨 뒷줄이 7번부터 10번이에요.' },
          { kind: 'callout', text: '1번 핀 옆의 좁은 틈을 포켓이라고 불러요.' },
        ],
        diagram: { kind: 'pinDeck', showNumbers: true, showPocket: true },
        check: {
          kind: 'quiz',
          passRatio: 0.6,
          questions: [
            {
              kind: 'choice',
              prompt: '맨 앞에 혼자 서 있는 핀은 몇 번일까요?',
              diagram: { kind: 'pinDeck', showNumbers: true },
              choices: [
                { text: '1번', correct: true },
                { text: '5번', correct: false, feedback: '5번은 가운데에 있어요.' },
                { text: '7번', correct: false, feedback: '7번은 맨 뒷줄 왼쪽 끝이에요.' },
                { text: '10번', correct: false, feedback: '10번은 맨 뒷줄 오른쪽 끝이에요.' },
              ],
            },
            {
              kind: 'choice',
              prompt: '맨 뒷줄에는 핀이 몇 개 있을까요?',
              diagram: { kind: 'pinDeck', showNumbers: true },
              choices: [
                { text: '4개', correct: true },
                { text: '2개', correct: false, feedback: '2개는 앞에서 둘째 줄이에요.' },
                { text: '3개', correct: false, feedback: '3개는 앞에서 셋째 줄이에요.' },
                { text: '5개', correct: false, feedback: '한 줄에 5개가 놓이는 줄은 없어요.' },
              ],
            },
            {
              kind: 'choice',
              prompt: '포켓은 어디일까요?',
              diagram: { kind: 'pinDeck', showPocket: true, showNumbers: true },
              choices: [
                { text: '1번 핀 바로 옆의 틈', correct: true },
                { text: '레인 한가운데', correct: false, feedback: '가운데로 곧게 가면 핀이 많이 남아요.' },
                { text: '거터 쪽', correct: false, feedback: '거터로 가면 핀을 못 맞혀요.' },
                { text: '맨 뒷줄 가운데', correct: false, feedback: '뒷줄은 앞 핀에 가려서 직접 맞히기 어려워요.' },
              ],
            },
          ],
        },
      },
      {
        id: 'A3',
        title: '공을 고르고 잡아요',
        estimatedMinutes: 2,
        body: [
          { kind: 'text', text: `공은 ${ANALOGIES.ballSize}` },
          { kind: 'text', text: '몸무게의 열 분의 일쯤이 알맞아요.' },
          { kind: 'bullets', items: ['구멍 세 개에 손가락을 넣어요.', '너무 무거우면 팔이 아파요.'] },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════ 영역 B
  {
    id: 'B',
    title: '규칙과 점수',
    summary: '점수를 어떻게 세는지 배워요. 볼링에서 가장 재미있는 부분이에요.',
    recommendedAfter: ['A'],
    lessons: [
      {
        id: 'B1',
        title: '열 번의 프레임',
        estimatedMinutes: 3,
        body: [
          { kind: 'text', text: '한 게임은 열 번으로 나뉘어요.' },
          { kind: 'text', text: '한 번을 프레임이라고 불러요.' },
          { kind: 'text', text: '프레임마다 공을 두 번 던질 수 있어요.' },
        ],
        diagram: { kind: 'scorecard', rolls: [3, 4, 5, 2], highlightFrame: 1 },
        check: {
          kind: 'quiz',
          passRatio: 0.5,
          questions: [
            {
              kind: 'choice',
              prompt: '한 게임은 몇 프레임일까요?',
              choices: [
                { text: '10프레임', correct: true },
                { text: '5프레임', correct: false, feedback: '조금 더 많아요.' },
                { text: '9프레임', correct: false, feedback: '하나 더 있어요!' },
                { text: '12프레임', correct: false, feedback: '그보다 적어요.' },
              ],
            },
            {
              kind: 'choice',
              prompt: '두 번 던져도 핀이 남으면 어떻게 될까요?',
              choices: [
                { text: '쓰러뜨린 핀 수만 점수가 돼요.', correct: true },
                { text: '한 번 더 던져요.', correct: false, feedback: '10프레임만 세 번 던질 수 있어요.' },
                { text: '0점이 돼요.', correct: false, feedback: '쓰러뜨린 만큼은 점수가 돼요.' },
                { text: '다시 처음부터 던져요.', correct: false, feedback: '다음 프레임으로 넘어가요.' },
              ],
            },
          ],
        },
      },
      {
        id: 'B2',
        title: '스페어: 두 번에 다 쓰러뜨리기',
        estimatedMinutes: 4,
        body: [
          { kind: 'text', text: '두 번 던져 핀 10개를 다 쓰러뜨리면 스페어예요.' },
          { kind: 'callout', text: '스페어는 10점 + 다음 공 한 번을 더해요.' },
        ],
        diagram: { kind: 'scorecard', rolls: [6, 4, 5, 2], highlightFrame: 1 },
        check: {
          kind: 'quiz',
          passRatio: 0.6,
          questions: [
            { kind: 'scoreChoice', prompt: '1프레임 점수는 몇 점일까요?', rolls: [6, 4, 5, 2], askFrame: 1 },
            { kind: 'scoreChoice', prompt: '1프레임 점수는 몇 점일까요?', rolls: [5, 5, 4, 4], askFrame: 1 },
            { kind: 'scoreChoice', prompt: '1프레임 점수는 몇 점일까요?', rolls: [3, 7, 10, 2, 3], askFrame: 1 },
          ],
        },
      },
      {
        id: 'B3',
        title: '스트라이크: 한 번에 다 쓰러뜨리기',
        estimatedMinutes: 4,
        body: [
          { kind: 'text', text: '첫 공에 핀 10개를 다 쓰러뜨리면 스트라이크예요.' },
          { kind: 'callout', text: '스트라이크는 10점 + 다음 공 두 번을 더해요.' },
        ],
        diagram: { kind: 'scorecard', rolls: [10, 4, 3, 1, 1], highlightFrame: 1 },
        check: {
          kind: 'quiz',
          passRatio: 0.6,
          questions: [
            { kind: 'scoreChoice', prompt: '1프레임 점수는 몇 점일까요?', rolls: [10, 4, 3, 1, 1], askFrame: 1 },
            { kind: 'scoreChoice', prompt: '1프레임 점수는 몇 점일까요?', rolls: [10, 5, 5, 2, 2], askFrame: 1 },
            { kind: 'scoreChoice', prompt: '1프레임 점수는 몇 점일까요?', rolls: [10, 10, 3, 4], askFrame: 1 },
          ],
        },
      },
      {
        id: 'B4',
        title: '마지막 프레임과 300점',
        estimatedMinutes: 3,
        body: [
          { kind: 'text', text: '10프레임은 특별해요.' },
          { kind: 'text', text: '스트라이크나 스페어를 하면 한 번 더 던져요.' },
          { kind: 'callout', text: '열두 번 모두 스트라이크면 300점! 만점이에요.' },
        ],
        diagram: { kind: 'scorecard', rolls: [...nineOpenFrames(), 10, 10, 10], highlightFrame: 10 },
        check: {
          kind: 'quiz',
          passRatio: 0.5,
          questions: [
            {
              kind: 'scoreChoice',
              prompt: '10프레임까지 다 더하면 몇 점일까요?',
              rolls: [...nineOpenFrames(), 10, 10, 10],
              askFrame: 10,
            },
            {
              kind: 'scoreChoice',
              prompt: '10프레임까지 다 더하면 몇 점일까요?',
              rolls: [...nineOpenFrames(), 5, 5, 7],
              askFrame: 10,
            },
          ],
        },
      },
      {
        id: 'B5',
        title: '이러면 점수가 없어요',
        estimatedMinutes: 2,
        body: [
          { kind: 'text', text: '파울선을 밟으면 그 공은 0점이에요.' },
          { kind: 'text', text: '공이 거터로 빠져도 0점이에요.' },
        ],
        check: {
          kind: 'quiz',
          passRatio: 0.5,
          questions: [
            {
              kind: 'choice',
              prompt: '파울선을 밟고 던져서 핀 8개를 쓰러뜨렸어요. 몇 점일까요?',
              choices: [
                { text: '0점', correct: true },
                { text: '8점', correct: false, feedback: '선을 밟으면 쓰러뜨려도 점수가 없어요.' },
                { text: '4점', correct: false, feedback: '반으로 줄지는 않아요.' },
                { text: '10점', correct: false, feedback: '오히려 점수를 못 받아요.' },
              ],
            },
            {
              kind: 'choice',
              prompt: '공이 거터로 빠지면 어떻게 될까요?',
              choices: [
                { text: '핀을 못 맞혀서 0개예요.', correct: true },
                { text: '다시 던져요.', correct: false, feedback: '그 공은 그대로 세어요.' },
                { text: '점수가 깎여요.', correct: false, feedback: '깎이지는 않아요. 0개일 뿐이에요.' },
                { text: '스페어가 돼요.', correct: false, feedback: '핀을 다 쓰러뜨려야 스페어예요.' },
              ],
            },
          ],
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════ 영역 C
  {
    id: 'C',
    title: '자세와 던지는 방법',
    summary: '진짜 볼링장에서 어떻게 던지는지 알아봐요.',
    lessons: [
      {
        id: 'C1',
        title: '던지기 전 준비 자세',
        estimatedMinutes: 3,
        body: [
          { kind: 'realWorldNotice' },
          { kind: 'text', text: '공을 가슴 앞에 두고 서요.' },
          { kind: 'bullets', items: ['발끝은 앞을 봐요.', '어깨는 나란히 펴요.', '핀이 아니라 화살표를 봐요.'] },
        ],
      },
      {
        id: 'C2',
        title: '네 걸음으로 걸어 나가요',
        estimatedMinutes: 4,
        body: [
          { kind: 'realWorldNotice' },
          { kind: 'text', text: '네 걸음을 걷는 동안 팔이 한 바퀴 돌아요.' },
          { kind: 'bullets', items: ['첫 걸음에 공을 앞으로 밀어요.', '두세 걸음에 팔이 뒤로 가요.', '네 걸음에 공을 놓아요.'] },
        ],
        diagram: { kind: 'approach' },
        check: { kind: 'observe', times: 1, what: 'approach' },
      },
      {
        id: 'C3',
        title: '공을 놓는 순간',
        estimatedMinutes: 2,
        body: [
          { kind: 'realWorldNotice' },
          { kind: 'text', text: '공은 던지지 않고 굴려요.' },
          { kind: 'bullets', items: ['손목을 꺾지 않아요.', '놓은 뒤에 팔을 앞으로 쭉 뻗어요.'] },
        ],
      },
      {
        id: 'C4',
        title: '자주 하는 실수',
        estimatedMinutes: 3,
        body: [
          { kind: 'realWorldNotice' },
          { kind: 'text', text: '누구나 하는 실수예요. 알면 고칠 수 있어요.' },
          { kind: 'bullets', items: ['공이 무거워서 팔이 흔들려요.', '공을 너무 빨리 놓아요.', '핀만 보고 걸어요.'] },
        ],
        check: {
          kind: 'quiz',
          passRatio: 0.5,
          questions: [
            {
              kind: 'choice',
              prompt: '공을 던질 때 어디를 보는 게 좋을까요?',
              choices: [
                { text: '바닥의 화살표', correct: true },
                { text: '멀리 있는 핀', correct: false, feedback: '핀은 너무 멀어서 맞추기 어려워요.' },
                { text: '내 발', correct: false, feedback: '발을 보면 몸이 굽어요.' },
                { text: '천장', correct: false, feedback: '앞을 봐야 해요.' },
              ],
            },
            {
              kind: 'choice',
              prompt: '공이 너무 무거우면 어떻게 될까요?',
              choices: [
                { text: '팔이 흔들려서 엉뚱한 곳으로 가요.', correct: true },
                { text: '핀이 더 많이 쓰러져요.', correct: false, feedback: '무겁기만 해도 잘 맞지 않아요.' },
                { text: '공이 더 빨리 가요.', correct: false, feedback: '오히려 팔이 힘들어요.' },
                { text: '아무 상관없어요.', correct: false, feedback: '내 몸에 맞는 무게가 중요해요.' },
              ],
            },
          ],
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════ 영역 D
  {
    id: 'D',
    title: '조준하고 맞히기',
    summary: '어디를 보고 던지면 잘 맞는지 직접 해 봐요.',
    recommendedAfter: ['A'],
    lessons: [
      {
        id: 'D1',
        title: '화살표를 보고 조준해요',
        estimatedMinutes: 3,
        body: [
          { kind: 'text', text: '바닥에 화살표가 일곱 개 있어요.' },
          { kind: 'text', text: '멀리 있는 핀보다 가까운 화살표가 맞히기 쉬워요.' },
          { kind: 'callout', text: '주황색 화살표를 지나가게 굴려 보세요.' },
        ],
        diagram: { kind: 'laneTop', showArrows: true, showBoards: true },
        check: {
          kind: 'drill',
          setup: { standingPins: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], hint: '주황색 화살표 위를 지나가게 던져요.' },
          goal: { kind: 'pocketHit', times: 1 },
          attempts: 5,
          assist: true,
        },
      },
      {
        id: 'D2',
        title: '포켓을 맞히면 잘 쓰러져요',
        estimatedMinutes: 4,
        body: [
          { kind: 'text', text: '1번 핀만 정면으로 맞히면 핀이 많이 남아요.' },
          { kind: 'text', text: '포켓으로 들어가면 핀이 서로 부딪쳐 잘 넘어져요.' },
        ],
        diagram: { kind: 'pinDeck', showPocket: true, highlight: [1, 3] },
        check: {
          kind: 'drill',
          setup: { standingPins: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], hint: '포켓을 노려요!' },
          goal: { kind: 'strike', times: 1 },
          attempts: 8,
          assist: true,
        },
      },
      {
        id: 'D3',
        title: '공은 왜 휘나요?',
        estimatedMinutes: 3,
        body: [
          { kind: 'text', text: '레인 앞쪽에는 기름이 발려 있어요.' },
          { kind: 'text', text: '기름 위에서는 미끄러지기만 해요.' },
          { kind: 'callout', text: '뒤쪽 마른 곳에 닿으면 공이 확 휘어요.' },
        ],
        diagram: { kind: 'laneTop', showOil: true, showArrows: true },
        check: { kind: 'observe', times: 3, what: 'trajectory' },
      },
      {
        id: 'D4',
        title: '남은 핀 처리하기',
        estimatedMinutes: 3,
        body: [
          { kind: 'text', text: '핀이 한쪽에만 남았어요.' },
          { kind: 'text', text: '남은 핀 쪽으로 조금 옮겨 서 보세요.' },
          { kind: 'callout', text: '서는 자리를 바꾸면 공이 가는 길도 바뀌어요.' },
        ],
        diagram: { kind: 'pinDeck', highlight: [7] },
        check: {
          kind: 'drill',
          // 왼손이면 핀이 미러링되므로 힌트에 왼쪽/오른쪽을 쓰면 안 된다
          setup: { standingPins: [7], hint: '끝에 있는 핀이에요. 핀이 있는 쪽으로 조금 옮겨 서 볼까요?' },
          goal: { kind: 'knockAll' },
          attempts: 6,
          assist: true,
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════ 영역 E
  {
    id: 'E',
    title: '실제로 해 보기',
    summary: '배운 걸 모아서 한 게임을 끝까지 던져 봐요.',
    recommendedAfter: ['B', 'D'],
    lessons: [
      {
        id: 'E1',
        title: '도전: 포켓 세 번 맞히기',
        estimatedMinutes: 4,
        body: [
          { kind: 'text', text: '이제 포켓을 노려 볼까요?' },
          { kind: 'text', text: '세 번 성공하면 통과예요.' },
        ],
        check: {
          kind: 'drill',
          setup: { standingPins: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
          goal: { kind: 'pocketHit', times: 3 },
          attempts: 12,
          assist: true,
        },
      },
      {
        id: 'E2',
        title: '10프레임 끝까지 던지기',
        estimatedMinutes: 6,
        body: [
          { kind: 'text', text: '한 게임을 끝까지 던져 봐요.' },
          { kind: 'text', text: '40점을 넘기면 아주 잘한 거예요!' },
        ],
        check: {
          kind: 'drill',
          setup: { standingPins: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
          goal: { kind: 'minScore', score: 40 },
          attempts: 30,
          assist: true,
        },
      },
    ],
  },
];

/** 모든 레슨을 순서대로 (진행률 계산용) */
export function allLessons(): { areaId: Area['id']; lessonId: string }[] {
  return CURRICULUM.flatMap((area) =>
    area.lessons.map((lesson) => ({ areaId: area.id, lessonId: lesson.id })),
  );
}

export function findLesson(lessonId: string): { area: Area; lessonIndex: number } | null {
  for (const area of CURRICULUM) {
    const lessonIndex = area.lessons.findIndex((l) => l.id === lessonId);
    if (lessonIndex >= 0) return { area, lessonIndex };
  }
  return null;
}

export function findArea(areaId: string): Area | null {
  return CURRICULUM.find((a) => a.id === areaId) ?? null;
}
