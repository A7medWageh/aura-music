import { ok } from "@/services/http/response";
import { createCsrfToken, setCsrfCookie } from "@/services/security/csrf";

export async function GET() {
  const token = createCsrfToken();
  await setCsrfCookie(token);
  return ok({ csrfToken: token });
}
