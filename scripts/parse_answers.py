"""2단계 — 답변서 PDF 파싱 (헤더 / 본문 / 담당 부서를 각각 다른 방식으로 추출)

영역별로 추출 방식을 달리한다.
  2-1 헤더      : 1페이지 표 구조 -> extract_tables()
  2-2 본문      : extract_text()
  2-3 담당 부서 : 본문에서 담당자 표기 줄을 정규식으로 수집

실행: python scripts/parse_answers.py
출력: data/assembly/parsed_answers.json
"""

import json
import re
from pathlib import Path

import pdfplumber
import requests

ROOT = Path(__file__).resolve().parent.parent
LIST_PATH = ROOT / "data" / "assembly" / "list.json"
PDF_DIR = ROOT / "data" / "assembly" / "pdf"
OUT_PATH = ROOT / "data" / "assembly" / "parsed_answers.json"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

# ---- 2-3에서 쓰는 패턴들 --------------------------------------------------
# 지역번호가 있는 일반 전화번호 (044-200-5267)
PHONE = re.compile(r"\d{2,4}-\d{3,4}-\d{4}")
# 지역번호 없이 적힌 내선번호 (3150-2622, 700-5510).
# 연도 범위("2018-2026")도 같은 모양이라, '담당' 표기나 직위가 같은 줄에 있을 때만 쓴다.
EXTENSION = re.compile(r"\d{3,4}-\d{4}")
# 부처/청 등 기관명
MINISTRY = re.compile(r"[가-힣]{2,8}(?:부|청|처|위원회|실)(?=\s|$|[,)\]])")
# 실·국·과 등 내부 조직명 (예: 법무심의관실, 선거기반과, 해양공간정책과, 운영지원과장)
DEPARTMENT = re.compile(r"[가-힣]{2,12}(?:관실|담당관|과장|과|실|국|단|팀)(?=\s|$|[,)\]])")
# 직위 (경찰 계급도 담당자 표기에 쓰인다)
TITLE = re.compile(
    r"(장관|차관|실장|국장|과장|팀장|사무관|행정사무관|주무관|서기관|법무관|담당관"
    r"|연구사|연구관|조사관|총경|경정|경감|경무관|사무처장)"
)
# 문항 시작. 접두어가 붙은 형태("질의 1.")와 번호만 있는 형태("1.")를 구분해서 잡는다.
QUESTION_LABELED = re.compile(r"^\s*(?:질의|질문|문)\s*(\d{1,2})\s*[.)]\s*")
QUESTION_BARE = re.compile(r"^\s*(\d{1,2})\s*[.)]\s+\S")


def clean_text(s: str | None) -> str | None:
    """PDF에서 뽑은 텍스트에 섞여 있는 NUL·제어문자를 제거한다.

    Postgres의 text 타입은 NUL(\\u0000)을 저장할 수 없어 적재 단계에서 막힌다.
    """
    if s is None:
        return None
    # 탭/줄바꿈은 남기고 나머지 제어문자만 제거한다.
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", s)


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


# ---- 2-1. 헤더 (1페이지 표) ----------------------------------------------
def parse_header(page) -> dict:
    """1페이지 표에서 질문의원명 / 소속 / 질문대상자를 뽑는다.

    표 구조이므로 extract_tables()를 쓴다. extract_text()로 읽으면
    셀 경계가 사라져 '질문의원명김은혜소속국민의힘'처럼 붙을 수 있다.
    """
    header = {"member_name": None, "party": None, "target": None}
    for table in page.extract_tables() or []:
        for row in table:
            cells = [(c or "").replace("\n", " ").strip() for c in row]
            for i, cell in enumerate(cells):
                key = cell.replace(" ", "")
                value = cells[i + 1].strip() if i + 1 < len(cells) else ""
                if not value:
                    continue
                if key == "질문의원명" and not header["member_name"]:
                    # '우원식의원'처럼 접미사가 붙어 나오는 경우가 있어 정규화한다.
                    header["member_name"] = clean_text(re.sub(r"\s*의원$", "", value).strip())
                elif key == "소속" and not header["party"]:
                    header["party"] = clean_text(value)
                elif key == "질문대상자" and not header["target"]:
                    header["target"] = clean_text(value)
    return header


# ---- 2-2. 본문 ------------------------------------------------------------
def parse_body(pdf) -> list[tuple[int, str]]:
    """페이지별 본문 텍스트를 (페이지번호, 텍스트)로 돌려준다."""
    return [(i + 1, clean_text(page.extract_text()) or "") for i, page in enumerate(pdf.pages)]


