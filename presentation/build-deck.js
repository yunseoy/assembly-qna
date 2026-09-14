// 발표 자료(PPTX) 생성 스크립트
// 실행: node build-deck.js
const pptxgen = require("pptxgenjs");

// ---- 색상 팔레트 (PRD에서 정한 남색/네이비 계열) ----
const NAVY = "1E2761";
const NAVY_SOFT = "33417F";
const ICE = "CADCFC";
const WHITE = "FFFFFF";
const GOLD = "D9A441";
const INK = "1B2138";
const GRAY = "5C6579";
const BG = "F4F6FB";

const FONT = "Malgun Gothic";
const W = 13.3;
const M = 0.75; // 좌우 여백

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "김윤서";
pptx.title = "AI 활용 국회 질의서 자동화 서비스";

// 카드에 쓰는 그림자 — pptxgenjs가 옵션 객체를 변형하므로 매번 새로 만든다.
const cardShadow = () => ({
  type: "outer",
  color: "1E2761",
  blur: 10,
  offset: 2,
  angle: 90,
  opacity: 0.1,
});

// 슬라이드 제목 (밑줄·색상바 없이 여백으로만 구분)
function addTitle(slide, text, color = INK) {
  slide.addText(text, {
    x: M,
    y: 0.5,
    w: W - M * 2,
    h: 0.8,
    fontFace: FONT,
    fontSize: 34,
    bold: true,
    color,
    margin: 0,
  });
}

// 반복 모티프: 번호가 든 원
function addNumCircle(slide, num, x, y, size = 0.5, fill = NAVY, txt = WHITE) {
  slide.addShape(pptx.ShapeType.ellipse, {
    x,
    y,
    w: size,
    h: size,
    fill: { color: fill },
    line: { color: fill },
  });
  slide.addText(String(num), {
    x,
    y,
    w: size,
    h: size,
    fontFace: FONT,
    fontSize: size > 0.55 ? 16 : 14,
    bold: true,
    color: txt,
    align: "center",
    valign: "middle",
    margin: 0,
  });
}

/* ============ 1. 표지 ============ */
{
  const s = pptx.addSlide();
  s.background = { color: NAVY };

  // 원 모티프 (배경 장식)
  s.addShape(pptx.ShapeType.ellipse, {
    x: 9.85, y: 1.55, w: 3.25, h: 3.25,
    fill: { color: ICE, transparency: 82 }, line: { color: NAVY, transparency: 100 },
  });
  s.addShape(pptx.ShapeType.ellipse, {
    x: 10.68, y: 2.66, w: 1.95, h: 1.95,
    fill: { color: ICE, transparency: 62 }, line: { color: NAVY, transparency: 100 },
  });

  s.addText("국회 질의서 업무 자동화", {
    x: M, y: 2.0, w: 8.6, h: 0.4,
    fontFace: FONT, fontSize: 15, bold: true, color: ICE, charSpacing: 2, margin: 0,
  });
  s.addText("AI 활용\n국회 질의서 자동화 서비스", {
    x: M, y: 2.55, w: 9.0, h: 1.9,
    fontFace: FONT, fontSize: 40, bold: true, color: WHITE, lineSpacing: 50, margin: 0,
  });
  s.addText("질의서를 읽고 담당 실·국·과를 분류한 뒤, 답변 초안까지 만들어 주는 서비스", {
    x: M, y: 4.55, w: 9.0, h: 0.45,
    fontFace: FONT, fontSize: 15, color: ICE, margin: 0,
  });
  s.addText("김윤서  ·  기획재정담당관실", {
    x: M, y: 5.75, w: 8.0, h: 0.4,
    fontFace: FONT, fontSize: 14, bold: true, color: WHITE, margin: 0,
  });
  s.addNotes(
    "안녕하세요. 기획재정담당관실 김윤서입니다. 국회에서 내려온 질의서를 AI가 담당 부서로 분류하고 답변 초안까지 만들어주는 서비스를 만들어봤고, 그 과정을 공유드리겠습니다."
  );
}

