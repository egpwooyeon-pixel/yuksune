-- 36단계: 네이버 로그인 연결 정보 (Edge Function 'naver-auth' 가 사용)
-- · naver_identities: 네이버 앱 전용 고유 ID(response.id) ↔ 우리 회원 연결. 이메일로는 절대 자동 합치지 않아요.
-- · oauth_states: 로그인 요청마다 1회용 state (10분 유효). 브라우저/앱은 이 표를 직접 읽거나 쓸 수 없고 Edge Function(서비스 키)만 씁니다.
-- Supabase > SQL Editor 에 붙여넣고 Run. (035 이후) 로컬 PostgreSQL 에서만 검증, 실제 네이버 연동은 미검증.

create table if not exists public.naver_identities (
  naver_id text primary key check (char_length(naver_id) between 1 and 100),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
create table if not exists public.oauth_states (
  state text primary key,
  purpose text not null check (purpose in ('login','link')),
  user_id uuid references public.profiles(id) on delete cascade,   -- link 일 때: 연결을 요청한 로그인 회원
  next text,
  nonce_hash text not null,        -- 요청한 브라우저만 결과를 받도록 묶음 (sha-256)
  token_hash text,                 -- 로그인 성공 시 발급한 1회용 토큰 (브라우저가 한 번 받으면 지움)
  result text,                     -- login_ok / linked / 오류 코드
  used boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.naver_identities enable row level security;
alter table public.oauth_states enable row level security;
revoke all on public.naver_identities, public.oauth_states from anon, authenticated;

-- 내 네이버 로그인 연결 여부 (마이페이지 표시용)
create or replace function public.naver_link_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare linked boolean; only_naver boolean;
begin
  if auth.uid() is null then return jsonb_build_object('error', 'login_required'); end if;
  select exists (select 1 from public.naver_identities where user_id = auth.uid()) into linked;
  select coalesce(u.email like '%@naver.login.invalid', false) into only_naver from auth.users u where u.id = auth.uid();
  return jsonb_build_object('linked', linked, 'only_naver', coalesce(only_naver, false));
end $$;
grant execute on function public.naver_link_status() to authenticated;

-- 연결 해제: 네이버로만 만든 계정(다른 로그인 수단 없음)은 해제할 수 없어요
create or replace function public.naver_unlink() returns jsonb
language plpgsql security definer set search_path = public as $$
declare only_naver boolean;
begin
  if auth.uid() is null then return jsonb_build_object('error', 'login_required'); end if;
  select coalesce(u.email like '%@naver.login.invalid', false) into only_naver from auth.users u where u.id = auth.uid();
  if coalesce(only_naver, false) then return jsonb_build_object('error', 'only_login_method'); end if;
  delete from public.naver_identities where user_id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.naver_unlink() to authenticated;
