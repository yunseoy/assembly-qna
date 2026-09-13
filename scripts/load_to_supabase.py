"""수집·파싱 결과를 Supabase에 적재한다.

적재 순서 (외래키 때문에 순서가 중요하다)
  1) assembly_documents  <- list.json          (103건)
  2) assembly_answers    <- parsed_answers.json   (31건)
  3) assembly_questions  <- parsed_answers.json   (260건)
  4) assembly_contacts   <- parsed_answers.json   (94건)

여러 번 실행해도 안전하도록 만들었다.
  - documents / answers / questions : unique 제약을 이용한 upsert
  - contacts : unique 키가 없어, 해당 답변서의 기존 행을 지우고 다시 넣는다

실행: python scripts/load_to_supabase.py
"""

import json
import re
from pathlib import Path

import requests

# Postgres의 text 타입은 NUL()을 저장할 수 없다. PDF에서 뽑은 텍스트에
# 섞여 들어오는 경우가 있어 적재 직전에 한 번 더 걸러낸다.
CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def scrub(value):
    """문자열이면 제어문자를 제거하고, 그 외 타입은 그대로 둔다."""
    if isinstance(value, str):
        return CONTROL_CHARS.sub("", value)
    return value


def scrub_rows(rows: list[dict]) -> list[dict]:
    return [{k: scrub(v) for k, v in row.items()} for row in rows]

ROOT = Path(__file__).resolve().parent.parent
LIST_PATH = ROOT / "data" / "assembly" / "list.json"
PARSED_PATH = ROOT / "data" / "assembly" / "parsed_answers.json"
BATCH = 200


def load_env() -> tuple[str, str]:
    """.env에서 Supabase 접속 정보를 읽는다 (값은 출력하지 않는다)."""
    env = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8-sig").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit(".env에 NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.")
    return url.rstrip("/"), key


class Supabase:
    def __init__(self, url: str, key: str):
        self.base = f"{url}/rest/v1"
        self.session = requests.Session()
        self.session.headers.update(
            {
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            }
        )

    def upsert(self, table: str, rows: list[dict], on_conflict: str) -> list[dict]:
        """unique 컬럼 기준으로 upsert 하고, 저장된 행을 돌려준다."""
        saved = []
        for i in range(0, len(rows), BATCH):
            chunk = scrub_rows(rows[i : i + BATCH])
            res = self.session.post(
                f"{self.base}/{table}",
                params={"on_conflict": on_conflict},
                headers={"Prefer": "resolution=merge-duplicates,return=representation"},
                data=json.dumps(chunk, ensure_ascii=False).encode("utf-8"),
                timeout=120,
            )
            if not res.ok:
                raise SystemExit(f"[{table}] 적재 실패 {res.status_code}: {res.text[:300]}")
            saved.extend(res.json())
        return saved

    def insert(self, table: str, rows: list[dict]) -> list[dict]:
        saved = []
        for i in range(0, len(rows), BATCH):
            chunk = scrub_rows(rows[i : i + BATCH])
            res = self.session.post(
                f"{self.base}/{table}",
                headers={"Prefer": "return=representation"},
                data=json.dumps(chunk, ensure_ascii=False).encode("utf-8"),
                timeout=120,
            )
            if not res.ok:
                raise SystemExit(f"[{table}] 적재 실패 {res.status_code}: {res.text[:300]}")
            saved.extend(res.json())
        return saved

    def delete_in(self, table: str, column: str, values: list[str]) -> None:
        """column 값이 values에 속하는 행을 지운다."""
        for i in range(0, len(values), BATCH):
            chunk = values[i : i + BATCH]
            joined = ",".join(chunk)
            res = self.session.delete(
                f"{self.base}/{table}",
                params={column: f"in.({joined})"},
                timeout=120,
            )
            if not res.ok:
                raise SystemExit(f"[{table}] 삭제 실패 {res.status_code}: {res.text[:300]}")

    def count(self, table: str) -> int:
        res = self.session.get(
            f"{self.base}/{table}",
            params={"select": "id"},
            headers={"Prefer": "count=exact", "Range": "0-0"},
            timeout=60,
        )
        if not res.ok:
            raise SystemExit(f"[{table}] 건수 조회 실패 {res.status_code}")
        # Content-Range 형식: "0-0/103"
        return int(res.headers.get("Content-Range", "0-0/0").split("/")[-1])


