"""정규식이 못 잡은 답변서에서 LLM으로 담당 부서를 '추출'할 수 있는지 시험한다.

핵심은 검증이다. LLM에게 부서명과 함께 **근거가 된 원문 줄**을 그대로 옮겨 적게 하고,
그 줄이 실제 PDF 텍스트에 있는지 프로그램으로 대조한다.
  - 원문에 있으면  -> 추출 성공 (검증됨)
  - 원문에 없으면  -> 지어낸 것 (기각)

이렇게 해야 "LLM이 판단한 것"과 "문서에 적혀 있던 것"을 구분할 수 있다.

실행: python scripts/llm_extract_test.py [시험할_문서수]
출력: data/assembly/llm_extract_test.json
"""

import json
import re
import sys
from pathlib import Path

import pdfplumber
import requests

ROOT = Path(__file__).resolve().parent.parent
PARSED_PATH = ROOT / "data" / "assembly" / "parsed_answers.json"
PDF_DIR = ROOT / "data" / "assembly" / "pdf"
OUT_PATH = ROOT / "data" / "assembly" / "llm_extract_test.json"

MODEL = "gpt-4o-mini"
HEAD_CHARS = 3000
TAIL_CHARS = 9000

PROMPT = """아래는 국회 서면질의답변서 PDF에서 뽑아낸 텍스트다.
이 문서에서 '답변을 담당한 부서'(실·국·과 단위)가 적힌 부분을 찾아라.

규칙:
- 문서에 실제로 적혀 있는 것만 답한다. 절대 추측하거나 일반 지식으로 채우지 마라.
- 찾았다면 근거가 된 원문 줄을 토씨 하나 바꾸지 말고 그대로 옮겨라.
- 부처(장관/청장)만 적혀 있고 실·국·과가 없으면 found를 false로 답하라.
- 담당자 연락처 표기(예: "○○과 사무관 홍길동 044-200-0000")가 대표적인 단서다.

아래 JSON 형식으로만 답하라.
{"found": true 또는 false, "departments": [{"name": "부서명", "ministry": "부처명 또는 null", "evidence": "원문 그대로의 줄"}]}

[문서 텍스트]
"""


def load_env(key_name: str) -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8-sig").splitlines():
        if line.startswith(f"{key_name}="):
            v = line.split("=", 1)[1].strip()
            if v:
                return v
    raise SystemExit(f".env에 {key_name}가 없습니다.")


def pdf_path_for(doc: dict) -> Path:
    file_id = doc["down_url"].rsplit("=", 1)[-1]
    return PDF_DIR / f"{doc['conf_id']}_{file_id}.pdf"


def read_pdf_text(path: Path) -> str:
    with pdfplumber.open(path) as pdf:
        return "\n".join((p.extract_text() or "") for p in pdf.pages)


def build_window(text: str) -> str:
    """토큰을 아끼려고 앞부분과 뒷부분만 보낸다(담당자 표기는 주로 문서 말미에 있다)."""
    if len(text) <= HEAD_CHARS + TAIL_CHARS:
        return text
    return text[:HEAD_CHARS] + "\n...(중략)...\n" + text[-TAIL_CHARS:]


def normalize(s: str) -> str:
    """공백·괄호 차이를 무시하고 비교하기 위한 정규화."""
    return re.sub(r"\s+", "", s or "")


# 실·국·과 단위로 볼 수 있는 끝말. '부/청/처'로 끝나면 기관명이라 대상이 아니다.
SUB_DEPARTMENT = re.compile(r"(과|실|국|담당관|관실|계|팀|단)$")


