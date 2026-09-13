"""답변서 PDF 구조 확인용 스크립트 (파서 작성 전 탐색 목적)

실행: python scripts/inspect_pdf.py [샘플수]
"""

import json
import sys
from pathlib import Path

import pdfplumber
import requests

ROOT = Path(__file__).resolve().parent.parent
LIST_PATH = ROOT / "data" / "assembly" / "list.json"
PDF_DIR = ROOT / "data" / "assembly" / "pdf"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


def download(url: str, dest: Path) -> Path:
    if dest.exists():
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    res = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=60)
    res.raise_for_status()
    dest.write_bytes(res.content)
    return dest


def main() -> None:
    sample_n = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    data = json.loads(LIST_PATH.read_text(encoding="utf-8"))
    answers = [r for r in data["records"] if r["kind"] == "answer"]

    for rec in answers[:sample_n]:
        print("=" * 78)
        print("제목:", rec["file_cn"])
        print("회의ID:", rec["conf_id"], "| 의원:", rec["member"])
        path = download(rec["down_url"], PDF_DIR / f"{rec['conf_id']}_{abs(hash(rec['down_url'])) % 10**8}.pdf")
        print("파일:", path.name, f"({path.stat().st_size:,} bytes)")

        with pdfplumber.open(path) as pdf:
            print("총 페이지:", len(pdf.pages))

            print("\n--- [1페이지] extract_tables() ---")
            tables = pdf.pages[0].extract_tables()
            print("표 개수:", len(tables))
            for ti, t in enumerate(tables):
                print(f"  표{ti}: {len(t)}행")
                for row in t[:6]:
                    print("   ", row)

            print("\n--- [1페이지] extract_text() 앞 700자 ---")
            print((pdf.pages[0].extract_text() or "")[:700])

            print("\n--- [전체] 담당 부서 패턴 후보 줄 (전화번호 포함 줄) ---")
            for pi, page in enumerate(pdf.pages):
                for line in (page.extract_text() or "").splitlines():
                    if "(0" in line and ")" in line:
                        print(f"  p{pi+1}: {line.strip()}")
        print()


if __name__ == "__main__":
    main()
