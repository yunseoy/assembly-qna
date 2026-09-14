import { describeSupabaseEnv, getSupabaseAdmin } from "@/lib/supabase";

/** 과거 사례 1건 (DB에 쌓아 둔 국회 서면질의답변서) */
export interface PrecedentCase {
  answerId: string;
  title: string;
  date: string | null;
  eraco: string | null;
  /** 질문대상자 원문 (예: "부총리겸재정경제부장관") */
  target: string | null;
  /** 질문대상자에서 뽑아낸 부처명 (예: "재정경제부") */
  ministry: string | null;
  /** 답변서에서 확인된 실·국·과 (없을 수 있음) */
  departments: string[];
  /** 질의서 텍스트와 겹친 키워드 수 */
  score: number;
  excerpt: string;
  downUrl: string;
}

/** 부처 또는 과 단위 후보 1개 */
export interface Candidate {
  name: string;
  /** 이 후보를 뒷받침하는 과거 사례 수 */
  count: number;
  /** 근거가 된 사례 제목 (최대 3건) */
  basis: string[];
}

export interface PrecedentResult {
  cases: PrecedentCase[];
  /** 부처 단위 후보 — 질문대상자 기반이라 대부분의 사례에서 확보된다. */
  ministries: Candidate[];
  /** 과 단위 후보 — 답변서에 담당자 표기가 있는 일부 사례에서만 확보된다. */
  departments: Candidate[];
  /**
   * 조회가 실패한 경우의 사유. 정상이면 null.
   * 실패를 조용히 빈 결과로 넘기면 "참고 사례가 없는 것"과 구분이 안 되고,
   * 그 상태로 초안을 만들면 근거 없는 문장이 나온다(실제로 배포본에서 발생).
   */
  error: string | null;
}

// 거의 모든 문장에 나와 매칭 정확도를 떨어뜨리는 단어는 키워드에서 아예 뺀다.
const STOPWORDS = new Set([
  "관련", "문의", "문의드립니다", "드립니다", "대한", "대해", "위한", "위해",
  "관하여", "관해", "그리고", "각각", "부탁드립니다", "요청드립니다",
  "바랍니다", "합니다", "제출", "자료", "현황", "내역", "여부", "경우",
]);

// 빼지는 않지만, 이 단어만 겹친 사례는 '비슷한 사례'로 인정하지 않는다.
// 행정 문서라면 어디에나 나오는 말이라, 이것만으로 매칭하면 엉뚱한 문서가 딸려온다.
// (실측: "이산가족 및 납북자 지원 사업 추진 현황"이 '지원/사업/추진'만으로
//  조세특례제한법·주택정책 문서와 매칭됐다.)
const GENERIC = new Set([
  "지원", "사업", "추진", "계획", "방안", "정책", "관리", "운영", "개선",
  "확대", "실적", "대책", "검토", "결과", "관계", "기관", "대상", "조치",
  "이행", "점검", "평가", "필요", "문제", "상황", "내용", "제도",
]);

interface Keyword {
  word: string;
  /** 이 단어만 겹쳤을 때 '비슷하다'고 볼 수 있는지 */
  specific: boolean;
}

