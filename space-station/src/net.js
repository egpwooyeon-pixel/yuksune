// 링크를 연 사람들끼리 위치를 나누는 얇은 층.
// claude.room(presence)을 쓰고, 연결이 없으면 혼자서도 그대로 동작한다.
const ADJ = ['고요한', '느긋한', '포근한', '은은한', '작은', '다정한', '맑은', '느린', '잔잔한', '따스한'];
const NOUN = ['먼지', '달빛', '별', '그림자', '바위', '발자국', '은하', '운석', '지구', '이슬'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function createNet() {
  const me = { n: `${pick(ADJ)} ${pick(NOUN)}`, h: Math.floor(Math.random() * 360) };
  let room = null;
  let lastSent = '';
  let lastAt = 0;
  const listeners = { join: [], leave: [] };

  const p = window.claude && window.claude.use ? window.claude.use('room') : Promise.resolve(null);
  p.then((r) => {
    if (!r) return;
    room = r;
    r.presence({ n: me.n, h: me.h }).catch(() => {});
    r.onPeers((ch) => {
      for (const peer of ch.joined) if (!peer.isMe) listeners.join.forEach((f) => f(peer));
      for (const peer of ch.left) if (!peer.isMe) listeners.leave.forEach((f) => f(peer));
    }, () => { room = null; });
  }).catch(() => {});

  return {
    me,
    on(ev, fn) { listeners[ev].push(fn); },
    connected: () => !!room && room.connected(),
    // 나를 뺀 사람들 (presence 값은 믿지 않고 모두 숫자/문자 검사 후 사용)
    peers: () => (room ? room.peers().filter((x) => !x.isMe && x.kind === 'viewer') : []),
    count: () => (room ? room.peers().filter((x) => x.kind === 'viewer').length : 1),
    // 상태는 바뀐 것만, 초당 10번까지
    send(state, now) {
      if (!room || now - lastAt < 100) return;
      const key = JSON.stringify(state);
      if (key === lastSent) return;
      lastSent = key; lastAt = now;
      room.presence(state).catch(() => {});
    },
  };
}
