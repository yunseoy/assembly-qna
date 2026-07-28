"use client";

import { useEffect, useState } from "react";

interface Candidate {
  department: string;
  confidence: number;
  reason: string;
}

interface ReferenceCase {
  title: string;
  summary: string;
  downloadUrl: string;
  excerpt?: string;
  textSupported: boolean;
}

interface HistoryItem {
  id: string;
  question_text: string;
  department: string;
  draft: string;
  created_at: string;
}

type Step = "input" | "classifying" | "candidates" | "drafting" | "review";

export default function Home() {
  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [classifyStatus, setClassifyStatus] = useState<"ok" | "hold" | null>(null);
  const [referenceCases, setReferenceCases] = useState<ReferenceCase[]>([]);
  const [department, setDepartment] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/inquiries")
      .then((res) => res.json())
      .then((data) => {
        if (data.inquiries) setHistory(data.inquiries);
      })
      .catch(() => {
        // 이력 조회 실패는 화면을 막지 않고 빈 목록으로 둔다.
      });
  }, []);

  async function handleClassify() {
    setError("");
    setStep("classifying");
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "분류 중 오류가 발생했습니다.");
      setCandidates(data.candidates ?? []);
      setClassifyStatus(data.status);
      setReferenceCases(data.referenceCases ?? []);
      setStep("candidates");
    } catch (e) {
      setError(e instanceof Error ? e.message : "분류 중 오류가 발생했습니다.");
      setStep("input");
    }
  }

  async function handleConfirmDepartment(dept: string) {
    setDepartment(dept);
    setError("");
    setStep("drafting");
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, department: dept }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "초안 생성 중 오류가 발생했습니다.");
      setDraft(data.draft ?? "");
      setReferenceCases(data.referenceCases ?? []);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "초안 생성 중 오류가 발생했습니다.");
      setStep("candidates");
    }
  }

  async function handleSave() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, department, draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "저장에 실패했습니다.");
      setHistory([data.inquiry, ...history]);
      handleReset();
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setStep("input");
    setCandidates([]);
    setClassifyStatus(null);
    setReferenceCases([]);
    setDepartment("");
    setDraft("");
    setError("");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto max-w-3xl px-6 py-5">
          <h1 className="text-lg font-semibold">AI 활용 국회 질의서 자동화 서비스</h1>
          <p className="text-sm text-slate-300">
            국정감사 질의서 담당 부서 분류 · 답변 초안 생성
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 1. 질의서 접수 */}
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-800">1. 질의서 접수</h2>
          <textarea
            className="h-40 w-full resize-none rounded-md border border-slate-300 p-3 text-sm text-slate-800 focus:border-slate-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
            placeholder="국정감사 질의서 내용을 붙여넣으세요."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={step !== "input"}
          />
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleClassify}
              disabled={!text.trim() || step !== "input"}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {step === "classifying" ? "분류 중..." : "분류하기"}
            </button>
          </div>
        </section>

        {/* 2. 분류 결과 */}
        {(step === "candidates" || step === "drafting" || step === "review") && (
          <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-800">2. 분류 결과</h2>
            {classifyStatus === "hold" ? (
              <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
                분류 보류 - 담당자 직접 확인 필요 (추천 부서의 신뢰도가 낮습니다)
              </p>
            ) : (
              <ul className="space-y-2">
                {candidates.map((c) => (
                  <li
                    key={c.department}
                    className="flex items-center justify-between gap-4 rounded-md border border-slate-200 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-slate-800">
                        {c.department}{" "}
                        <span className="text-slate-500">({c.confidence}%)</span>
                      </p>
                      <p className="text-sm text-slate-500">{c.reason}</p>
                    </div>
                    <button
                      onClick={() => handleConfirmDepartment(c.department)}
                      disabled={step !== "candidates"}
                      className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                    >
                      이 부서로 확정
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {referenceCases.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-2 text-xs font-medium text-slate-500">
                  참고자료 (열린국회정보)
                </p>
                <ul className="space-y-2 text-sm">
                  {referenceCases.map((ref) => (
                    <li key={ref.downloadUrl}>
                      <div>
                        <a
                          href={ref.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-700 hover:underline"
                        >
                          {ref.title}
                        </a>
                        <span className="text-slate-400"> — {ref.summary}</span>
                        {!ref.textSupported && (
                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                            PDF/HWPX 외 형식 · 향후 지원 예정
                          </span>
                        )}
                      </div>
                      {ref.textSupported && ref.excerpt && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                          {ref.excerpt}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* 3. 답변 초안 */}
        {(step === "drafting" || step === "review") && (
          <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-800">
              3. 답변 초안 ({department})
            </h2>
            {step === "drafting" ? (
              <p className="text-sm text-slate-500">초안을 생성하는 중입니다...</p>
            ) : (
              <>
                <textarea
                  className="h-56 w-full resize-none rounded-md border border-slate-300 p-3 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    onClick={handleReset}
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                  >
                    {saving ? "저장 중..." : "저장"}
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {/* 4. 처리 이력 */}
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-800">처리 이력</h2>
          {history.length === 0 ? (
            <p className="text-sm text-slate-400">아직 처리한 질의서가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {history.map((h) => (
                <li key={h.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{h.department}</span>
                    <span className="text-xs text-slate-400">
                      {new Date(h.created_at).toLocaleString("ko-KR")}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                    {h.question_text}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