/** 질의서 텍스트에서 검색에 쓸 키워드를 뽑는다. */
function extractKeywords(text: string): Keyword[] {
  const words = Array.from(
    new Set(
      text
        // PostgREST의 or 필터는 콤마/괄호로 구문을 나누므로 미리 걷어낸다.
        .split(/[\s,./()·"'?!;:%*&|[\]{}<>]+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 2 && w.length <= 20 && !STOPWORDS.has(w))
    )
  ).slice(0, 12);

  return words.map((word) => ({ word, specific: !GENERIC.has(word) }));
}

// 기관명으로 볼 수 있는 끝말. "국세청장" -> "국세청"처럼 직위만 떼어내기 위해 쓴다.
const ORG_SUFFIX = /(부|청|처|위원회|실|원|소|총리)$/;
// 기관명 뒤에 붙는 직위. "청장"·"실장"째로 떼면 기관명까지 잘리므로 "장"만 떼어낸다.
const TITLE_SUFFIX = /\s*(위원장|장관|차장|총장|장)\s*$/;

/**
 * 질문대상자 표기에서 부처명만 뽑아낸다.
 *
 * 실제 데이터가 제각각이라 단계를 나눠 처리한다 (52종 전부로 검증).
 *   "경찰청장"                  -> 경찰청
 *   "국세청장 1/4쪽"            -> 국세청      (페이지 표시 제거)
 *   "부총리겸재정경제부장관"       -> 재정경제부   ("겸" 뒤쪽이 실제 소관)
 *   "이창양 산업통상자원부장관"     -> 산업통상자원부 (사람 이름 제외)
 *   "국토교통부 변창흠 장관"       -> 국토교통부
 *   "헌법재판소장 권한대행"        -> 헌법재판소
 */
export function toMinistry(target: string | null): string | null {
  if (!target) return null;
  let s = target.trim();
  // "1쪽", "1/4쪽" 같은 페이지 표시가 붙어 나오는 경우가 있다.
  s = s.replace(/\s*\d+(\/\d+)?\s*쪽\s*$/, "").trim();
  s = s.replace(/\s*권한대행\s*$/, "").trim();

  // "A 겸 B", "A 및 B"는 뒤쪽이 실제 소관 기관이다.
  const parts = s.split(/\s*(?:겸|및)\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length) s = parts[parts.length - 1];

  // 기관명으로 보이는 토큰 중 마지막 것을 고른다.
  // 앞에서부터 고르면 "이억원 금융위원회위원장"의 사람 이름('이억원')이 잡힌다.
  let found: string | null = null;
  for (const token of s.split(/\s+/)) {
    const stripped = token.replace(TITLE_SUFFIX, "").trim();
    if (stripped && ORG_SUFFIX.test(stripped)) found = stripped;
  }
  return found || s.replace(TITLE_SUFFIX, "").trim() || target;
}

/** name 기준으로 후보를 집계해 많이 나온 순으로 정렬한다. */
function tally(entries: { name: string; title: string }[]): Candidate[] {
  const map = new Map<string, Candidate>();
  for (const e of entries) {
    if (!e.name) continue;
    const found = map.get(e.name) ?? { name: e.name, count: 0, basis: [] };
    found.count += 1;
    if (found.basis.length < 3 && !found.basis.includes(e.title)) {
      found.basis.push(e.title);
    }
    map.set(e.name, found);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/**
 * DB에 쌓아 둔 과거 서면질의답변서에서 비슷한 사례를 찾는다.
 *
 * 예전에는 요청마다 열린국회정보 API를 호출하고 PDF를 내려받아 6~10초가 걸렸는데,
 * 미리 수집해 둔 덕분에 DB 조회 두 번으로 끝난다.
 */
export async function findPrecedents(queryText: string): Promise<PrecedentResult> {
  const empty = (error: string | null = null): PrecedentResult => ({
    cases: [],
    ministries: [],
    departments: [],
    error,
  });

  const keywords = extractKeywords(queryText);
  if (keywords.length === 0) return empty();

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    // 환경변수 문제는 조용히 넘기면 '사례 없음'과 구분되지 않는다.
    const message = e instanceof Error ? e.message : "Supabase 설정 오류";
    console.error("[assemblyDb] Supabase 설정 오류:", message, describeSupabaseEnv());
    return empty(`env: ${message}`);
  }

  // 1) 키워드가 들어간 문항을 찾아 답변서별 매칭 점수를 낸다.
  const orFilter = keywords.map((k) => `body.ilike.*${k.word}*`).join(",");
  const { data: matchedQuestions, error: qError } = await supabase
    .from("assembly_questions")
    .select("answer_id, body")
    .or(orFilter)
    .limit(300);

  if (qError) {
    console.error("[assemblyDb] assembly_questions 조회 실패:", qError.message, qError.code);
    return empty(`questions: ${qError.code ?? ""} ${qError.message}`.trim());
  }
  if (!matchedQuestions?.length) return empty();

  const scoreByAnswer = new Map<string, { score: number; excerpt: string }>();
  for (const q of matchedQuestions) {
    const body: string = q.body ?? "";
    const hit = keywords.filter((k) => body.includes(k.word));
    // 흔한 행정 용어만 겹친 문서는 '비슷한 사례'로 보지 않는다.
    if (!hit.some((k) => k.specific)) continue;

    // 구체적인 단어에 가중치를 줘, 우연히 겹친 일반 용어가 순위를 끌어올리지 못하게 한다.
    const score = hit.reduce((sum, k) => sum + (k.specific ? k.word.length : 1), 0);
    const prev = scoreByAnswer.get(q.answer_id);
    if (!prev || score > prev.score) {
      // 답변 본문까지 담아야 초안이 근거를 갖는다. (질문만 넘어가면 모델이 지어낸다.)
      scoreByAnswer.set(q.answer_id, { score, excerpt: body.slice(0, 1500) });
    }
  }

  const topAnswerIds = [...scoreByAnswer.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 5)
    .map(([id]) => id);
  if (topAnswerIds.length === 0) return empty();

  // 2) 해당 답변서의 부처(질문대상자)와 담당 부서를 함께 가져온다.
  const { data: answers, error: aError } = await supabase
    .from("assembly_answers")
    .select(
      "id, target, label_source, assembly_documents(file_cn, conf_dt, eraco, down_url), assembly_contacts(department, ministry)"
    )
    .in("id", topAnswerIds);

  if (aError) {
    console.error("[assemblyDb] assembly_answers 조회 실패:", aError.message, aError.code);
    return empty(`answers: ${aError.code ?? ""} ${aError.message}`.trim());
  }
  if (!answers?.length) return empty();

  const cases: PrecedentCase[] = answers.map((a) => {
    // PostgREST는 1:1 관계도 배열로 돌려줄 수 있어 양쪽을 모두 받아준다.
    const doc = Array.isArray(a.assembly_documents)
      ? a.assembly_documents[0]
      : a.assembly_documents;
    const contacts = (a.assembly_contacts ?? []) as { department: string | null }[];
    const departments = Array.from(
      new Set(contacts.map((c) => c.department).filter((d): d is string => !!d))
    );
    const matched = scoreByAnswer.get(a.id);

    return {
      answerId: a.id,
      title: doc?.file_cn ?? "",
      date: doc?.conf_dt ?? null,
      eraco: doc?.eraco ?? null,
      target: a.target,
      ministry: toMinistry(a.target),
      departments,
      score: matched?.score ?? 0,
      excerpt: matched?.excerpt ?? "",
      downUrl: doc?.down_url ?? "",
    };
  });

  cases.sort((a, b) => b.score - a.score);

  const ministries = tally(
    cases.map((c) => ({ name: c.ministry ?? "", title: c.title }))
  );
  const departments = tally(
    cases.flatMap((c) => c.departments.map((d) => ({ name: d, title: c.title })))
  );

  return { cases, ministries, departments, error: null };
}
