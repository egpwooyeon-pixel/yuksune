// 체험단 등록 폼 (시험용: 브라우저 localStorage에 저장 → 서버 연결 후 DB로 교체)
const KEY = "woori.campaigns";
const form = document.getElementById("reg-form");
let photoData = "";

// 마감일: 오늘 이후만 선택
const dl = form.deadline, today = new Date();
dl.min = today.toISOString().slice(0, 10);
const def = new Date(today.getTime() + 14 * 864e5); dl.value = def.toISOString().slice(0, 10);

// 배송형이면 지역 선택 불필요하지만 값은 유지
// 사진: 가로 600px 이하로 줄여서 저장 (저장 공간 절약)
document.getElementById("photo").addEventListener("change", e => {
  const f = e.target.files[0], box = document.getElementById("preview");
  if (!f) { photoData = ""; box.hidden = true; return; }
  const img = new Image();
  img.onload = () => {
    const s = Math.min(1, 600 / img.width), c = document.createElement("canvas");
    c.width = img.width * s; c.height = img.height * s;
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    photoData = c.toDataURL("image/jpeg", 0.8);
    box.style.backgroundImage = `url(${photoData})`; box.hidden = false;
    URL.revokeObjectURL(img.src);
  };
  img.onerror = () => { alert("이미지를 읽을 수 없어요."); e.target.value = ""; };
  img.src = URL.createObjectURL(f);
});

form.addEventListener("submit", e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(form));
  const item = {
    id: "u" + Date.now(), type: d.type, cat: d.cat, region: d.region, mode: d.mode,
    title: d.title.trim(), reward: d.reward.trim(), biz: d.biz.trim(),
    slots: +d.slots, deadline: d.deadline, place: d.place, desc: d.desc, photo: photoData,
    applied: 0, created: Date.now(),
  };
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    list.unshift(item);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch (err) {
    alert("저장하지 못했어요. 사진을 더 작은 것으로 바꿔 보세요."); return;
  }
  location.href = "campaigns.html?type=" + encodeURIComponent(item.type);
});
