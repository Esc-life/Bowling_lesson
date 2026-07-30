/**
 * 모든 물리·게임플레이 상수의 단일 출처.
 *
 * 실제 볼링 규격을 미터 단위로 그대로 쓴다. 그래야 물리 튜닝이
 * "그럴듯한 값 찾기"가 아니라 "현실과 비교하기"가 되고,
 * 튜토리얼이 인용하는 수치와 게임 물리가 어긋나지 않는다.
 *
 * 좌표계: +Z = 레인 진행 방향, +Y = 위, X = 좌우(레인 중앙이 0)
 */

/** 레인 치수 (m) */
export const LANE = {
  /** 파울라인 → 1번 핀 중심. 60 ft */
  headPinZ: 18.29,
  /** 레인 폭. 41.5 in = 나무판(보드) 39장 */
  width: 1.0566,
  /** 보드 한 장의 폭 */
  boardWidth: 1.0566 / 39,
  /** 거터(양옆 홈) 한쪽 폭 */
  gutterWidth: 0.24,
  /** 거터 바닥 깊이 */
  gutterDepth: 0.06,
  /** 어프로치(공을 들고 걸어오는 곳) 길이. 실제 15 ft */
  approachLength: 4.57,
  /** 핀덱 뒤쪽 끝 = 공과 핀이 떨어지는 핏의 시작 */
  pitZ: 19.6,
  /** 레인 표면 두께(시각용) */
  thickness: 0.08,
} as const;

/**
 * 오일 패턴: 공이 왜 휘는지의 원인. 앞은 미끄럽고 뒤는 마르다.
 *
 * 두 값의 비율이 훅의 "모양"을 정한다. 실측으로 정한 값이다:
 *  - 0.04 / 0.20 → 휘어짐의 71%가 오일 구간에서 일어난다 (현실과 반대,
 *    레슨 D3에서 "뒤쪽 마른 곳에서 휜다"고 가르치는데 화면은 다르게 보인다)
 *  - 0.008 / 0.50 → 82%가 드라이 구간에서 일어난다. 앞에서 9cm 미끄러지다
 *    뒤에서 43cm 확 휘는 실제 볼링의 모양이 나온다.
 */
export const OIL = {
  /** 오일이 발린 구간의 끝 Z. 실제 패턴은 보통 40 ft 전후 */
  endZ: 12.2,
  /** 오일 구간 마찰 — 공이 옆회전을 잃지 않고 미끄러진다 */
  slickFriction: 0.008,
  /** 드라이 구간 마찰 — 옆회전이 접지력으로 바뀌며 확 휘어진다 */
  dryFriction: 0.5,
} as const;

/** 공 (규정 최대 지름 21.83 cm, 최대 7.26 kg = 16 lb) */
export const BALL = {
  radius: 0.10875,
  mass: 6.8,
  /** 레인 표면에서 굴러가는 높이 = 반지름 */
  restitution: 0.05,
  /** 공 자체 마찰. 레인 마찰과 Multiply 규칙으로 결합된다 */
  friction: 1.0,
  linearDamping: 0.02,
  angularDamping: 0.06,
} as const;

/**
 * 핀 (높이 15 in, 최대 지름 4.766 in, 무게 3 lb 6 oz)
 *
 * 넘어지는 모양새는 무게중심 높이가 결정한다. 단일 캡슐로 만들면
 * 팽이처럼 굴러 어색하므로, 원기둥 3단 복합 콜라이더로 만들고
 * 하부 density를 높여 아래를 무겁게 한다.
 */
