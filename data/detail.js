// ============================================================
// 상세페이지 스타일 홈페이지 콘텐츠
// ------------------------------------------------------------
// "TODO"가 붙은 항목은 실제 확인이 필요한 값입니다.
// 사진은 아직 없어서 자리만 잡아두었습니다 (PhotoPlaceholder 컴포넌트).
// 실제 사진 파일이 준비되면 각 컴포넌트의 PhotoPlaceholder를
// <img src="..." /> 로 교체해주세요.
// ============================================================

export const hero = {
  eyebrow: "명인의 손맛 그대로",
  title: "왜, 육수인가요?",
  subtitle:
    "한 알이면 충분합니다. 뜨거운 물에 넣기만 하면 완성되는 압도적인 육수의 맛.",
};

export const keyPoints = [
  {
    title: "간편함",
    description: "봉지를 뜯고 물에 넣기만 하면 짧은 시간 안에 완성됩니다.",
  },
  {
    title: "진한 감칠맛",
    description: "오랜 시간 우려낸 듯한 깊고 진한 국물 맛을 그대로 담았습니다.",
  },
  {
    title: "다양한 활용",
    description: "국, 탕, 찌개, 볶음 요리까지 폭넓게 활용할 수 있습니다.",
  },
  {
    title: "믿을 수 있는 재료",
    description: "엄선한 재료로 만들어 안심하고 사용하실 수 있습니다.", // TODO: 실제 원산지·인증 확인 후 문구 수정
  },
];

export const naturalIngredients = {
  eyebrow: "NATURAL INGREDIENTS",
  title: "국내산 자연재료", // TODO: 실제 원산지 비율(예: 100% 국내산) 확인 후 수정
  description:
    "게, 새우, 배추, 표고버섯 등 엄선된 재료로 깊은 맛을 냈습니다.", // TODO: 실제 배합 재료로 교체
};

export const principles = [
  {
    title: "정직한 원료",
    description: "인공 조미료에 기대지 않고 재료 본연의 맛으로 승부합니다.", // TODO: 무첨가 여부 등 실제 사실 확인 필요
  },
  {
    title: "엄격한 품질 기준",
    description: "생산부터 포장까지 위생 기준을 철저히 지킵니다.", // TODO: 실제 인증(HACCP 등) 현황 확인
  },
  {
    title: "투명한 제조 공정",
    description: "제조 과정을 있는 그대로 보여드립니다.",
  },
];

export const production = {
  eyebrow: "PRODUCTION STORY",
  title: "정성껏 완성하는 제조 공정", // TODO: 실제 제조 공법(동결건조 등) 확인 후 정확한 표현으로 수정
  description:
    "재료 본연의 맛과 영양을 지키기 위해 온도와 시간을 세심하게 관리합니다.", // TODO
};

export const usageSteps = [
  {
    step: "01",
    title: "봉지를 뜯어주세요",
    description: "1회분씩 개별 포장되어 있어 필요한 만큼만 꺼내 쓰기 편합니다.",
  },
  {
    step: "02",
    title: "끓는 물에 넣어주세요",
    description: "정해진 물 양에 한 알을 넣고 잘 저어주세요.", // TODO: 정확한 물 용량(ml) 확인 후 기재
  },
  {
    step: "03",
    title: "짧은 시간이면 완성",
    description: "빠른 시간 안에 깊고 진한 육수가 완성됩니다.", // TODO: 정확한 소요 시간 확인
  },
];

// 패키지 일러스트에 등장하는 재료를 참고해 구성했습니다.
// TODO: 실제 제품에 들어가는 재료 목록으로 교체해주세요.
export const ingredientIcons = [
  { emoji: "🦀", label: "게" },
  { emoji: "🦐", label: "새우" },
  { emoji: "🥬", label: "배추" },
  { emoji: "🍄", label: "표고버섯" },
  { emoji: "🧅", label: "양파" },
  { emoji: "🌶️", label: "고추" },
  { emoji: "🥕", label: "당근" },
  { emoji: "🧄", label: "마늘" },
];

export const combination = {
  eyebrow: "FREE COMBINATION",
  title: "원하시는 대로 자유롭게 조합하세요",
  description:
    "요리에 맞는 맛을 골라 쓰거나, 여러 종류를 섞어 나만의 육수를 만들 수 있습니다.",
};

// 영양성분표는 실제 값을 받으면 채워주세요. 지금은 항목만 배치했습니다.
export const nutritionFacts = [
  { label: "열량", value: "TODO" },
  { label: "나트륨", value: "TODO" },
  { label: "탄수화물", value: "TODO" },
  { label: "단백질", value: "TODO" },
  { label: "지방", value: "TODO" },
];
