-- 열린국회정보 서면질의답변서 수집·파싱 결과를 담는 테이블 4종
--
-- 관계 구조
--   assembly_documents (목록 API 원본, 103건)
--     └ assembly_answers (파싱한 답변서, 31건)          document_id 1:1
--         ├ assembly_questions (문항, 260건)            answer_id 1:N
--         └ assembly_contacts  (담당자 표기, 94건)      answer_id 1:N
--
-- 기존 inquiries 테이블(담당자가 확정한 처리 이력)과는 용도가 달라 분리해 둔다.

-- ---------------------------------------------------------------------------
-- 1) 목록 API 원본
-- ---------------------------------------------------------------------------
create table if not exists public.assembly_documents (
  id          uuid primary key default gen_random_uuid(),
  -- DOWN_URL은 103건 전체에서 유일해 자연키로 쓴다. 재수집 시 중복 적재를 막아준다.
  down_url    text not null unique,
  conf_id     text not null,              -- 회의ID (여러 문서가 같은 회의를 공유할 수 있음)
  conf_knd    text,                       -- 회의종류
  eraco       text,                       -- 대수 (예: 제22대)
  sess        text,                       -- 회기
  dgr         text,                       -- 차수
  conf_dt     date,                       -- 회의일자
  file_knd    text,                       -- 파일종류 (현재는 전부 '보존부록')
  file_cn     text not null,              -- 파일설명 = 문서 제목
  kind        text not null check (kind in ('answer', 'question')),  -- 답변서/질의서
  member      text,                       -- 제목에서 추출한 의원명
  created_at  timestamptz not null default now()
);

comment on table public.assembly_documents is '열린국회정보 서면질의답변서 목록 API 원본';
comment on column public.assembly_documents.kind is 'FILE_CN에 "답변" 포함 여부로 판정';

create index if not exists assembly_documents_conf_id_idx on public.assembly_documents (conf_id);
create index if not exists assembly_documents_kind_idx    on public.assembly_documents (kind);
create index if not exists assembly_documents_conf_dt_idx on public.assembly_documents (conf_dt desc);
-- 질의서-답변서 페어링은 (회의ID, 의원명)으로 시도하므로 함께 조회할 수 있게 둔다.
create index if not exists assembly_documents_pair_idx    on public.assembly_documents (conf_id, member);

-- ---------------------------------------------------------------------------
-- 2) 파싱한 답변서 (PDF 1페이지 표에서 뽑은 헤더)
-- ---------------------------------------------------------------------------
create table if not exists public.assembly_answers (
  id           uuid primary key default gen_random_uuid(),
  -- 문서 1건당 답변서 파싱 결과는 1건이므로 unique로 1:1을 보장한다.
  document_id  uuid not null unique references public.assembly_documents (id) on delete cascade,
  member_name  text,                      -- 질문의원명
  party        text,                      -- 소속(정당)
  target       text,                      -- 질문대상자 (피질의 기관) — 31건 전부 확보됨
  pages        integer,                   -- PDF 페이지 수
  -- 이 문서에서 확보 가능한 라벨 수준
  --   department  : 실·국·과 단위까지 확보
  --   target_only : 기관 단위(질문대상자)만 확보
  --   none        : 확보 실패
  label_source text not null check (label_source in ('department', 'target_only', 'none')),
  created_at   timestamptz not null default now()
);

comment on table public.assembly_answers is '답변서 PDF 파싱 결과 (헤더는 extract_tables로 추출)';

create index if not exists assembly_answers_target_idx on public.assembly_answers (target);
create index if not exists assembly_answers_label_idx  on public.assembly_answers (label_source);

-- ---------------------------------------------------------------------------
-- 3) 문항
-- ---------------------------------------------------------------------------
create table if not exists public.assembly_questions (
  id          uuid primary key default gen_random_uuid(),
  answer_id   uuid not null references public.assembly_answers (id) on delete cascade,
  no          integer not null,           -- 문서 안에서의 문항 순번 (1부터)
  start_page  integer,
  end_page    integer,
  body        text,                       -- 문항 본문 (파싱 시 2000자로 잘라 저장)
  created_at  timestamptz not null default now(),
  unique (answer_id, no)
);

comment on table public.assembly_questions is '답변서 본문을 문항 단위로 분할한 결과';
comment on column public.assembly_questions.body is '"text"는 SQL 예약어와 헷갈리기 쉬워 body로 둔다';

create index if not exists assembly_questions_answer_idx on public.assembly_questions (answer_id);

-- ---------------------------------------------------------------------------
-- 4) 담당자 표기 (담당 부서 라벨의 근거)
-- ---------------------------------------------------------------------------
create table if not exists public.assembly_contacts (
  id          uuid primary key default gen_random_uuid(),
  answer_id   uuid not null references public.assembly_answers (id) on delete cascade,
  -- 담당자 표기가 특정 문항 구간 안에 있으면 연결한다. 문서 말미에만 적힌 경우가 많아 대부분 null이다.
  question_id uuid references public.assembly_questions (id) on delete set null,
  page        integer,
  ministry    text,                       -- 기관명 (예: 법무부, 해양수산부)
  department  text,                       -- 실·국·과 (예: 법무심의관실, 선거기반과)
  title       text,                       -- 직위 (예: 사무관, 과장)
  phone       text,
  raw         text not null,              -- 추출 근거가 된 원문 줄
  created_at  timestamptz not null default now()
);

comment on table public.assembly_contacts is '답변서 본문에서 찾은 담당자 표기 줄 (표기 형식이 제각각이라 raw를 함께 보관)';

create index if not exists assembly_contacts_answer_idx     on public.assembly_contacts (answer_id);
create index if not exists assembly_contacts_question_idx   on public.assembly_contacts (question_id);
create index if not exists assembly_contacts_department_idx on public.assembly_contacts (department);

-- ---------------------------------------------------------------------------
-- RLS — 기존 inquiries와 동일하게, 서버(service_role)에서만 접근하도록 둔다.
-- service_role 키는 RLS를 우회하므로 적재/조회 스크립트는 정상 동작하고,
-- 브라우저에서 anon 키로 직접 읽는 것은 차단된다.
-- ---------------------------------------------------------------------------
alter table public.assembly_documents enable row level security;
alter table public.assembly_answers   enable row level security;
alter table public.assembly_questions enable row level security;
alter table public.assembly_contacts  enable row level security;
