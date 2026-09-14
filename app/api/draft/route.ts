import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";
import { findPrecedents } from "@/lib/assemblyDb";

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

  const precedents = await findPrecedents(text);
  const hasReference = precedents.cases.length > 0;
  const referenceText = hasReference
    ? precedents.cases
        .map(
          (c, i) =>
            `${i + 1}. ${c.title} (소관: ${c.ministry ?? "미상"})\n본문: ${c.excerpt}`
        )
        .join("\n\n")
    : "참고할 과거 사례 없음";

  // 참고자료에 없는 사실을 지어내지 못하게 막는 것이 이 프롬프트의 핵심이다.
  // (실측 사고: 실제로는 경찰이 18개 부대를 배치했는데, 참고자료에 답변 본문이
  //  들어가지 않자 모델이 "개입한 사실이 없습니다"라고 단정해 버렸다.)
  const prompt = `당신은 "${department}" 담당자를 돕는 작성 보조입니다.
아래 국회 질의서에 대한 답변 초안을 만드세요.

[질의서]
${text}

[과거 사례 — 국회 서면질의답변서에서 확인된 실제 내용]
${referenceText}

반드시 지킬 규칙:
1. 사실관계를 지어내지 마세요. 위 [과거 사례]에 적혀 있는 내용만 사실로 쓸 수 있습니다.
2. "~한 사실이 없습니다", "~하지 않았습니다", "해당 내역이 없습니다" 같은
   부정 단정은 [과거 사례]에 그렇게 적혀 있을 때만 쓰세요.
   확인되지 않았다면 "확인 결과를 반영해야 합니다 [확인 필요]"처럼 적으세요.
   [과거 사례]에 실제로 수행한 조치가 적혀 있다면, 그것을 "없다"고 쓰면 안 됩니다.
   질의가 내역 제출을 요구하면 있는 내역을 제시하세요.
3. 다 쓴 뒤 스스로 점검하세요. 앞에서 "없습니다"라고 해놓고 뒤에서 조치 내용을
   나열하는 식의 모순이 있으면 안 됩니다.
4. 확인이 필요한 수치·날짜·통계에는 "[확인 필요]"를 붙이세요.
5. 개인정보로 보이는 내용(이름, 연락처 등)에는 "[개인정보 확인 필요]"를 붙이세요.
6. 참고할 근거가 없으면 문장을 만들어내지 말고, 담당자가 채워야 할 항목을
   "- OOO [확인 필요]" 형태로 나열하세요.
7. 500자 이내로, 답변 본문만 작성하세요(안내 문구는 넣지 마세요).${
    hasReference
      ? ""
      : "\n\n주의: 지금은 참고할 과거 사례가 없습니다. 사실관계를 쓰지 말고, 담당자가 확인해야 할 항목만 나열하세요."
  }`;

  const openai = getOpenAIClient();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    // 원문 근거를 그대로 옮겨야 하므로 창의성을 낮춘다.
    temperature: 0.2,
  });

  let draft = completion.choices[0]?.message?.content?.trim() ?? "";
  if (draft.length > MAX_LENGTH) {
    draft = draft.slice(0, MAX_LENGTH);
  }

  return NextResponse.json({
    draft: `${draft}\n\n${REVIEW_NOTICE}`,
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
