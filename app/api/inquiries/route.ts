import { NextRequest, NextResponse } from "next/server";
import { describeSupabaseEnv, getSupabaseAdmin } from "@/lib/supabase";

/** 환경변수 문제로 예외가 터지면 본문 없는 500이 나가 원인을 알 수 없다. 사유를 실어 보낸다. */
function envErrorResponse(e: unknown) {
  const message = e instanceof Error ? e.message : "Supabase 연결에 실패했습니다.";
  console.error("[inquiries] Supabase 설정 오류:", message, describeSupabaseEnv());
  return NextResponse.json({ error: message, env: describeSupabaseEnv() }, { status: 500 });
}

export async function GET() {
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return envErrorResponse(e);
  }

  const { data, error } = await supabase
    .from("inquiries")
    .select("id, question_text, department, draft, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "처리 이력을 불러오지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json({ inquiries: data });
}

export async function POST(req: NextRequest) {
  const { text, department, draft } = await req.json();

  if (
    !text ||
    typeof text !== "string" ||
    !department ||
    typeof department !== "string" ||
    !draft ||
    typeof draft !== "string"
  ) {
    return NextResponse.json(
      { error: "질의서 내용, 담당 부서, 답변 초안이 모두 필요합니다." },
      { status: 400 }
    );
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return envErrorResponse(e);
  }

  const { data, error } = await supabase
    .from("inquiries")
    .insert({ question_text: text, department, draft })
    .select("id, question_text, department, draft, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ inquiry: data });
}
