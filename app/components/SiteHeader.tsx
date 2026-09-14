"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/", label: "질의서 접수", desc: "새 질의서를 분류하고 초안을 만듭니다" },
  { href: "/history", label: "처리 이력", desc: "지금까지 처리한 질의서를 확인합니다" },
];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 서랍이 열려 있을 때 Esc로 닫을 수 있게 한다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-5">
          <button
            onClick={() => setOpen(true)}
            aria-label="메뉴 열기"
            aria-expanded={open}
            className="-ml-2 rounded-md p-2 text-slate-200 hover:bg-slate-800 hover:text-white"
          >
            {/* 햄버거 아이콘 */}
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M3 5h14M3 10h14M3 15h14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-semibold">AI 활용 국회 질의서 자동화 서비스</h1>
            <p className="text-sm text-slate-300">
              국회 질의서 담당 부서 분류 · 답변 초안 생성
            </p>
          </div>
        </div>
      </header>

      {/* 왼쪽에서 밀려 나오는 메뉴 */}
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <nav className="relative h-full w-72 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <span className="text-sm font-semibold text-slate-800">메뉴</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="메뉴 닫기"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    d="M5 5l10 10M15 5L5 15"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <ul className="p-3">
              {NAV.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      // 이동과 동시에 서랍을 닫는다.
                      onClick={() => setOpen(false)}
                      className={`block rounded-md px-3 py-3 ${
                        active ? "bg-slate-900 text-white" : "text-slate-800 hover:bg-slate-100"
                      }`}
                    >
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span
                        className={`mt-0.5 block text-xs ${
                          active ? "text-slate-300" : "text-slate-500"
                        }`}
                      >
                        {item.desc}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      )}
    </>
  );
}