/* ============ 2. 왜 만들게 되었나 ============ */
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  addTitle(s, "왜 만들게 되었나");

  s.addText("국정감사 시즌마다 반복되던 일", {
    x: M, y: 1.55, w: 7.3, h: 0.4,
    fontFace: FONT, fontSize: 19, bold: true, color: NAVY, margin: 0,
  });

  const pains = [
    ["질의서가 한꺼번에 쏟아진다", "짧은 기간에 많은 건을 동시에 처리해야 한다"],
    ["어느 실·국·과 소관인지 매번 판단한다", "담당자의 경험과 기억에 의존하게 된다"],
    ["답변 초안을 늘 처음부터 쓴다", "비슷한 질의도 매번 백지에서 시작한다"],
  ];
  pains.forEach(([head, sub], i) => {
    const y = 2.4 + i * 1.5;
    addNumCircle(s, i + 1, M, y, 0.52);
    s.addText(head, {
      x: M + 0.78, y: y - 0.04, w: 6.5, h: 0.4,
      fontFace: FONT, fontSize: 16, bold: true, color: INK, margin: 0,
    });
    s.addText(sub, {
      x: M + 0.78, y: y + 0.38, w: 6.5, h: 0.4,
      fontFace: FONT, fontSize: 13, color: GRAY, margin: 0,
    });
  });

  // 오른쪽 카드
  s.addShape(pptx.ShapeType.roundRect, {
    x: 8.55, y: 2.2, w: 4.0, h: 4.1, rectRadius: 0.12,
    fill: { color: NAVY }, line: { color: NAVY }, shadow: cardShadow(),
  });
  s.addText("그래서", {
    x: 8.95, y: 2.7, w: 3.2, h: 0.35,
    fontFace: FONT, fontSize: 14, bold: true, color: ICE, charSpacing: 2, margin: 0,
  });
  s.addText("전공이 소프트웨어니까,\n직접 만들어 보자", {
    x: 8.95, y: 3.2, w: 3.3, h: 1.2,
    fontFace: FONT, fontSize: 20, bold: true, color: WHITE, lineSpacing: 30, margin: 0,
  });
  s.addText("업무에서 직접 느낀 불편이라\n무엇을 만들어야 할지는\n이미 알고 있었다", {
    x: 8.95, y: 4.7, w: 3.3, h: 1.2,
    fontFace: FONT, fontSize: 12.5, color: ICE, lineSpacing: 20, margin: 0,
  });

  s.addNotes(
    "국정감사 시즌이면 질의서가 한꺼번에 내려옵니다. 그때마다 어느 과 소관인지 판단하고, 답변 초안도 매번 처음부터 씁니다. 마침 전공이 소프트웨어라서, 업무에서 느낀 불편을 직접 만들어 풀어보자고 생각했습니다."
  );
}

