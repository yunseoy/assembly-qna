"""답변서 31건 전체를 훑어 담당 부서 패턴 출현율을 조사한다 (파서 설계용).

실행: python scripts/scan_patterns.py
"""

import json
import re
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

# 전화번호를 넓게 잡는다 (02-123-4567, 044-200-1234, 010-1234-5678 등)
PHONE = re.compile(r"\(?\d{2,4}-\d{3,4}-\d{4}\)?")
# 담당자 표기에 자주 쓰이는 직위
TITLES = ["장관", "차관", "실장", "국장", "과장", "팀장", "사무관", "주무관", "서기관", "법무관", "담당관"]


def download(url: str, dest: Path) -> Path:
    if dest.exists():
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    res = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=60)
    res.raise_for_status()
    dest.write_bytes(res.content)
    return dest


def pdf_path_for(rec: dict) -> Path:
    file_id = rec["down_url"].rsplit("=", 1)[-1]
    return PDF_DIR / f"{rec['conf_id']}_{file_id}.pdf"


def main() -> None:
    data = json.loads(LIST_PATH.read_text(encoding="utf-8"))
    answers = [r for r in data["records"] if r["kind"] == "answer"]

    stat_phone = 0
    stat_title = 0
    stat_both = 0
    samples: list[str] = []

    print(f"답변서 {len(answers)}건 조사 시작\n")
    for i, rec in enumerate(answers, 1):
        try:
            path = download(rec["down_url"], pdf_path_for(rec))
            with pdfplumber.open(path) as pdf:
                pages = len(pdf.pages)
                text = "\n".join((p.extract_text() or "") for p in pdf.pages)
        except Exception as e:  # 다운로드/파싱 실패도 통계에 남긴다
            print(f"{i:2}. [실패] {rec['file_cn'][:40]} - {e}")
            continue

        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        phone_lines = [ln for ln in lines if PHONE.search(ln)]
        title_lines = [ln for ln in lines if any(t in ln for t in TITLES)]
        both = [ln for ln in phone_lines if any(t in ln for t in TITLES)]

        if phone_lines:
            stat_phone += 1
        if title_lines:
            stat_title += 1
        if both:
            stat_both += 1
            samples.extend(both[:2])

        print(
            f"{i:2}. p{pages:<3} 전화{len(phone_lines):<3} 직위{len(title_lines):<4} "
            f"전화+직위{len(both):<3} | {rec['file_cn'][:38]}"
        )

    print("\n=== 요약 ===")
    print(f"  전화번호 포함 문서      : {stat_phone}/{len(answers)}")
    print(f"  직위 단어 포함 문서     : {stat_title}/{len(answers)}")
    print(f"  전화+직위 동시 포함 문서: {stat_both}/{len(answers)}  <- 담당부서 패턴 후보")

    print("\n=== '전화+직위' 줄 샘플 (최대 15개) ===")
    for s in samples[:15]:
        print("  ", s)


if __name__ == "__main__":
    main()
