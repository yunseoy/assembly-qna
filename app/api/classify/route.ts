import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";
import { findPrecedents } from "@/lib/assemblyDb";

const CONFIDENCE_THRESHOLD = 40;

interface Candidate {
  department: string;
  confidence: number;
  reason: string;
}

export async function POST(req: NextRequest) {
  const { text } = await req.json();

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "질의서 텍스트가 필요합니다." }, { status: 400 });
  }

  // 미리 수집해 둔 국회 서면질의답변서에서 비슷한 사례를 찾는다.
  const precedents = await findPrecedents(text);

  const referenceText = precedents.cases.length
    ? precedents.cases
        .map((c, i) => {
          const dept = c.departments.length ? ` / 담당 부서: ${c.departments.join(", ")}` : "";
          return `${i + 1}. ${c.title} (${c.date ?? ""})\n   실제 소관: ${c.ministry ?? "미상"}${dept}\n   내용: ${c.excerpt.slice(0, 300)}`;
        })
        .join("\n")
    : "참고할 과거 사례 없음";

  const prompt = `다음은 국회에서 정부에 보낸 질의서입니다. 어느 부처가 담당해야 할지 예측해주세요.

[질의서]
${text}

[과거 실제 사례 — 국회 서면질의답변서에서 확인된 소관 기관]
${referenceText}

아래 JSON 형식으로만 답하세요. candidates는 신뢰도가 높은 순으로 최대 3개까지 담습니다.
{"candidates": [{"department": "부처명", "confidence": 0에서 100 사이 숫자, "reason": "근거 한 줄"}]}`;

  const openai = getOpenAIClient();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let candidates: Candidate[] = [];
  try {
    const parsed = JSON.parse(raw);
    candidates = Array.isArray(parsed.candidates) ? parsed.candidates.slice(0, 3) : [];
  } catch {
    candidates = [];
  }

  const isLowConfidence =
    candidates.length === 0 ||
    candidates.every((c) => (c.confidence ?? 0) < CONFIDENCE_THRESHOLD);

  // 과 단위는 과거 사례에 담당자 표기가 있을 때만 제시한다.
  // 근거 없이 AI가 지어내지 않도록, LLM 결과가 아니라 DB에서 확인된 값만 쓴다.
  //
  // 여기에 더해 '예측된 부처와 같은 사례'에서 나온 과만 남긴다.
  // 이 필터가 없으면 통일부 질의에 해양수산부 사례의 과가 섞여 나온다(실제로 발생했다).
  const predictedMinistries = candidates.map((c) => (c.department ?? "").trim()).filter(Boolean);
  const matchingCases = precedents.cases.filter((c) =>
    c.ministry ? predictedMinistries.some((m) => m.includes(c.ministry!) || c.ministry!.includes(m)) : false
  );

  const deptTally = new Map<string, { name: string; count: number; basis: string[] }>();
  for (const c of matchingCases) {
    for (const name of c.departments) {
      const found = deptTally.get(name) ?? { name, count: 0, basis: [] };
      found.count += 1;
      if (found.basis.length < 3 && !found.basis.includes(c.title)) found.basis.push(c.title);
      deptTally.set(name, found);
    }
  }
  const departmentCandidates = [...deptTally.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return NextResponse.json({
    status: isLowConfidence ? "hold" : "ok",
    // 참고 사례 조회가 실패했는지 알린다. 실패를 '사례 없음'과 구분하지 못하면
    // 근거 없는 초안이 그대로 나간다.
    precedentError: precedents.error,
    // 1단계 — 부처 단위 (AI 판단 + 과거 사례 근거)
    candidates,
    // 2단계 — 과 단위 (과거 사례에서 실제로 확인된 것만)
    departmentCandidates,
    departmentAvailable: departmentCandidates.length > 0,
    // 화면에 근거로 보여줄 과거 사례
    referenceCases: precedents.cases.map((c) => ({
      title: c.title,
      summary: `${c.eraco ?? ""} ${c.date ?? ""} · 실제 소관: ${c.ministry ?? "미상"}`,
      downloadUrl: c.downUrl,
      excerpt: c.excerpt.slice(0, 200),
      departments: c.departments,
      textSupported: true,
    })),
  });
}