/* ============ 3. 무엇을 만들었나 ============ */
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  addTitle(s, "무엇을 만들었나");

  s.addShape(pptx.ShapeType.roundRect, {
    x: M, y: 1.5, w: W - M * 2, h: 1.15, rectRadius: 0.1,
    fill: { color: WHITE }, line: { color: ICE }, shadow: cardShadow(),
  });
  s.addText(
    "국회에서 내려온 질의서(서면질문·국정감사 등)를 AI가 분석해 담당 실·국·과를\n분류하고, 해당 부서가 쓸 답변 초안까지 함께 만들어 주는 웹 서비스",
    {
      x: M + 0.35, y: 1.68, w: W - M * 2 - 0.7, h: 0.8,
      fontFace: FONT, fontSize: 16, bold: true, color: INK, lineSpacing: 26, margin: 0,
    }
  );

  s.addText("사용 흐름", {
    x: M, y: 3.25, w: 5, h: 0.35,
    fontFace: FONT, fontSize: 17, bold: true, color: NAVY, margin: 0,
  });

  const steps = [
    ["질의서 입력", "담당자가 본문을 붙여넣는다"],
    ["AI 분류", "부서 후보 3개 + 신뢰도"],
    ["담당자 확정", "사람이 최종 선택"],
    ["초안 생성", "500자 이내 답변 초안"],
    ["검토 · 저장", "수정 후 이력에 기록"],
  ];
  const cw = 2.32;
  const gap = 0.19;
  steps.forEach(([head, sub], i) => {
    const x = M + i * (cw + gap);
    const isHuman = i === 2;
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 3.85, w: cw, h: 2.35, rectRadius: 0.1,
      fill: { color: isHuman ? NAVY : WHITE },
      line: { color: isHuman ? NAVY : ICE },
      shadow: cardShadow(),
    });
    addNumCircle(s, i + 1, x + 0.28, 4.18, 0.48, isHuman ? ICE : NAVY, isHuman ? NAVY : WHITE);
    s.addText(head, {
      x: x + 0.22, y: 4.92, w: cw - 0.44, h: 0.35,
      fontFace: FONT, fontSize: 14.5, bold: true,
      color: isHuman ? WHITE : INK, margin: 0,
    });
    s.addText(sub, {
      x: x + 0.22, y: 5.31, w: cw - 0.44, h: 0.7,
      fontFace: FONT, fontSize: 11.5, color: isHuman ? ICE : GRAY, lineSpacing: 16, margin: 0,
    });
  });

  s.addText("최종 확정은 반드시 사람이 한다 — AI가 스스로 배정하지 않는다", {
    x: M, y: 6.5, w: W - M * 2, h: 0.4,
    fontFace: FONT, fontSize: 13.5, bold: true, italic: true, color: NAVY, margin: 0,
  });

  s.addNotes(
    "질의서를 붙여넣으면 AI가 부서 후보 3개를 신뢰도와 함께 제시합니다. 담당자가 그중 하나를 확정하면 답변 초안이 생성되고, 검토·수정 후 저장됩니다. 중요한 건 가운데 단계입니다. AI가 스스로 배정하지 않고 최종 판단은 반드시 사람이 합니다."
  );
}

/* ============ 4. 핵심 기능 ============ */
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  addTitle(s, "핵심 기능 2가지");
  s.addText("기능을 늘리기보다, AI가 지켜야 할 규칙을 숫자로 정하는 데 집중했다", {
    x: M, y: 1.32, w: W - M * 2, h: 0.4,
    fontFace: FONT, fontSize: 14, color: GRAY, margin: 0,
  });

  const feats = [
    {
      no: "01",
      title: "질의서 자동 분류",
      rules: [
        "담당 부서 후보 3개를 신뢰도 점수와 함께 제시",
        "후보 신뢰도가 모두 낮으면 「분류 보류 — 담당자 확인 필요」",
        "과거 서면질의답변서를 근거 자료로 함께 표시",
      ],
    },
    {
      no: "02",
      title: "답변 초안 자동 생성",
      rules: [
        "초안은 500자 이내로 생성",
        "확인이 필요한 수치·개인정보는 「[확인 필요]」 자동 표시",
        "「초안입니다. 검토 후 사용하세요」 문구를 코드로 강제 삽입",
      ],
    },
  ];

  feats.forEach((f, i) => {
    const x = M + i * 6.05;
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.95, w: 5.75, h: 4.5, rectRadius: 0.12,
      fill: { color: WHITE }, line: { color: ICE }, shadow: cardShadow(),
    });
    s.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.4, y: 2.38, w: 0.62, h: 0.62,
      fill: { color: NAVY }, line: { color: NAVY },
    });
    s.addText(f.no, {
      x: x + 0.4, y: 2.38, w: 0.62, h: 0.62,
      fontFace: FONT, fontSize: 15, bold: true, color: WHITE,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(f.title, {
      x: x + 1.15, y: 2.46, w: 4.3, h: 0.45,
      fontFace: FONT, fontSize: 19, bold: true, color: INK, valign: "middle", margin: 0,
    });
    f.rules.forEach((r, j) => {
      const ry = 3.45 + j * 1.0;
      s.addShape(pptx.ShapeType.ellipse, {
        x: x + 0.45, y: ry + 0.14, w: 0.15, h: 0.15,
        fill: { color: GOLD }, line: { color: GOLD },
      });
      s.addText(r, {
        x: x + 0.78, y: ry, w: 4.6, h: 0.8,
        fontFace: FONT, fontSize: 13, color: INK, lineSpacing: 19, margin: 0,
      });
    });
  });

  s.addNotes(
    "기능은 딱 두 가지입니다. 분류와 초안 생성. 대신 AI가 지켜야 할 규칙을 숫자로 못 박았습니다. 후보는 3개, 초안은 500자 이내, 확인이 필요한 수치에는 표시를 붙이고, 검토 안내 문구는 코드에서 강제로 넣습니다. 검토 없이 그대로 나가지 않도록 한 겁니다."
  );
}

