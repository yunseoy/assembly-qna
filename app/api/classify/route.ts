import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";
import { fetchSimilarCases } from "@/lib/assembly";

const CONFIDENCE_THRESHOLD = 40;

interface Candidate {
  department: string;
  confidence: number;
  reason: string;
}

export async function POST(req: NextRequest) {
  const { text } = await req.json();

  if (!text || typeof text !== "string") {
    return NextResponse.json(
      { error: "질의서 텍스트가 필요합니다." },
      { status: 400 }
    );
  }

  const referenceCases = await fetchSimilarCases(text);
  const referenceText = referenceCases.length
    ? referenceCases
        .map((c, i) => {
          const body = c.textSupported && c.excerpt ? `\n본문: ${c.excerpt}` : "";
          return `${i + 1}. ${c.title} - ${c.summary}${body}`;
        })
        .join("\n")
    : "참고할 과거 사례 없음";

  const prompt = `다음은 국정감사 질의서입니다. 이 질의서를 담당해야 할 부처 내 실·국·과를 예측해주세요.

[질의서]
${text}

[과거 유사 사례]
${referenceText}

아래 JSON 형식으로만 답하세요. candidates는 신뢰도가 높은 순으로 최대 3개까지 담습니다.
{"candidates": [{"department": "부서명", "confidence": 0에서 100 사이 숫자, "reason": "근거 한 줄"}]}`;

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

  return NextResponse.json({
    status: isLowConfidence ? "hold" : "ok",
    candidates,
    referenceCases,
  });
}
