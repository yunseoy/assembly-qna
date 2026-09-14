import { createClient } from "@supabase/supabase-js";

/**
 * 환경변수 상태를 비밀 값 없이 요약한다.
 *
 * 값이 비었거나 형식이 틀리면 예외가 그대로 터져 본문 없는 500이 나가는데,
 * 그러면 원인을 밖에서 알 방법이 없다(실제로 배포본에서 겪었다).
 * 그래서 진단에 필요한 정보만 따로 뽑아 쓴다.
 */
/**
 * Supabase URL을 읽는다.
 *
 * 이 값은 서버(API 라우트)에서만 쓰므로 NEXT_PUBLIC_ 접두사가 필요 없다.
 * (접두사가 붙으면 브라우저 번들에도 들어간다.)
 * 다만 기존 설정과의 호환을 위해 두 이름을 모두 받는다.
 */
function readSupabaseUrl(): string {
  return (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
}

export function describeSupabaseEnv() {
  const url = readSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  // 프로젝트 ref는 공개 URL의 일부라 노출해도 무방하다. 키는 길이·접두사만 본다.
  const ref = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1] ?? null;
  return {
    urlSet: url.length > 0,
    urlValid: ref !== null,
    projectRef: ref,
    keySet: key.length > 0,
    keyLength: key.length,
    keyPrefix: key.slice(0, 10),
  };
}

// service_role 키는 RLS를 우회하므로 서버 코드(API 라우트)에서만 사용해야 한다.
export function getSupabaseAdmin() {
  const url = readSupabaseUrl();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (!url || !serviceKey) {
    const missing = [
      !url && "SUPABASE_URL (또는 NEXT_PUBLIC_SUPABASE_URL)",
      !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(`Supabase 환경변수가 비어 있습니다: ${missing}`);
  }
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) {
    // 따옴표나 공백이 섞여 들어오는 경우가 많아 형식을 확인한다.
    throw new Error("SUPABASE_URL 형식이 올바르지 않습니다 (https://<ref>.supabase.co)");
  }

  return createClient(url, serviceKey);
}