/* ============ 5. 어떻게 만들었나 ============ */
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  addTitle(s, "어떻게 만들었나");
  s.addText("기존에 쓰던 구성을 그대로 이어, 배포까지 한 번에 연결되게 했다", {
    x: M, y: 1.32, w: W - M * 2, h: 0.4,
    fontFace: FONT, fontSize: 14, color: GRAY, margin: 0,
  });

  const stack = [
    ["Next.js", "화면과 서버 코드를 한 프로젝트에서 함께 처리"],
    ["Vercel", "실서비스 배포 · main 반영 시 자동 재배포"],
    ["Supabase", "처리한 질의서와 답변 초안 이력 저장"],
    ["OpenAI GPT", "부서 분류 판단과 답변 초안 작성"],
    ["열린국회정보 API", "과거 서면질의답변서 조회"],
    ["pdf-parse · jszip", "PDF · HWPX 파일에서 본문 텍스트 추출"],
  ];
  const cw2 = 4.0;
  const ch2 = 1.78;
  stack.forEach(([name, desc], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = M + col * (cw2 + 0.19);
    const y = 2.15 + row * (ch2 + 0.42);
    s.addShape(pptx.ShapeType.roundRect, {
      x, y, w: cw2, h: ch2, rectRadius: 0.1,
      fill: { color: WHITE }, line: { color: ICE }, shadow: cardShadow(),
    });
    s.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.32, y: y + 0.62, w: 0.46, h: 0.46,
      fill: { color: ICE }, line: { color: ICE },
    });
    s.addText(String(i + 1), {
      x: x + 0.32, y: y + 0.62, w: 0.46, h: 0.46,
      fontFace: FONT, fontSize: 13, bold: true, color: NAVY,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(name, {
      x: x + 0.95, y: y + 0.38, w: cw2 - 1.2, h: 0.38,
      fontFace: FONT, fontSize: 15, bold: true, color: NAVY, margin: 0,
    });
    s.addText(desc, {
      x: x + 0.95, y: y + 0.78, w: cw2 - 1.2, h: 0.75,
      fontFace: FONT, fontSize: 11.5, color: GRAY, lineSpacing: 16, margin: 0,
    });
  });

  s.addNotes(
    "기술 구성입니다. Next.js 하나로 화면과 서버를 만들고 Vercel로 배포했습니다. 이력은 Supabase에 저장하고, 분류와 초안은 OpenAI를 씁니다. 과거 사례는 열린국회정보 API에서 가져와 PDF 본문까지 실제로 뽑아냅니다."
  );
}