export const PIN = {
  height: 0.381,
  maxDiameter: 0.121,
  mass: 1.53,
  /** 핀은 서로 잘 튄다 */
  restitution: 0.35,
  friction: 0.15,
  /** 중심간 간격 12 in */
  spacing: 0.3048,
  /** 넘어짐 판정: 기울기가 이 각도를 넘으면 넘어진 것 */
  fallenTiltDeg: 45,
  /** 넘어짐 판정: 제자리에서 이만큼 밀려나도 넘어진 것으로 본다 */
  fallenMoveDistance: 0.1,
  /**
   * 복합 콜라이더 3단. 원기둥을 쌓아 핀의 테이퍼 실루엣을 흉내낸다.
   *  - yFrac      : 원기둥 중심 높이 / 핀 높이
   *  - hFrac      : 원기둥 높이 / 핀 높이
   *  - radiusFrac : 원기둥 반지름 / (최대지름 / 2)
   *  - density    : 상대 밀도. 실제 총 질량이 PIN.mass가 되도록 일괄 보정된다.
   *
   * 무게중심은 이 값으로 약 34%(핀 높이 기준)에 놓인다. 실제 볼링 핀도
   * 밑에서 1/3 근처에 무게중심이 있다. 아래가 두꺼운 모양 자체가 이미
   * 무게중심을 낮추므로 density는 살짝만 실어 준다.
   *
   * 핀이 너무 잘 넘어지면 첫 단 density를 올리고, 팽이처럼 돌면 내린다.
   */
  segments: [
    { yFrac: 0.2, hFrac: 0.4, radiusFrac: 0.8, density: 1.15 }, // 굽·몸통
    { yFrac: 0.56, hFrac: 0.32, radiusFrac: 0.52, density: 1.0 }, // 목
    { yFrac: 0.86, hFrac: 0.28, radiusFrac: 0.4, density: 0.9 }, // 머리
  ],
} as const;

/** 조준용 화살표 (실제 7개, 파울라인에서 12~15 ft) */
export const ARROWS = {
  count: 7,
  nearZ: 3.66,
  farZ: 4.57,
  /** 화살표는 보드 5장 간격 */
  boardSpacing: 5,
} as const;

/** 물리 시뮬레이션 */
export const PHYSICS = {
  /**
   * 1/120초. 핀은 얇고 길며 공은 18 m를 8 m/s로 달리므로
   * 1/60초로는 터널링과 불안정이 발생한다.
   */
  timestep: 1 / 120,
  gravity: -9.81,
  /** 프레임당 최대 스텝. 탭 복귀 시 스파이럴 방지 */
  maxStepsPerFrame: 8,
} as const;

/** 정지(settle) 판정 */
export const SETTLE = {
  linearVelocityThreshold: 0.05,
  angularVelocityThreshold: 0.3,
  /** 이 시간만큼 연속으로 조용해야 정지로 본다 (초) */
  quietDuration: 0.5,
  /** 아무리 늦어도 이 시간이 지나면 정지로 처리 (초) */
  hardTimeout: 7,
} as const;

/**
 * 드래그 조작 → 투구 매핑.
 *
 * 초등 고학년 대상이므로 클램프를 좁게 시작한다. 실수해도 공이
 * 거터로 빠지는 빈도를 낮춰야 한다. 난이도별로 배율을 다르게 준다.
 */
export const THROW = {
  minSpeed: 5.0,
  maxSpeed: 9.0,
  /** 파워 100%에 필요한 드래그 길이 (화면 높이 대비 비율) */
  fullPowerDragFraction: 0.28,
  /** 발사 각도 클램프 (도) */
  maxAngleDeg: 8,
  /**
   * 옆회전 클램프 (rad/s, 진행 방향 Z축).
   * 실측: 8m/s에서 회전 24는 약 60cm 휜다 (레인 폭의 절반이 넘는다).
   * 이보다 크게 열어 두면 초등학생이 의도치 않게 거터로 보내기 쉽다.
   */
  maxSpin: 24,
  /** 파울라인상 시작 위치 클램프 (m) */
  maxStartX: 0.4,
} as const;

/** 난이도: THROW 클램프에 곱해지는 배율 */
export const DIFFICULTY = {
  easy: { angle: 0.5, spin: 0.6, label: '쉽게' },
  normal: { angle: 1.0, spin: 1.0, label: '보통' },
  hard: { angle: 1.4, spin: 1.3, label: '어렵게' },
} as const;

export type DifficultyName = keyof typeof DIFFICULTY;

/** 관찰 모드 (수업 시연용) */
export const OBSERVE = {
  slowMotionRates: [1, 1 / 4, 1 / 8],
  /** 궤적 리본에 남길 최대 점 개수 */
  trajectoryMaxPoints: 600,
} as const;

/**
 * 초등용 비유 — 튜토리얼 본문이 이 문자열을 인용한다.
 * 수치를 바꾸면 비유도 여기서 함께 바뀐다.
 */
export const ANALOGIES = {
  laneLength: '버스 두 대를 세워 놓은 길이',
  laneWidth: '두 팔을 벌린 정도',
  ballSize: '축구공보다 조금 작고 훨씬 무거워요',
  pinSize: '2리터 물병 정도',
  pinSpacing: '30cm 자 하나',
} as const;
