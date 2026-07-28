import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabaseAdmin();
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

  const supabase = getSupabaseAdmin();
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
