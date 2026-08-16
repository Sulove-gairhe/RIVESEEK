import { NextResponse } from "next/server";
import { SESSION_COOKIE_OPTIONS } from "@/app/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.set({
    name: SESSION_COOKIE_OPTIONS.name,
    value: "",
    httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
    secure: SESSION_COOKIE_OPTIONS.secure,
    sameSite: SESSION_COOKIE_OPTIONS.sameSite,
    path: SESSION_COOKIE_OPTIONS.path,
    maxAge: 0,
  });

  return response;
}
