import { NextResponse, type NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE_OPTIONS } from "@/app/lib/auth/session";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_OPTIONS.name)?.value;

  if (!token) {
    return NextResponse.json({ authenticated: false });
  }

  const payload = verifySession(token);
  if (!payload) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    user: { id: payload.userId },
  });
}