/* ============ 6. 현재까지 진행 상황 ============ */
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  addTitle(s, "현재까지 진행 상황");

  const stats = [
    ["배포 완료", "실제 접속 가능한 서비스"],
    ["기능 2개", "분류 · 초안 생성 동작 확인"],
    ["문서 4종", "기획부터 설계까지 문서화"],
  ];
  stats.forEach(([big, sub], i) => {
    const x = M + i * 4.09;
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.5, w: 3.85, h: 1.32, rectRadius: 0.1,
      fill: { color: NAVY }, line: { color: NAVY }, shadow: cardShadow(),
    });
    s.addText(big, {
      x: x + 0.32, y: 1.72, w: 3.2, h: 0.5,
      fontFace: FONT, fontSize: 22, bold: true, color: WHITE, margin: 0,
    });
    s.addText(sub, {
      x: x + 0.32, y: 2.24, w: 3.3, h: 0.35,
      fontFace: FONT, fontSize: 11.5, color: ICE, margin: 0,
    });
  });

  const done = [
    "기획 문서 4종 작성 — 간단 기획서에서 시작해 PRD · 계획 · 설계로 확장",
    "질의서 분류 · 답변 초안 생성 기능 구현, 배포 환경에서 동작 확인",
    "열린국회정보 API 연동 — 과거 서면질의답변서 조회 및 PDF 본문 추출",
    "Supabase 연동 — 확정한 부서와 답변 초안을 처리 이력으로 저장",
    "GitHub · Vercel 연결 — main 브랜치에 반영하면 자동 재배포",
  ];
  done.forEach((t, i) => {
    const y = 3.2 + i * 0.52;
    s.addText("✓", {
      x: M, y, w: 0.35, h: 0.4,
      fontFace: FONT, fontSize: 15, bold: true, color: GOLD, margin: 0,
    });
    s.addText(t, {
      x: M + 0.38, y, w: 11.2, h: 0.4,
      fontFace: FONT, fontSize: 13.5, color: INK, margin: 0,
    });
  });

  s.addShape(pptx.ShapeType.roundRect, {
    x: M, y: 5.95, w: W - M * 2, h: 0.72, rectRadius: 0.1,
    fill: { color: WHITE }, line: { color: NAVY }, shadow: cardShadow(),
  });
  s.addText(
    [
      { text: "서비스 주소   ", options: { fontSize: 12, color: GRAY, bold: true } },
      { text: "assembly-qna.vercel.app", options: { fontSize: 15, color: NAVY, bold: true } },
    ],
    {
      x: M + 0.35, y: 6.06, w: W - M * 2 - 0.7, h: 0.5,
      fontFace: FONT, valign: "middle", margin: 0,
    }
  );

  s.addNotes(
    "현재 상태입니다. 기획 문서를 먼저 쓰고, 두 기능을 구현해서 실제 배포까지 마쳤습니다. 지금 이 주소로 들어가면 바로 쓸 수 있고, 실제로 질의서를 넣어 분류부터 저장까지 되는 것을 확인했습니다."
  );
}

/* ============ 7. 지금의 한계 ============ */
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  addTitle(s, "지금의 한계");
  s.addText("만들면서 확인한, 아직 풀지 못한 문제들", {
    x: M, y: 1.32, w: W - M * 2, h: 0.4,
    fontFace: FONT, fontSize: 14, color: GRAY, margin: 0,
  });

  const limits = [
    [
      "실·국·과 단위 정답 데이터가 없다",
      "열린국회정보가 주는 정보는 부처·위원회 단위까지다. 그 안의 어느 과가 처리했는지는 공개 데이터에 아예 없어서, 지금은 AI 추론에 기대고 있다.",
    ],
    [
      "유사 사례를 글자 겹침으로만 찾는다",
      "제목에 같은 단어가 몇 개 겹치는지 세는 방식이라, 표현이 다르면 관련 있는 사례도 놓친다. 의미를 이해하는 검색이 아니다.",
    ],
    [
      "매 요청마다 외부 자료를 새로 가져온다",
      "미리 모아둔 색인 없이 그때그때 API를 부르고 PDF를 내려받는다. 그래서 결과가 나오기까지 6~10초가 걸린다.",
    ],
  ];
  limits.forEach(([head, body], i) => {
    const y = 2.0 + i * 1.45;
    s.addShape(pptx.ShapeType.roundRect, {
      x: M, y, w: W - M * 2, h: 1.25, rectRadius: 0.1,
      fill: { color: WHITE }, line: { color: ICE }, shadow: cardShadow(),
    });
    addNumCircle(s, i + 1, M + 0.35, y + 0.35, 0.5, GOLD, WHITE);
    s.addText(head, {
      x: M + 1.05, y: y + 0.2, w: 10.2, h: 0.38,
      fontFace: FONT, fontSize: 16, bold: true, color: INK, margin: 0,
    });
    s.addText(body, {
      x: M + 1.05, y: y + 0.6, w: 10.4, h: 0.55,
      fontFace: FONT, fontSize: 12.5, color: GRAY, lineSpacing: 17, margin: 0,
    });
  });

  s.addText("한계를 알고 있다는 것 자체가 다음에 무엇을 할지 정해준다", {
    x: M, y: 6.4, w: W - M * 2, h: 0.4,
    fontFace: FONT, fontSize: 13.5, bold: true, italic: true, color: NAVY, margin: 0,
  });

  s.addNotes(
    "솔직하게 한계도 말씀드리겠습니다. 가장 큰 건 실·국·과 단위 정답 데이터가 공개 데이터에 없다는 점입니다. 그리고 유사 사례를 글자 겹침으로만 찾고 있고, 매번 외부 자료를 새로 가져와서 6에서 10초 정도 걸립니다."
  );
}

