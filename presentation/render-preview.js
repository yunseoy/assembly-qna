// 발표 자료 PDF를 슬라이드별 PNG로 렌더링 (시각 검수용)
const fs = require("fs");
const path = require("path");

async function run() {
  const { createRequire } = require("module");
  const req = createRequire(path.resolve("..", "package.json"));
  const { PDFParse } = req("pdf-parse");
  const { pathToFileURL } = require("url");
  const { getPath } = req("pdf-parse/worker");
  PDFParse.setWorker(pathToFileURL(getPath()).href);

  const pdf = fs.readdirSync(".").find((f) => f.endsWith(".pdf"));
  if (!pdf) throw new Error("PDF 파일을 찾지 못했습니다.");

  const parser = new PDFParse({ data: fs.readFileSync(pdf) });
  const result = await parser.getScreenshot({ scale: 1.4 });
  await parser.destroy();

  const pages = result.pages || [];
  pages.forEach((p, i) => {
    const b64 = (p.dataUrl || "").split(",")[1];
    if (!b64) return;
    const out = path.join(".", `slide-${String(i + 1).padStart(2, "0")}.png`);
    fs.writeFileSync(out, Buffer.from(b64, "base64"));
    console.log("wrote", out);
  });
  console.log("총 페이지:", pages.length);
}

run().catch((e) => console.error("오류:", e.message));
