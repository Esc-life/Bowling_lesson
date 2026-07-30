/**
 * 점수 문항의 보기 자동 생성.
 *
 * 정답도 오답도 손으로 적지 않는다.
 *  - 정답: Scorecard로 계산한다 → 규칙 구현과 교육 내용이 어긋날 수 없고,
 *    문항을 늘릴 때 손계산이 필요 없다.
 *  - 오답: 초등학생이 실제로 하는 오해를 규칙으로 재현한다. 그래서 그 보기를
 *    고른 아이에게 "왜 틀렸는지"를 바로 짚어 줄 수 있다. 아무 숫자나
 *    넣으면 정답만 알려주고 끝나는 문제가 된다.
 */

import { PIN_COUNT, Scorecard } from '../rules/Scorecard';
import { hashString, seededRandom, shuffled } from '../util/random';
import type { Choice } from './types';

export type ScoreQuestionData = {
  /** 보기 4개 (섞인 상태) */
  choices: Choice[];
  /** 정답 값 — 화면 표시나 검증에 쓴다 */
  answer: number;
};

/** 한 프레임의 굴림 구간을 찾는다 (Scorecard의 분할과 같은 규칙) */
function frameRolls(rolls: readonly number[], frame: number): number[] {
  let i = 0;
  for (let f = 1; f < frame; f++) {
    if (rolls[i] === PIN_COUNT) i += 1;
    else i += 2;
  }
  if (frame === 10) return [...rolls.slice(i)];
  return rolls[i] === PIN_COUNT ? [rolls[i]!] : rolls.slice(i, i + 2).filter((v) => v !== undefined);
}

/** 그 프레임 시작 전까지의 누적 점수 */
function cumulativeBefore(card: Scorecard, frame: number): number {
  if (frame <= 1) return 0;
  const prev = card.frames[frame - 2]!;
  return prev.cumulative ?? 0;
}

/**
 * 흔한 오해 네 가지로 오답을 만든다.
 *
 * 1. 보너스를 빼먹고 쓰러진 핀만 센다
 * 2. 스트라이크인데 다음 '한 번'만 더한다 (스페어 계산법과 혼동)
 * 3. 프레임 점수 자리에 누적 점수를 적는다 (또는 그 반대)
 * 4. 스페어인데 다음 두 번을 더한다 (스트라이크 계산법과 혼동)
 */
function misconceptions(
  card: Scorecard,
  rolls: readonly number[],
  frame: number,
): { value: number; feedback: string }[] {
  const own = frameRolls(rolls, frame);
  const pinsOnly = own.reduce((s, v) => s + v, 0);
  const before = cumulativeBefore(card, frame);

  // 이 프레임 다음의 굴림들
  let idx = 0;
  for (let f = 1; f < frame; f++) {
    if (rolls[idx] === PIN_COUNT) idx += 1;
    else idx += 2;
  }
  const isStrike = rolls[idx] === PIN_COUNT;
  const isSpare = !isStrike && (rolls[idx] ?? 0) + (rolls[idx + 1] ?? 0) === PIN_COUNT;
  const after1 = rolls[idx + (isStrike ? 1 : 2)] ?? 0;
  const after2 = rolls[idx + (isStrike ? 2 : 3)] ?? 0;

  const out: { value: number; feedback: string }[] = [];

  out.push({
    value: before + pinsOnly,
    feedback: '보너스를 안 더했어요. 스트라이크와 스페어는 다음 공을 더해요.',
  });

  if (isStrike) {
    out.push({
      value: before + PIN_COUNT + after1,
      feedback: '그건 스페어를 계산하는 방법이에요. 스트라이크는 다음 두 번을 더해요.',
    });
  }
  if (isSpare) {
    out.push({
      value: before + PIN_COUNT + after1 + after2,
      feedback: '그건 스트라이크를 계산하는 방법이에요. 스페어는 다음 한 번만 더해요.',
    });
  }

  // 누적과 프레임 점수를 혼동한 값
  const frameScore = card.frames[frame - 1]!.frameScore ?? 0;
  out.push({
    value: frameScore,
    feedback: '그건 이 프레임에서 얻은 점수예요. 점수판에는 앞 프레임까지 합한 수를 써요.',
  });

  // 보너스를 한 번 더 더해 버린 값
  out.push({
    value: before + pinsOnly + after1 + after2,
    feedback: '너무 많이 더했어요. 더하는 공의 개수를 다시 세어 볼까요?',
  });

  return out;
}

/**
 * 4지선다 보기를 만든다.
 *
 * 섞는 순서는 시드를 고정한다. 교사가 수업 전에 확인한 화면과 학생이 보는
 * 화면이 같아야 하기 때문이다. 매번 순서가 바뀌면 미리 볼 수 없다.
 */
export function buildScoreChoices(
  rolls: readonly number[],
  askFrame: number,
  seedKey: string,
): ScoreQuestionData {
  const card = Scorecard.fromRolls(rolls);
  const view = card.frames[askFrame - 1];
  if (view === undefined) {
    throw new Error(`프레임 번호가 잘못되었습니다: ${askFrame}`);
  }
  if (view.cumulative === null) {
    throw new Error(
      `${askFrame}프레임의 누적 점수가 아직 확정되지 않는 굴림입니다. 문항으로 쓸 수 없습니다.`,
    );
  }

  const answer = view.cumulative;
  const seen = new Set<number>([answer]);
  const wrong: Choice[] = [];

  for (const m of misconceptions(card, rolls, askFrame)) {
    if (wrong.length >= 3) break;
    if (m.value < 0 || seen.has(m.value)) continue;
    seen.add(m.value);
    wrong.push({ text: String(m.value), correct: false, feedback: m.feedback });
  }

  // 오해 값들이 겹쳐 3개를 못 채우면 가까운 수로 메운다.
  // (교육 효과는 없지만 보기 개수가 들쭉날쭉한 것보다는 낫다)
  for (let delta = 1; wrong.length < 3; delta++) {
    for (const candidate of [answer + delta, answer - delta]) {
      if (wrong.length >= 3) break;
      if (candidate < 0 || seen.has(candidate)) continue;
      seen.add(candidate);
      wrong.push({ text: String(candidate), correct: false });
    }
  }

  const choices = shuffled(
    [{ text: String(answer), correct: true }, ...wrong],
    seededRandom(hashString(seedKey)),
  );

  return { choices, answer };
}
