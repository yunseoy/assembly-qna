-- 처리한 국회 질의서와 답변 초안, 처리 이력을 저장하는 테이블
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  question_text text not null,
  department text not null,
  draft text not null,
  created_at timestamptz not null default now()
);

-- 처리 이력은 최신순으로 조회하므로 정렬용 인덱스를 둔다.
create index if not exists inquiries_created_at_idx
  on public.inquiries (created_at desc);

-- 이번 실습에서는 서버(service_role)에서만 읽고 쓰므로 RLS를 켜고 별도 정책을 두지 않는다.
-- service_role 키는 RLS를 우회하므로 서버 라우트는 정상 동작하고, 브라우저에서의 직접 접근은 차단된다.
alter table public.inquiries enable row level security;
