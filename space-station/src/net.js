// 사람들끼리 위치를 나누는 얇은 층. 백엔드는 둘 중 하나를 자동으로 고른다.
//  1) Supabase Realtime: 빌드할 때 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY가 있으면 사용 (누구나 접속, GitHub Pages용)
//  2) claude.ai 아티팩트의 room: 아티팩트 안에서 열렸을 때 (로그인한 사람끼리)
//  어느 쪽도 없으면 혼자서 그대로 동작한다.
const ADJ = ['고요한', '느긋한', '포근한', '은은한', '작은', '다정한', '맑은', '느린', '잔잔한', '따스한'];
const NOUN = ['먼지', '달빛', '별', '그림자', '바위', '발자국', '은하', '운석', '지구', '이슬'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SEND_MS = 200;        // 위치는 초당 5번까지 (무료 한도 보호)
const HEARTBEAT_MS = 2000;  // 가만히 있어도 살아 있음을 알림
const STALE_MS = 8000;      // 이 시간 소식이 없으면 사라진 것으로 봄

export function createNet() {
  const me = { n: `${pick(ADJ)} ${pick(NOUN)}`, h: Math.floor(Math.random() * 360) };
  const listeners = { join: [], leave: [] };
  const fire = (ev, p) => listeners[ev].forEach((f) => f(p));
  let backend = null; // { connected(), peers(), count(), send(state, now) }

  if (SB_URL && SB_KEY) startSupabase();
  else startClaudeRoom();

  // ---- 1) Supabase Realtime ----
  async function startSupabase() {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(SB_URL, SB_KEY, { realtime: { params: { eventsPerSecond: 10 } } });
      const id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())).slice(0, 8);
      const roomName = /^#?([a-z0-9-]{1,24})$/.exec(location.hash)?.[1] || 'lobby'; // 주소 뒤 #이름 으로 방 분리
      const ch = sb.channel(`moon-${roomName}`, { config: { broadcast: { self: false }, presence: { key: id } } });
      const peers = new Map();
      let up = false, lastSent = '', lastAt = 0;

      ch.on('broadcast', { event: 's' }, ({ payload }) => {
        if (!payload || typeof payload.i !== 'string' || payload.i === id) return;
        const known = peers.has(payload.i);
        peers.set(payload.i, { peer: payload.i, presence: payload, t: performance.now() });
        if (!known) fire('join', peers.get(payload.i));
      });
      ch.on('presence', { event: 'leave' }, ({ key }) => {
        const p = peers.get(key);
        if (p) { peers.delete(key); fire('leave', p); }
      });
      ch.subscribe((status) => {
        up = status === 'SUBSCRIBED';
        if (up) ch.track({ n: me.n }).catch(() => {});
      });

      backend = {
        connected: () => up,
        peers: () => {
          const now = performance.now();
          for (const [k, p] of peers) if (now - p.t > STALE_MS) { peers.delete(k); fire('leave', p); }
          return [...peers.values()];
        },
        count: () => peers.size + 1,
        send(state, now) {
          if (!up) return;
          const key = JSON.stringify(state);
          if (now - lastAt < SEND_MS || (key === lastSent && now - lastAt < HEARTBEAT_MS)) return;
          lastSent = key; lastAt = now;
          ch.send({ type: 'broadcast', event: 's', payload: { ...state, i: id } }).catch(() => {});
        },
      };
    } catch { backend = null; }
  }

  // ---- 2) claude.ai 아티팩트 room ----
  function startClaudeRoom() {
    const p = window.claude && window.claude.use ? window.claude.use('room') : Promise.resolve(null);
    p.then((r) => {
      if (!r) return;
      let lastSent = '', lastAt = 0;
      r.presence({ n: me.n, h: me.h }).catch(() => {});
      r.onPeers((ch) => {
        for (const peer of ch.joined) if (!peer.isMe) fire('join', peer);
        for (const peer of ch.left) if (!peer.isMe) fire('leave', peer);
      }, () => { backend = null; });
      backend = {
        connected: () => r.connected(),
        peers: () => r.peers().filter((x) => !x.isMe && x.kind === 'viewer'),
        count: () => r.peers().filter((x) => x.kind === 'viewer').length,
        send(state, now) {
          if (now - lastAt < 100) return;
          const key = JSON.stringify(state);
          if (key === lastSent) return;
          lastSent = key; lastAt = now;
          r.presence(state).catch(() => {});
        },
      };
    }).catch(() => {});
  }

  return {
    me,
    on(ev, fn) { listeners[ev].push(fn); },
    connected: () => !!backend && backend.connected(),
    peers: () => (backend ? backend.peers() : []),
    count: () => (backend ? backend.count() : 1),
    send: (state, now) => { if (backend) backend.send(state, now); },
  };
}