# ---- 2-3. 담당 부서 -------------------------------------------------------
def parse_contacts(pages: list[tuple[int, str]]) -> list[dict]:
    """본문에서 담당자 표기 줄을 찾아 기관/부서/직위/이름/전화를 추출한다.

    실제 문서에서 확인된 표기 형태가 제각각이라 한 가지 정규식으로는 잡히지 않는다.
      - 법무부 법무심의관실 법무관 황우식(02-2110-3734)
      - (선거기반과 행정사무관 최아영 02-3294-8375)
      - < 운영지원과장 이태주 044-203-6110 >
      - * 담당자: 김주애 연구사(043-719-6823), ...
      - (담당자 : 해양수산부 해양공간정책과 곽재욱 사무관, 044-200-5267
    그래서 '전화번호가 있는 줄'을 후보로 잡고, 그 줄 안에서 각 요소를 따로 찾는다.
    """
    contacts = []
    for page_no, text in pages:
        for line in text.splitlines():
            line = line.strip()

            # 괄호/기호를 걷어낸 뒤 요소를 찾는다.
            cleaned = re.sub(r"[<>*\[\]]", " ", line)
            ministry = MINISTRY.search(cleaned)
            department = DEPARTMENT.search(cleaned)
            title = TITLE.search(cleaned)

            phones = PHONE.findall(line)
            if not phones:
                # 내선번호만 적힌 줄은 연도 범위와 모양이 같아,
                # '담당' 표기나 직위가 함께 있을 때만 담당자 표기로 인정한다.
                if not ("담당" in line or title):
                    continue
                phones = EXTENSION.findall(line)
                if not phones:
                    continue

            # 부서도 직위도 없으면 담당자 표기로 보기 어렵다.
            if not department and not title:
                continue

            dept_name = pick_department(cleaned)

            contacts.append(
                {
                    "page": page_no,
                    "ministry": ministry.group(0) if ministry else None,
                    "department": dept_name,
                    "title": title.group(0) if title else None,
                    "phone": phones[0],
                    "raw": line,
                }
            )
    return contacts


def pick_department(line: str) -> str | None:
    """한 줄에서 가장 구체적인 조직명을 고른다.

    "사회문화협력국 이산가족납북자과 과장 조용식" 처럼 국과 과가 함께 적히는 경우가 있는데,
    분류에 쓸모 있는 쪽은 더 작은 단위인 '과'다. 그래서 과·담당관·관실을 우선한다.
    """
    matches = [m.group(0) for m in DEPARTMENT.finditer(line)]
    if not matches:
        return None

    # '운영지원과장'처럼 부서명과 직위가 붙은 경우 직위 글자를 떼어낸다.
    cleaned = [m[:-1] if m.endswith("과장") else m for m in matches]
    cleaned = [c for c in cleaned if c and c not in ("담당관",)]
    if not cleaned:
        return None

    specific = [c for c in cleaned if c.endswith(("과", "담당관", "관실", "팀", "계"))]
    return (specific or cleaned)[-1] if specific else cleaned[0]


BODY_MAX_LENGTH = 4000


def _head_key(line: str) -> str:
    """문항 머리글에서 번호를 떼고 비교용 문구만 남긴다."""
    body = re.sub(r"^\s*(?:질의|질문|문)?\s*\d{1,2}\s*[.)]\s*", "", line)
    return re.sub(r"\s+", "", body)


def _same_question(a: str, b: str, n: int = 12) -> bool:
    """같은 문항을 가리키는 머리글인지 앞부분 문구로 판단한다."""
    if not a or not b:
        return False
    return a.startswith(b[:n]) or b.startswith(a[:n])


def _find_question_heads(flat: list[tuple[int, str]]) -> list[tuple[int, int]]:
    """문항 시작 줄을 (줄 인덱스, 문항 번호)로 골라낸다.

    이 문서들은 대체로 이런 구조다.
      앞부분: 질문 목록 (1. ~ N.)
      뒷부분: 문항별 답변 — 각 답변이 "N. 질문 재기술"로 다시 시작한다.

    번호만 보고 1씩 증가하는 시퀀스로 자르면 앞의 질문 목록만 잡히고
    답변이 통째로 마지막 문항에 뭉쳐 들어가 잘려나간다(실측: 26쪽 문서의
    답변이 전부 사라졌다). 답변 구간은 번호가 순서대로 나오지도 않는다.

    그래서 두 단계로 찾는다.
      1) 1씩 증가하는 첫 시퀀스로 문항 번호와 '대표 문구'를 확보한다.
      2) 그 뒤 구간에서 같은 번호 + 같은 문구로 시작하는 줄을 답변 시작으로 본다.
         문구까지 대조하므로 답변 안의 단순 목록 번호는 걸러진다.
    """
    labeled = [(i, int(m.group(1)), ln)
               for i, (_, ln) in enumerate(flat)
               if (m := QUESTION_LABELED.match(ln))]
    candidates = labeled or [
        (i, int(m.group(1)), ln)
        for i, (_, ln) in enumerate(flat)
        if (m := QUESTION_BARE.match(ln))
    ]
    if not candidates:
        return []

    # 1) 질문 목록 (1씩 증가하는 첫 시퀀스)
    primary: list[tuple[int, int, str]] = []
    expected = 1
    for idx, no, line in candidates:
        if no == expected:
            primary.append((idx, no, line))
            expected += 1
    if not primary:
        return []

    known = {no: _head_key(line) for _, no, line in primary}
    last_primary_idx = primary[-1][0]

    heads = [(idx, no) for idx, no, _ in primary]

    # 2) 답변 구간 — 번호와 문구가 모두 맞는 줄만 문항 시작으로 인정한다.
    for idx, no, line in candidates:
        if idx <= last_primary_idx:
            continue
        if no in known and _same_question(_head_key(line), known[no]):
            heads.append((idx, no))

    heads.sort()
    return heads


