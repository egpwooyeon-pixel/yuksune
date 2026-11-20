-- 4단계: 커뮤니티 게시판 (글·댓글). 로그인한 회원만 쓰기, 본인 글/댓글만 삭제(운영자는 전부).
-- Supabase > SQL Editor 에 붙여넣고 Run. (schema.sql 이 먼저 실행되어 있어야 함) 아직 실제 실행해 검증하지 않은 초안입니다.

-- 운영자 여부 확인 함수 (정책에서 사용)
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;
grant execute on function public.is_admin() to anon, authenticated;

create table public.posts (
  id bigint generated always as identity primary key,
  board text not null check (board in ('free','tips','profit')),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 5000),
  views int not null default 0,
  is_notice boolean not null default false,
  created_at timestamptz not null default now()
);
create index posts_board_idx on public.posts (board, is_notice, created_at desc);

create table public.comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);

alter table public.posts enable row level security;
alter table public.comments enable row level security;

create policy "글: 누구나 조회" on public.posts for select using (true);
create policy "글: 로그인 회원 작성 (공지는 운영자만)" on public.posts for insert to authenticated
  with check (author_id = auth.uid() and (is_notice = false or public.is_admin()));
create policy "글: 본인 또는 운영자 수정" on public.posts for update to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (is_notice = false or public.is_admin());
create policy "글: 본인 또는 운영자 삭제" on public.posts for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

create policy "댓글: 누구나 조회" on public.comments for select using (true);
create policy "댓글: 로그인 회원 작성" on public.comments for insert to authenticated
  with check (author_id = auth.uid());
create policy "댓글: 본인 또는 운영자 삭제" on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- 권한: 조회는 누구나, 쓰기는 로그인 회원. 수정은 제목·본문·공지 칸만 (조회수 조작 방지)
grant select on public.posts, public.comments to anon, authenticated;
grant insert, delete on public.posts, public.comments to authenticated;
grant update (title, body, is_notice) on public.posts to authenticated;

-- 도배 방지: 같은 회원이 글은 20초, 댓글은 5초 안에 연속으로 쓰면 거절 (운영자 제외)
create or replace function public.throttle_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare gap interval; last_at timestamptz;
begin
  if public.is_admin() then return new; end if;
  gap := case TG_TABLE_NAME when 'posts' then interval '20 seconds' else interval '5 seconds' end;
  execute format('select max(created_at) from public.%I where author_id = $1', TG_TABLE_NAME) into last_at using new.author_id;
  if last_at is not null and now() - last_at < gap then
    raise exception 'too_fast';
  end if;
  return new;
end $$;
create trigger posts_throttle before insert on public.posts for each row execute function public.throttle_write();
create trigger comments_throttle before insert on public.comments for each row execute function public.throttle_write();

-- 조회수 +1 (누구나 호출 가능, 숫자만 올림)
create or replace function public.increment_post_views(pid bigint) returns void
language sql security definer set search_path = public as $$
  update public.posts set views = views + 1 where id = pid
$$;
grant execute on function public.increment_post_views(bigint) to anon, authenticated;
