"""1단계 — 열린국회정보 서면질의답변서 목록 수집 (제21~22대)

- 목록 API를 페이징하며 전량 수집한 뒤 대상 대수만 걸러낸다.
  (ERACO 요청 파라미터는 서버에서 동작하지 않아 클라이언트에서 필터링한다.)
- 제20대 이하는 정부조직 개편으로 부처·부서명이 현재와 달라 제외한다.
  제15대 이전은 PDF가 스캔 이미지라 텍스트 추출 자체가 불가능하다(실측 확인).
- FILE_CN에 "답변"이 포함되면 답변서, 아니면 질의서로 구분한다.
- 같은 CONF_ID + 의원명으로 질의서-답변서를 페어링하고,
  실패한 건은 버리지 않고 unpaired로 남긴다.

실행: python scripts/collect_assembly.py
출력: data/assembly/list.json
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

import requests

ENDPOINT = "https://open.assembly.go.kr/portal/openapi/VCONFATTQNALIST"
# open.assembly.go.kr는 기본 User-Agent 요청을 차단하므로 브라우저처럼 보이는 값을 쓴다.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)
TARGET_ERAS = ["제22대", "제21대"]
PAGE_SIZE = 1000

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "assembly"


def load_api_key() -> str:
    """.env에서 ASSEMBLY_API_KEY를 읽는다 (값은 출력하지 않는다)."""
    env_path = ROOT / ".env"
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("ASSEMBLY_API_KEY="):
            key = line.split("=", 1)[1].strip()
            if key:
                return key
    raise SystemExit(".env에 ASSEMBLY_API_KEY가 없습니다.")


def fetch_page(key: str, p_index: int) -> tuple[int, list[dict]]:
    """목록 API 한 페이지를 가져와 (전체 건수, row 목록)을 돌려준다."""
    res = requests.get(
        ENDPOINT,
        params={"KEY": key, "Type": "json", "pIndex": p_index, "pSize": PAGE_SIZE},
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    res.raise_for_status()
    data = res.json()

    # 데이터가 없으면 {"RESULT": {...}} 형태로만 돌아온다.
    if "VCONFATTQNALIST" not in data:
        return 0, []

    body = data["VCONFATTQNALIST"]
    total = body[0]["head"][0]["list_total_count"]
    rows = body[1].get("row", [])
    return total, rows


def fetch_all(key: str) -> list[dict]:
    """list_total_count를 보고 필요한 페이지를 모두 가져온다."""
    total, rows = fetch_page(key, 1)
    if total == 0:
        return []

    collected = list(rows)
    pages = (total + PAGE_SIZE - 1) // PAGE_SIZE
    for p in range(2, pages + 1):
        _, more = fetch_page(key, p)
        if not more:
            break
        collected.extend(more)
        print(f"  {p}/{pages} 페이지 수집 ({len(collected)}건 누적)")

    print(f"전체 {total}건 중 {len(collected)}건 수집")
    return collected


def extract_member(file_cn: str) -> str | None:
    """제목 끝의 (홍길동 의원) 형태에서 의원명을 뽑는다."""
    m = re.search(r"\(([^()]{2,10}?)\s*의원\)", file_cn or "")
    if m:
        return m.group(1).strip()
    return None


def classify_kind(file_cn: str) -> str:
    """FILE_CN에 '답변'이 있으면 답변서, 없으면 질의서로 본다."""
    return "answer" if "답변" in (file_cn or "") else "question"


def build_records(rows: list[dict]) -> list[dict]:
    """대상 대수 행만 남기고 구분·의원명을 붙인다."""
    records = []
    for r in rows:
        if r.get("ERACO") not in TARGET_ERAS:
            continue
        file_cn = r.get("FILE_CN", "")
        records.append(
            {
                "conf_id": r.get("CONF_ID"),
                "conf_knd": r.get("CONF_KND"),
                "eraco": r.get("ERACO"),
                "sess": r.get("SESS"),
                "dgr": r.get("DGR"),
                "conf_dt": r.get("CONF_DT"),
                "file_knd": r.get("FILE_KND"),
                "file_cn": file_cn,
                "down_url": r.get("DOWN_URL"),
                "kind": classify_kind(file_cn),
                "member": extract_member(file_cn),
            }
        )
    return records


def pair_records(records: list[dict]) -> tuple[list[dict], list[dict]]:
    """CONF_ID + 의원명으로 질의서-답변서를 짝지어 준다."""
    questions = [r for r in records if r["kind"] == "question"]
    answers = [r for r in records if r["kind"] == "answer"]

    # 질의서를 (conf_id, member) 키로 모아둔다. 같은 키가 여러 건일 수 있어 리스트로 담는다.
    q_index: dict[tuple, list[dict]] = {}
    for q in questions:
        q_index.setdefault((q["conf_id"], q["member"]), []).append(q)

    paired = []
    used_q_ids = set()
    unpaired_answers = []

    for a in answers:
        bucket = q_index.get((a["conf_id"], a["member"]), [])
        match = next((q for q in bucket if id(q) not in used_q_ids), None)
        if match is None:
            unpaired_answers.append(a)
            continue
        used_q_ids.add(id(match))
        paired.append({"answer": a, "question": match})

    unpaired_questions = [q for q in questions if id(q) not in used_q_ids]

    unpaired = [{"reason": "답변서만 있음", "record": a} for a in unpaired_answers]
    unpaired += [{"reason": "질의서만 있음", "record": q} for q in unpaired_questions]
    return paired, unpaired


def main() -> None:
    key = load_api_key()
    print("목록 API 수집 중...")
    rows = fetch_all(key)

    records = build_records(rows)
    answers = [r for r in records if r["kind"] == "answer"]
    questions = [r for r in records if r["kind"] == "question"]
    paired, unpaired = pair_records(records)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / "list.json"
    out_path.write_text(
        json.dumps(
            {
                "eras": TARGET_ERAS,
                "counts": {
                    "total": len(records),
                    "answers": len(answers),
                    "questions": len(questions),
                    "paired": len(paired),
                    "unpaired": len(unpaired),
                },
                "records": records,
                "paired": paired,
                "unpaired": unpaired,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print(f"=== 수집 결과 ({', '.join(TARGET_ERAS)}) ===")
    by_era = Counter(r["eraco"] for r in records)
    for era in TARGET_ERAS:
        era_recs = [r for r in records if r["eraco"] == era]
        era_ans = sum(1 for r in era_recs if r["kind"] == "answer")
        print(f"  {era}      : {by_era[era]}건 (답변서 {era_ans})")
    print(f"  전체        : {len(records)}건")
    print(f"  답변서      : {len(answers)}건  <- 파싱 대상")
    print(f"  질의서      : {len(questions)}건")
    print(f"  페어링 성공 : {len(paired)}쌍")
    print(f"  페어링 실패 : {len(unpaired)}건")
    print(f"저장: {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
