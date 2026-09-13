"""대수별 답변서 PDF를 샘플링해 텍스트 추출 가능 여부를 실측한다.

오래된 문서는 스캔 이미지일 수 있어, 대수를 넓히기 전에 실제로 글자가 뽑히는지 확인한다.

실행: python scripts/sample_eras.py [대수당_샘플수]
"""

import io
import re
import sys
from collections import defaultdict

import pdfplumber
import requests

from collect_assembly import USER_AGENT, classify_kind, fetch_all, load_api_key

# 한글이 실제로 뽑혔는지 보는 기준
HANGUL = re.compile(r"[가-힣]")
PHONE = re.compile(r"\d{2,4}-\d{3,4}-\d{4}")


def era_num(era: str) -> int:
    m = re.search(r"\d+", era or "")
    return int(m.group()) if m else 0


def probe(url: str) -> dict:
    """PDF를 받아 텍스트 추출 결과를 요약한다 (디스크에 저장하지 않는다)."""
    res = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=90)
    res.raise_for_status()
    size = len(res.content)

    with pdfplumber.open(io.BytesIO(res.content)) as pdf:
        pages = len(pdf.pages)
        # 앞 3페이지만 본다 (전체를 읽으면 오래 걸린다)
        text = "\n".join((p.extract_text() or "") for p in pdf.pages[:3])

    hangul = len(HANGUL.findall(text))
    return {
        "size_kb": size // 1024,
        "pages": pages,
        "chars": len(text),
        "hangul": hangul,
        "phone": bool(PHONE.search(text)),
        # 3페이지에서 한글이 100자도 안 나오면 스캔본으로 본다.
        "scanned": hangul < 100,
    }


def main() -> None:
    per_era = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    key = load_api_key()
    print("목록 수집 중...\n")
    rows = fetch_all(key)

    by_era = defaultdict(list)
    for r in rows:
        if classify_kind(r.get("FILE_CN", "")) == "answer":
            by_era[r.get("ERACO") or "(없음)"].append(r)

    print(f"\n{'대수':<7}{'샘플':>5}{'페이지':>7}{'한글자수':>9}{'전화':>5}  판정")
    print("-" * 60)

    for era in sorted(by_era, key=era_num, reverse=True):
        samples = by_era[era][:per_era]
        for r in samples:
            try:
                info = probe(r["DOWN_URL"])
            except Exception as e:
                print(f"{era:<7}{'-':>5}{'-':>7}{'-':>9}{'-':>5}  실패: {str(e)[:28]}")
                continue
            verdict = "스캔본(추출불가)" if info["scanned"] else "텍스트 OK"
            print(
                f"{era:<7}{info['size_kb']:>4}KB{info['pages']:>7}{info['hangul']:>9}"
                f"{'O' if info['phone'] else 'X':>5}  {verdict}"
            )


if __name__ == "__main__":
    main()
