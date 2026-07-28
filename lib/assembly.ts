import { PDFParse } from "pdf-parse";
import { getPath } from "pdf-parse/worker";
import JSZip from "jszip";

// Next.js(Turbopack) 번들링 환경에서 pdf.js가 워커 파일 경로를 못 찾는 문제를 막기 위해
// 워커 경로를 명시적으로 지정한다. next.config.ts의 serverExternalPackages 설정과 함께 필요하다.
PDFParse.setWorker(getPath());

export interface AssemblyReferenceCase {
  title: string;
  summary: string;
  downloadUrl: string;
  /** PDF/HWPX에서 추출한 본문 일부. 지원하지 않는 파일 형식(옛 HWP 등)이거나 추출 실패 시 undefined. */
  excerpt?: string;
  /** 본문 추출 여부(PDF, HWPX만 지원). false면 화면에 "향후 지원 예정"으로 표시한다. */
  textSupported: boolean;
}

const ENDPOINT = "https://open.assembly.go.kr/portal/openapi/VCONFATTQNALIST";
// open.assembly.go.kr는 기본 User-Agent 없는 요청(HTTP 클라이언트 기본값)을 차단하므로 브라우저처럼 보이는 값을 지정한다.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

interface AssemblyRow {
  CONF_KND: string;
  SESS: string;
  DGR: string;
  CONF_DT: string;
  FILE_CN: string;
  DOWN_URL: string;
}

// 거의 모든 문장에 등장해 매칭 정확도를 떨어뜨리는 일반 단어는 키워드에서 제외한다.
const STOPWORDS = new Set([
  "관련",
  "문의",
  "문의드립니다",
  "드립니다",
  "대한",
  "대해",
  "위한",
  "위해",
  "관하여",
  "관해",
  "그리고",
  "각각",
  "부탁드립니다",
  "부탁드립니다.",
  "요청드립니다",
  "바랍니다",
  "합니다",
]);

function extractKeywords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\s,./()·"'?!]+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
    )
  );
}

const EXCERPT_MAX_LENGTH = 800;

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

/**
 * HWPX는 zip 안에 XML(Contents/section*.xml)이 들어있는 구조라서, zip을 풀어
 * 텍스트 런(<hp:t>...</hp:t>) 안의 글자만 뽑아낸다. 옛 바이너리 HWP(.hwp)는
 * 구조가 완전히 달라 이 방식으로 처리할 수 없다 (향후 지원 예정으로 남겨둔다).
 */
async function extractHwpxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const sectionFiles = Object.keys(zip.files)
    .filter((name) => /^Contents\/section\d+\.xml$/i.test(name))
    .sort();

  const texts: string[] = [];
  for (const name of sectionFiles) {
    const xml = await zip.files[name].async("string");
    const matches = xml.matchAll(/<hp:t[^>]*>([^<]*)<\/hp:t>/g);
    for (const m of matches) texts.push(m[1]);
  }
  return texts.join("\n");
}

/**
 * 다운로드한 파일이 PDF나 HWPX면 본문 텍스트를 추출하고, 그 외 형식(옛 바이너리
 * HWP 등)은 "향후 지원 예정" 상태로 표시할 수 있도록 textSupported: false를 반환한다.
 * OCR(이미지 기반 텍스트 인식)은 아직 구현하지 않았다 — PDF/HWPX 텍스트 추출이
 * 실패하는 경우(스캔본 등)에 향후 도입을 검토할 수 있는 설계상의 확장 지점으로 남겨둔다.
 */
async function extractFileText(
  downloadUrl: string
): Promise<{ excerpt?: string; textSupported: boolean }> {
  try {
    const res = await fetch(downloadUrl, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return { textSupported: false };

    const contentDisposition = res.headers.get("content-disposition") ?? "";
    const isPdf = /\.pdf/i.test(contentDisposition);
    const isHwpx = /\.hwpx/i.test(contentDisposition);
    if (!isPdf && !isHwpx) {
      // 옛 바이너리 HWP 등은 이번 실습 범위에서는 다루지 않는다 (향후 지원 예정).
      return { textSupported: false };
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const text = isPdf ? await extractPdfText(buffer) : await extractHwpxText(buffer);

    const excerpt = text.trim().slice(0, EXCERPT_MAX_LENGTH);
    if (!excerpt) return { textSupported: false };
    return { excerpt, textSupported: true };
  } catch {
    // 텍스트 추출 실패(예: 스캔본 PDF, 예상과 다른 내부 구조 등)도 지원 불가로 처리한다.
    return { textSupported: false };
  }
}

/**
 * 열린국회정보의 "서면질의답변서 목록" API에서 최근 서면질의답변서 목록을 가져온 뒤,
 * 질의서 텍스트와 제목(FILE_CN)에 겹치는 키워드가 있는 것만 골라 참고자료로 반환한다.
 * 이 API는 본문 내용이나 키워드 검색을 제공하지 않으므로, 제목 텍스트 기반의 단순 매칭이다.
 * ASSEMBLY_API_KEY가 없거나 호출에 실패해도 예외를 던지지 않고 빈 배열을 반환한다.
 */
export async function fetchSimilarCases(
  queryText: string
): Promise<AssemblyReferenceCase[]> {
  const apiKey = process.env.ASSEMBLY_API_KEY;
  if (!apiKey) {
    return [];
  }

  try {
    const url = new URL(ENDPOINT);
    url.searchParams.set("KEY", apiKey);
    url.searchParams.set("Type", "json");
    url.searchParams.set("pIndex", "1");
    url.searchParams.set("pSize", "100");

    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return [];

    const data = await res.json();
    const rows: AssemblyRow[] = data?.VCONFATTQNALIST?.[1]?.row ?? [];
    if (rows.length === 0) return [];

    const keywords = extractKeywords(queryText);
    if (keywords.length === 0) return [];

    const scored = rows
      .map((row) => ({
        row,
        score: keywords.filter((kw) => row.FILE_CN?.includes(kw)).length,
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return await Promise.all(
      scored.map(async ({ row }) => {
        const { excerpt, textSupported } = await extractFileText(row.DOWN_URL);
        return {
          title: row.FILE_CN,
          summary: `${row.CONF_KND} ${row.SESS} ${row.DGR} (${row.CONF_DT})`,
          downloadUrl: row.DOWN_URL,
          excerpt,
          textSupported,
        };
      })
    );
  } catch {
    return [];
  }
}