def split_questions(pages: list[tuple[int, str]], contacts: list[dict]) -> list[dict]:
    """본문을 문항 단위로 쪼개고, 각 문항 구간에 있는 담당자를 붙인다.

    같은 번호가 여러 번 나오면(질문 목록 + 답변) 하나로 합친다.
    그래야 참고자료에 '질문만' 담기는 일이 없다.
    """
    # (페이지, 줄) 순서대로 평탄화
    flat: list[tuple[int, str]] = []
    for page_no, text in pages:
        for line in text.splitlines():
            flat.append((page_no, line.rstrip()))

    heads = _find_question_heads(flat)

    merged: dict[int, dict] = {}
    for order, (start, no) in enumerate(heads):
        end = heads[order + 1][0] if order + 1 < len(heads) else len(flat)
        chunk = flat[start:end]
        lines = [ln.strip() for _, ln in chunk]

        block = merged.get(no)
        if block is None:
            merged[no] = {
                "no": no,
                "start_page": chunk[0][0],
                "end_page": chunk[-1][0],
                "lines": lines,
            }
        else:
            # 질문 목록과 답변을 같은 문항으로 이어 붙인다.
            block["lines"].extend(lines)
            block["end_page"] = chunk[-1][0]

    blocks = [merged[no] for no in sorted(merged)]

    # 각 문항 블록 안에 들어 있는 담당자 줄을 매칭한다.
    for b in blocks:
        body = "\n".join(b["lines"]).strip()
        b["text"] = body[:BODY_MAX_LENGTH]
        b["contacts"] = [c for c in contacts if c["raw"] in body]
        del b["lines"]
    return blocks


def decide_label_source(contacts: list[dict], header: dict) -> str:
    """이 문서에서 확보 가능한 라벨 수준을 표시한다."""
    if any(c["department"] for c in contacts):
        return "department"  # 실·국·과 단위 확보
    if header.get("target"):
        return "target_only"  # 기관(피질의 기관) 단위만 확보
    return "none"


def main() -> None:
    data = json.loads(LIST_PATH.read_text(encoding="utf-8"))
    answers = [r for r in data["records"] if r["kind"] == "answer"]

    results = []
    failures = []
    for i, rec in enumerate(answers, 1):
        try:
            path = download(rec["down_url"], pdf_path_for(rec))
            with pdfplumber.open(path) as pdf:
                header = parse_header(pdf.pages[0])
                pages = parse_body(pdf)
                contacts = parse_contacts(pages)
                questions = split_questions(pages, contacts)
                page_count = len(pdf.pages)
        except Exception as e:
            failures.append({"file_cn": rec["file_cn"], "error": str(e)})
            print(f"{i:2}. [실패] {rec['file_cn'][:40]} - {e}")
            continue

        results.append(
            {
                "conf_id": rec["conf_id"],
                "conf_dt": rec["conf_dt"],
                "file_cn": rec["file_cn"],
                "member": rec["member"],
                "down_url": rec["down_url"],
                "pages": page_count,
                "header": header,
                "questions": questions,
                "contacts": contacts,
                "label_source": decide_label_source(contacts, header),
            }
        )
        print(
            f"{i:2}. 헤더{'O' if header['target'] else 'X'} "
            f"문항{len(questions):<3} 담당자{len(contacts):<3} "
            f"[{results[-1]['label_source']}] {rec['file_cn'][:34]}"
        )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(
            {"count": len(results), "failures": failures, "documents": results},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\n저장: {OUT_PATH.relative_to(ROOT)} ({len(results)}건, 실패 {len(failures)}건)")


if __name__ == "__main__":
    main()
