import { createClient } from "@supabase/supabase-js";

// service_role 키는 RLS를 우회하므로 서버 코드(API 라우트)에서만 사용해야 한다.
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다. .env를 확인하세요.");
  }
  return createClient(url, serviceKey);
}
