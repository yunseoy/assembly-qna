"""대수별 수집 가능 규모 조사 (확장 여부 판단용)

실행: python scripts/survey_eras.py
"""

import re
from collections import defaultdict

from collect_assembly import fetch_all, load_api_key, classify_kind


def era_sort_key(era: str) -> int:
    """'제22대' -> 22 (정렬용)"""
    m = re.search(r"\d+", era or "")
    return int(m.group()) if m else 0


def main() -> None:
    key = load_api_key()
    print("전체 목록 수집 중...\n")
    rows = fetch_all(key)

    stats = defaultdict(lambda: {"answer": 0, "question": 0, "min_dt": "", "max_dt": ""})
    for r in rows:
        era = r.get("ERACO") or "(없음)"
        kind = classify_kind(r.get("FILE_CN", ""))
        s = stats[era]
        s[kind] += 1
        dt = r.get("CONF_DT") or ""
        if dt:
            s["min_dt"] = min(s["min_dt"], dt) if s["min_dt"] else dt
            s["max_dt"] = max(s["max_dt"], dt) if s["max_dt"] else dt

    print(f"{'대수':<8}{'전체':>7}{'답변서':>8}{'질의서':>8}   기간")
    print("-" * 62)
    total_a = total_q = 0
    for era in sorted(stats, key=era_sort_key, reverse=True):
        s = stats[era]
        tot = s["answer"] + s["question"]
        total_a += s["answer"]
        total_q += s["question"]
        print(
            f"{era:<8}{tot:>7}{s['answer']:>8}{s['question']:>8}   "
            f"{s['min_dt']} ~ {s['max_dt']}"
        )
    print("-" * 62)
    print(f"{'합계':<8}{total_a + total_q:>7}{total_a:>8}{total_q:>8}")
    print()
    print(f"제22대 외 답변서(추가 수집 대상): {total_a - stats.get('제22대', {}).get('answer', 0)}건")


if __name__ == "__main__":
    main()
