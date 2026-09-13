"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface HistoryItem {
  id: string;
  question_text: string;
  department: string;
  draft: string;
  created_at: string;
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // 목록에서 고른 항목. 고르면 상세 내용을 펼쳐 보여준다.
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/inquiries")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setItems(data.inquiries ?? []);
      })
      .catch(() => setError("처리 이력을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, []);

  async function copyDraft(draft: string) {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("복사에 실패했습니다. 직접 선택해 복사해 주세요.");
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-slate-800">처리 이력</h2>
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
          질의서 접수로 →
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 목록 */}
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-6 py-8 text-sm text-slate-400">불러오는 중...</p>
        ) : items.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-400">아직 처리한 질의서가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => {
              const open = selected?.id === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => setSelected(open ? null : item)}
                    aria-expanded={open}
                    className={`flex w-full items-start justify-between gap-4 px-6 py-4 text-left hover:bg-slate-50 ${
                      open ? "bg-slate-50" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="block font-medium text-slate-800">
                        {item.department}
                      </span>
                      {/* line-clamp는 display를 -webkit-box로 바꾸므로 block을 같이 주면 안 된다. */}
                      <span className="mt-1 line-clamp-2 text-sm text-slate-500">
                        {item.question_text}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {new Date(item.created_at).toLocaleString("ko-KR")}
                      </span>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                        className={`text-slate-400 transition-transform ${
                          open ? "rotate-180" : ""
                        }`}
                      >
                        <path
                          d="M5 8l5 5 5-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  </button>

                  {/* 상세 — 질의서 전문과 답변 초안 */}
                  {open && (
                    <div className="space-y-4 border-t border-slate-100 bg-slate-50 px-6 py-5">
                      <div>
                        <p className="mb-1 text-xs font-semibold text-slate-500">질의서 전문</p>
                        <p className="whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800">
                          {item.question_text}
                        </p>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-500">답변 초안</p>
                          <button
                            onClick={() => copyDraft(item.draft)}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            {copied ? "복사됨" : "복사"}
                          </button>
                        </div>
                        <p className="whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800">
                          {item.draft}
                        </p>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!loading && items.length > 0 && (
        <p className="text-xs text-slate-400">
          최근 50건까지 표시합니다. 항목을 누르면 질의서 전문과 답변 초안을 볼 수 있습니다.
        </p>
      )}
    </main>
  );
}