/* ============ 8. 추후 고도화 ============ */
{
  const s = pptx.addSlide();
  s.background = { color: NAVY };

  s.addShape(pptx.ShapeType.ellipse, {
    x: 10.35, y: -0.95, w: 2.9, h: 2.9,
    fill: { color: ICE, transparency: 88 }, line: { color: NAVY, transparency: 100 },
  });

  addTitle(s, "추후 고도화할 부분", WHITE);

  const road = [
    [
      "정답 데이터부터 쌓는다",
      "「후보 3개 모두 아님」을 담당자가 남길 수 있게 해서, AI가 틀린 경우를 기록으로 확보한다",
    ],
    [
      "검색 방식을 의미 기반으로 바꾼다",
      "글자 겹침 대신 임베딩을 써서, 표현이 달라도 뜻이 비슷한 과거 사례를 찾도록 한다",
    ],
    [
      "속도와 운영을 다듬는다",
      "과거 자료를 미리 모아 두어 응답 시간을 줄이고, 로그인과 권한 관리를 붙인다",
    ],
  ];
  road.forEach(([head, body], i) => {
    const y = 1.8 + i * 1.5;
    s.addShape(pptx.ShapeType.roundRect, {
      x: M, y, w: W - M * 2, h: 1.22, rectRadius: 0.1,
      fill: { color: NAVY_SOFT }, line: { color: NAVY_SOFT },
    });
    addNumCircle(s, i + 1, M + 0.35, y + 0.34, 0.52, ICE, NAVY);
    s.addText(head, {
      x: M + 1.08, y: y + 0.18, w: 10.2, h: 0.38,
      fontFace: FONT, fontSize: 16.5, bold: true, color: WHITE, margin: 0,
    });
    s.addText(body, {
      x: M + 1.08, y: y + 0.58, w: 10.5, h: 0.52,
      fontFace: FONT, fontSize: 12.5, color: ICE, lineSpacing: 17, margin: 0,
    });
  });

  s.addText("업무에서 느낀 불편을, 실제로 쓸 수 있는 도구로", {
    x: M, y: 6.25, w: W - M * 2, h: 0.5,
    fontFace: FONT, fontSize: 18, bold: true, color: WHITE, margin: 0,
  });

  s.addNotes(
    "앞으로는 세 단계로 보고 있습니다. 먼저 AI가 틀린 경우를 기록으로 남겨 정답 데이터를 쌓고, 그 다음 검색을 의미 기반으로 바꾸고, 마지막으로 속도와 로그인 같은 운영 부분을 다듬으려 합니다. 감사합니다."
  );
}

pptx
  .writeFile({ fileName: "AI활용_국회질의서_자동화_발표자료.pptx" })
  .then((f) => console.log("생성 완료:", f));
