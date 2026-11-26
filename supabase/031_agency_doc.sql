-- 31단계: 대행사 커뮤니티 가입 신청에는 사업자등록증 첨부가 필수 (운영자가 서류를 확인한 뒤 승인)
-- · 서류는 광고주 인증과 같은 비공개 저장소(business-docs)에 올라가고, 본인과 운영자만 열람할 수 있어요. 확인 후 운영자가 삭제할 수 있어요.
-- · 대행사로 신청하려면 서류 경로가 있어야 하고(없으면 거절), 심사 중·승인 후에는 회원이 서류 경로를 바꿀 수 없어요.
-- Supabase > SQL Editor 에 붙여넣고 Run. (028 이후) 아직 실제 실행해 검증하지 않은 초안입니다.

alter table public.profiles add column if not exists community_doc_path text;      -- 대행사 신청 서류(사업자등록증) 경로

create or replace function public.protect_profile() returns trigger
language plpgsql as $$
declare is_admin boolean;
begin
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') into is_admin;
  if auth.uid() is not null and not is_admin then
    new.role := old.role;
    new.business_note := old.business_note;
    new.community := old.community;                                    -- 승인 값은 운영자만
    if new.community_req = 'agency' then                               -- 대행사 신청: 사업자등록증 필수
      if new.community_doc_path is null then raise exception 'agency_doc_required'; end if;
      if old.community = 'agency' or old.community_req = 'agency' then new.community_doc_path := old.community_doc_path; end if;   -- 심사 중·승인 후에는 교체 불가
    else
      new.community_doc_path := old.community_doc_path;                -- 서류 경로는 신청할 때만 바뀜 (삭제는 운영자)
    end if;
    if not (new.business_status = 'pending' and old.business_status in ('none','rejected')
            and new.business_doc_path is not null) then
      new.business_status := old.business_status;
      if old.business_status in ('approved','pending') then
        new.business_doc_path := old.business_doc_path;
      end if;
    end if;
  end if;
  return new;
end $$;
