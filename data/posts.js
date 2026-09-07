// ============================================================
// 제품/글 카드 목록
// ------------------------------------------------------------
// 배열에 객체를 추가/삭제/수정하면 홈페이지 카드 그리드가 그대로 반영됩니다.
// image는 public/images 안의 파일 경로입니다.
// ============================================================

export const posts = [
  {
    id: "p1",
    image: "/images/post-1.jpg",
    badge: "베스트",
    title: "코인육수 추천 간편육수로 애호박된장국 만드는법 육수네 코인육수",
    summary: "국내산 사골을 장시간 고아낸 진하고 깊은 국물.",
    link: "https://blog.naver.com/81sally29/224375922935",
  },
  {
    id: "p2",
    image: "/images/post-2.jpg",
    badge: "",
    title: "코인육수 추천 육수네 압도적 육수로 미역국 황태국 간편하게",
    summary: "시원하고 깔끔한 국물 요리의 기본.",
    link: "https://blog.naver.com/hj2307/224387882646",
  },
  {
    id: "p3",
    image: null,
    badge: "신메뉴",
    title: "가쓰오육수",
    summary: "감칠맛과 은은한 훈연향의 일식 육수.",
  },
  {
    id: "p4",
    image: null,
    badge: "",
    title: "채수(야채육수)",
    summary: "채소만으로 우려낸 담백한 비건 육수.",
  },
  {
    id: "id-2b8be0wo",
    image: "/images/post-5.jpg",
    badge: "",
    title: "새 제품", // TODO: 실제 제목으로 교체해주세요
    summary: "",
  },
];