def main() -> None:
    url, key = load_env()
    db = Supabase(url, key)

    lst = json.loads(LIST_PATH.read_text(encoding="utf-8"))
    parsed = json.loads(PARSED_PATH.read_text(encoding="utf-8"))

    # ---- 1) 목록 원본 ------------------------------------------------------
    doc_rows = [
        {
            "down_url": r["down_url"],
            "conf_id": r["conf_id"],
            "conf_knd": r["conf_knd"],
            "eraco": r["eraco"],
            "sess": r["sess"],
            "dgr": r["dgr"],
            "conf_dt": r["conf_dt"],
            "file_knd": r["file_knd"],
            "file_cn": r["file_cn"],
            "kind": r["kind"],
            "member": r["member"],
        }
        for r in lst["records"]
    ]
    docs = db.upsert("assembly_documents", doc_rows, on_conflict="down_url")
    doc_id_by_url = {d["down_url"]: d["id"] for d in docs}
    print(f"1) assembly_documents : {len(docs)}건 적재")

    # ---- 2) 답변서 ---------------------------------------------------------
    answer_rows = []
    for d in parsed["documents"]:
        doc_id = doc_id_by_url.get(d["down_url"])
        if not doc_id:
            print(f"   [건너뜀] 목록에 없는 답변서: {d['file_cn'][:40]}")
            continue
        answer_rows.append(
            {
                "document_id": doc_id,
                "member_name": d["header"]["member_name"],
                "party": d["header"]["party"],
                "target": d["header"]["target"],
                "pages": d["pages"],
                "label_source": d["label_source"],
            }
        )
    answers = db.upsert("assembly_answers", answer_rows, on_conflict="document_id")
    answer_id_by_doc = {a["document_id"]: a["id"] for a in answers}
    print(f"2) assembly_answers   : {len(answers)}건 적재")

    # ---- 3) 문항 -----------------------------------------------------------
    question_rows = []
    # (답변서 id, 문항 no) -> 원본 문항을 기억해 두었다가 담당자 연결에 쓴다.
    q_origin: dict[tuple[str, int], dict] = {}
    for d in parsed["documents"]:
        doc_id = doc_id_by_url.get(d["down_url"])
        answer_id = answer_id_by_doc.get(doc_id)
        if not answer_id:
            continue
        for q in d["questions"]:
            question_rows.append(
                {
                    "answer_id": answer_id,
                    "no": q["no"],
                    "start_page": q["start_page"],
                    "end_page": q["end_page"],
                    "body": q["text"],
                }
            )
            q_origin[(answer_id, q["no"])] = q

    # 재파싱으로 문항 구성이 바뀌면(병합 등) 예전 행이 남으므로, 통째로 지우고 다시 넣는다.
    # upsert만 쓰면 사라진 문항이 DB에 그대로 남아 건수가 어긋난다.
    answer_ids_for_questions = [a["id"] for a in answers]
    if answer_ids_for_questions:
        db.delete_in("assembly_questions", "answer_id", answer_ids_for_questions)

    questions = db.insert("assembly_questions", question_rows)
    q_id_by_key = {(q["answer_id"], q["no"]): q["id"] for q in questions}
    print(f"3) assembly_questions : {len(questions)}건 적재")

    # ---- 4) 담당자 ---------------------------------------------------------
    # unique 키가 없어 재실행 시 중복이 쌓이므로, 대상 답변서의 기존 행을 먼저 지운다.
    answer_ids = [a["id"] for a in answers]
    if answer_ids:
        db.delete_in("assembly_contacts", "answer_id", answer_ids)

    contact_rows = []
    for d in parsed["documents"]:
        doc_id = doc_id_by_url.get(d["down_url"])
        answer_id = answer_id_by_doc.get(doc_id)
        if not answer_id:
            continue

        # 문항에 매칭된 담당자는 (raw, page)로 식별해 question_id를 붙인다.
        matched: dict[tuple[str, int], str] = {}
        for q in d["questions"]:
            qid = q_id_by_key.get((answer_id, q["no"]))
            if not qid:
                continue
            for c in q.get("contacts", []):
                matched[(c["raw"], c["page"])] = qid

        for c in d["contacts"]:
            contact_rows.append(
                {
                    "answer_id": answer_id,
                    "question_id": matched.get((c["raw"], c["page"])),
                    "page": c["page"],
                    "ministry": c["ministry"],
                    "department": c["department"],
                    "title": c["title"],
                    "phone": c["phone"],
                    "raw": c["raw"],
                }
            )

    contacts = db.insert("assembly_contacts", contact_rows) if contact_rows else []
    linked = sum(1 for c in contacts if c.get("question_id"))
    print(f"4) assembly_contacts  : {len(contacts)}건 적재 (문항 연결 {linked}건)")

    # ---- 검증 --------------------------------------------------------------
    print("\n=== DB 실제 행 수 ===")
    expected = {
        "assembly_documents": len(doc_rows),
        "assembly_answers": len(answer_rows),
        "assembly_questions": len(question_rows),
        "assembly_contacts": len(contact_rows),
    }
    ok = True
    for table, exp in expected.items():
        actual = db.count(table)
        mark = "OK" if actual == exp else "불일치"
        if actual != exp:
            ok = False
        print(f"  {table:<22}: {actual:>4}건 (기대 {exp}건) {mark}")
    print("\n전체 일치" if ok else "\n일부 불일치 — 확인 필요")


if __name__ == "__main__":
    main()
