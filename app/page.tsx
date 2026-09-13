"use client";

import Link from "next/link";
import { useState } from "react";

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
  departments?: string[];
  textSupported: boolean;
}

/** 과 단위 후보 — 과거 답변서에서 실제로 확인된 부서만 올라온다. */
interface DepartmentCandidate {
  name: string;
  count: number;
  basis: string[];
}

type Step = "input" | "classifying" | "candidates" | "drafting" | "review";

export default function Home() {
  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [classifyStatus, setClassifyStatus] = useState<"ok" | "hold" | null>(null);
  const [deptCandidates, setDeptCandidates] = useState<DepartmentCandidate[]>([]);
  const [referenceCases, setReferenceCases] = useState<ReferenceCase[]>([]);
  const [department, setDepartment] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  async function handleClassify() {
    setError("");
    setSavedNotice(false);
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
      setDeptCandidates(data.departmentCandidates ?? []);
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
      handleReset();
      setText("");
      // 저장한 내용은 '처리 이력' 페이지에서 확인한다.
      setSavedNotice(true);
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
    setDeptCandidates([]);
    setReferenceCases([]);
    setDepartment("");
    setDraft("");
    setError("");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {savedNotice && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span>저장했습니다.</span>
            <Link href="/history" className="font-medium underline underline-offset-2">
              처리 이력에서 보기
            </Link>
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

            {/* 1단계 — 부처 단위. AI 판단이지만 과거 실제 사례를 근거로 삼는다. */}
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500">
              1단계 · 부처 단위
            </p>
            {classifyStatus === "hold" ? (
              <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
                분류 보류 - 담당자 직접 확인 필요 (추천 부처의 신뢰도가 낮습니다)
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
                      이 부처로 확정
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* 2단계 — 과 단위. 과거 답변서에서 실제로 확인된 부서만 올린다. */}
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500">
                2단계 · 과 단위
              </p>
              {deptCandidates.length > 0 ? (
                <ul className="space-y-2">
                  {deptCandidates.map((d) => (
                    <li
                      key={d.name}
                      className="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800">
                          {d.name}{" "}
                          <span className="text-xs font-normal text-slate-500">
                            과거 사례 {d.count}건에서 확인
                          </span>
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          근거: {d.basis.join(" / ")}
                        </p>
                      </div>
                      <button
                        onClick={() => handleConfirmDepartment(d.name)}
                        disabled={step !== "candidates"}
                        className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                      >
                        이 과로 확정
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  과 단위는 근거 부족 — 담당자 확인 필요
                  <span className="mt-1 block text-xs text-slate-400">
                    과거 답변서에 담당 부서가 적혀 있는 경우에만 표시합니다. AI가 추측하지
                    않습니다.
                  </span>
                </p>
              )}
            </div>

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

      </main>
    </div>
  );
}
