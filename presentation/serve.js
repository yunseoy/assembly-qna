// 발표 자료 HTML을 브라우저에서 확인하기 위한 간단한 정적 서버
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 4123;
const ROOT = __dirname;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".pdf": "application/pdf",
};

http
  .createServer((req, res) => {
    let name = decodeURIComponent(req.url.split("?")[0]);
    if (name === "/") name = "/발표자료.html";
    const file = path.join(ROOT, name);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
      res.writeHead(404);
      return res.end("not found");
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log("발표자료 서버: http://localhost:" + PORT));
