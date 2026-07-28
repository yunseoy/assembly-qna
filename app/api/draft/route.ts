import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";
import { fetchSimilarCases } from "@/lib/assembly";

const MAX_LENGTH = 500;
const REVIEW_NOTICE = "초안입니다. 담당자 검토 후 사용하세요.";

export async function POST(req: NextRequest) {
  const { text, department } = await req.json();

  if (!text || typeof text !== "string" || !department || typeof department !== "string") {
    return NextResponse.json(
      { error: "질의서 텍스트와 확정된 담당 부서가 필요합니다." },
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

  const prompt = `다음 국정감사 질의서에 대해 "${department}" 담당자 입장에서 답변 초안을 작성하세요.

[질의서]
${text}

[과거 유사 사례]
${referenceText}

규칙:
- 500자 이내로 작성
- 사실 확인이 필요한 수치나 통계에는 "[확인 필요]" 표시를 붙일 것
- 개인정보로 보이는 내용(이름, 연락처 등)이 있으면 "[개인정보 확인 필요]" 표시를 붙일 것
- 답변 본문만 작성하고, 안내 문구는 포함하지 말 것`;

  const openai = getOpenAIClient();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
  });

  let draft = completion.choices[0]?.message?.content?.trim() ?? "";
  if (draft.length > MAX_LENGTH) {
    draft = draft.slice(0, MAX_LENGTH);
  }

  return NextResponse.json({
    draft: `${draft}\n\n${REVIEW_NOTICE}`,
    referenceCases,
  });
}