def check_item(name: str, evidence: str, flat_source: str) -> tuple[bool, str]:
    """LLM이 내놓은 부서 하나를 검증한다.

    세 가지를 모두 통과해야 '문서에서 추출한 값'으로 인정한다.
      1) 근거 줄이 원문에 실제로 있는가
      2) 그 근거 줄 안에 부서명이 들어 있는가 (없으면 LLM이 추론한 것)
      3) 실·국·과 단위인가 (부처명만 있으면 이번 목적에 쓸 수 없다)
    """
    if not name or not evidence:
        return False, "부서명 또는 근거 없음"
    if normalize(evidence) not in flat_source:
        return False, "근거 줄이 원문에 없음"
    if normalize(name) not in normalize(evidence):
        return False, "근거 줄에 부서명이 없음(추론)"
    if not SUB_DEPARTMENT.search(name.strip()):
        return False, "실·국·과 단위가 아님(기관명)"
    return True, "통과"


def ask_llm(api_key: str, text: str) -> dict:
    res = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": MODEL,
            "messages": [{"role": "user", "content": PROMPT + build_window(text)}],
            "response_format": {"type": "json_object"},
            "temperature": 0,
        },
        timeout=180,
    )
    if not res.ok:
        raise RuntimeError(f"OpenAI {res.status_code}: {res.text[:200]}")
    return json.loads(res.json()["choices"][0]["message"]["content"])


def main() -> None:
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    api_key = load_env("OPENAI_API_KEY")

    parsed = json.loads(PARSED_PATH.read_text(encoding="utf-8"))
    # 정규식이 부서를 못 찾은 문서만 시험 대상으로 삼는다.
    targets = [
        d for d in parsed["documents"]
        if not any(c.get("department") for c in d["contacts"])
    ]
    print(f"정규식 미검출 문서 {len(targets)}건 중 {limit}건 시험\n")

    results = []
    verified_docs = 0
    rejected = 0

    for i, doc in enumerate(targets[:limit], 1):
        path = pdf_path_for(doc)
        if not path.exists():
            print(f"{i:2}. [건너뜀] PDF 없음: {doc['file_cn'][:36]}")
            continue

        text = read_pdf_text(path)
        flat = normalize(text)

        try:
            answer = ask_llm(api_key, text)
        except Exception as e:
            print(f"{i:2}. [실패] {doc['file_cn'][:36]} - {e}")
            continue

        found = bool(answer.get("found"))
        items = answer.get("departments") or []

        checked = []
        for it in items:
            name = (it.get("name") or "").strip()
            evidence = it.get("evidence") or ""
            ok, reason = check_item(name, evidence, flat)
            checked.append(
                {
                    "name": name,
                    "ministry": it.get("ministry"),
                    "evidence": evidence,
                    "verified": ok,
                    "reason": reason,
                }
            )

        good = [c for c in checked if c["verified"]]
        bad = [c for c in checked if not c["verified"]]
        if good:
            verified_docs += 1
        rejected += len(bad)

        status = "검증됨" if good else ("기각" if bad else "없다고 답함")
        print(f"{i:2}. {status:<10} {doc['file_cn'][:40]}")
        for c in good:
            print(f"      OK  {c['ministry'] or ''} {c['name']}")
            print(f"          근거: {c['evidence'][:62]}")
        for c in bad:
            print(f"      X   {c['name'] or '(이름없음)'}  <- {c['reason']}")

        results.append(
            {
                "file_cn": doc["file_cn"],
                "down_url": doc["down_url"],
                "llm_found": found,
                "departments": checked,
            }
        )

    total_items = sum(len(r["departments"]) for r in results)
    verified_items = sum(1 for r in results for d in r["departments"] if d["verified"])

    OUT_PATH.write_text(
        json.dumps({"results": results}, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print("\n=== 결과 ===")
    print(f"  시험 문서            : {len(results)}건")
    print(f"  부서를 찾아낸 문서    : {verified_docs}건 (원문 대조 통과)")
    print(f"  LLM이 제시한 부서 수  : {total_items}개")
    print(f"    검증 통과          : {verified_items}개")
    print(f"    기각(지어냄)       : {rejected}개")
    print(f"저장: {OUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
