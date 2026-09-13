"""3단계 — 파싱 결과 검증 리포트

실행: python scripts/validate_parsed.py
"""

import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIST_PATH = ROOT / "data" / "assembly" / "list.json"
PARSED_PATH = ROOT / "data" / "assembly" / "parsed_answers.json"


def main() -> None:
    lst = json.loads(LIST_PATH.read_text(encoding="utf-8"))
    parsed = json.loads(PARSED_PATH.read_text(encoding="utf-8"))
    docs = parsed["documents"]

    print("=" * 66)
    print("1단계 — 수집")
    print("=" * 66)
    c = lst["counts"]
    print(f"  대상 대수        : {', '.join(lst.get('eras', []))}")
    print(f"  전체             : {c['total']}건")
    print(f"  답변서           : {c['answers']}건")
    print(f"  질의서           : {c['questions']}건")
    print(f"  페어링 성공      : {c['paired']}쌍")
    print(f"  페어링 실패      : {c['unpaired']}건")
    reasons = Counter(u["reason"] for u in lst["unpaired"])
    for r, n in reasons.items():
        print(f"      - {r}: {n}건")

    print()
    print("=" * 66)
    print("2단계 — 파싱")
    print("=" * 66)
    print(f"  파싱 성공        : {len(docs)}건 / 실패 {len(parsed['failures'])}건")

    # 2-1 헤더
    h_name = sum(1 for d in docs if d["header"]["member_name"])
    h_party = sum(1 for d in docs if d["header"]["party"])
    h_target = sum(1 for d in docs if d["header"]["target"])
    print("\n  [2-1] 헤더 (extract_tables)")
    print(f"      질문의원명   : {h_name}/{len(docs)}")
    print(f"      소속(정당)   : {h_party}/{len(docs)}")
    print(f"      질문대상자   : {h_target}/{len(docs)}")

    # 헤더 교차검증: 목록 제목에서 뽑은 의원명과 표에서 뽑은 의원명이 같은지
    mismatch = [
        d for d in docs
        if d["member"] and d["header"]["member_name"]
        and d["member"].replace(" ", "") != d["header"]["member_name"].replace(" ", "")
    ]
    print(f"      목록 제목 의원명과 불일치: {len(mismatch)}건")
    for d in mismatch[:5]:
        print(f"        - 목록 '{d['member']}' vs 표 '{d['header']['member_name']}'")

    # 2-2/2-3 담당자
    with_contact = [d for d in docs if d["contacts"]]
    with_dept = [d for d in docs if any(c["department"] for c in d["contacts"])]
    print("\n  [2-3] 담당 부서")
    print(f"      담당자 줄 발견 : {len(with_contact)}/{len(docs)}건")
    print(f"      부서명 추출    : {len(with_dept)}/{len(docs)}건")

    src = Counter(d["label_source"] for d in docs)
    print("\n  라벨 확보 수준")
    for k, label in [
        ("department", "실·국·과 단위"),
        ("target_only", "기관 단위만(질문대상자)"),
        ("none", "확보 실패"),
    ]:
        print(f"      {label:<24}: {src.get(k, 0)}건")

    # 문항 분할 품질 점검
    print("\n  [문항 분할] 품질 점검")
    counts = [len(d["questions"]) for d in docs]
    counts_sorted = sorted(counts, reverse=True)
    print(f"      문항 수 합계   : {sum(counts)}개")
    print(f"      문서당 최대/중앙/최소: {counts_sorted[0]} / {counts_sorted[len(counts)//2]} / {counts_sorted[-1]}")
    suspicious = [d for d in docs if len(d["questions"]) > 20]
    print(f"      20개 초과 문서 : {len(suspicious)}건  <- 번호 오탐 의심")
    for d in suspicious[:5]:
        print(f"        - {len(d['questions']):>3}개 | {d['file_cn'][:44]}")

    zero_q = [d for d in docs if not d["questions"]]
    print(f"      문항 0개 문서  : {len(zero_q)}건")
    for d in zero_q[:5]:
        print(f"        - {d['file_cn'][:50]}")

    # 문항에 담당자가 붙은 비율
    total_q = sum(counts)
    q_with_contact = sum(1 for d in docs for q in d["questions"] if q["contacts"])
    print(f"      담당자 붙은 문항: {q_with_contact}/{total_q}개")

    # 담당자 원문 샘플
    print("\n  담당자 추출 결과 샘플")
    shown = 0
    for d in docs:
        for ct in d["contacts"]:
            if shown >= 10:
                break
            print(f"      기관={ct['ministry']} 부서={ct['department']} 직위={ct['title']}")
            print(f"        raw: {ct['raw'][:72]}")
            shown += 1
        if shown >= 10:
            break


if __name__ == "__main__":
    main()
