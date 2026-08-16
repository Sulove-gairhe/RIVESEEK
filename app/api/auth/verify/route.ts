import { NextResponse, type NextRequest } from "next/server";
import { verifyAuthChallenge } from "@/app/lib/auth/challenge";
import { signSession, SESSION_COOKIE_OPTIONS } from "@/app/lib/auth/session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nonce, address, signatureHex, signedMessageHex } = body || {};

    if (!nonce || !address || !signatureHex) {
      return NextResponse.json(
        { error: "nonce, address, and signatureHex are required" },
        { status: 400 }
      );
    }

    const { userId } = await verifyAuthChallenge({
      nonce,
      address,
      signatureHex,
      signedMessageHex,
    });

    const expiresAt = Date.now() + SESSION_COOKIE_OPTIONS.maxAge * 1000;
    const sessionToken = signSession({ userId, expiresAt });

    const response = NextResponse.json({
      success: true,
      user: { id: userId },
    });

    response.cookies.set({
      name: SESSION_COOKIE_OPTIONS.name,
      value: sessionToken,
      httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
      secure: SESSION_COOKIE_OPTIONS.secure,
      sameSite: SESSION_COOKIE_OPTIONS.sameSite,
      path: SESSION_COOKIE_OPTIONS.path,
      maxAge: SESSION_COOKIE_OPTIONS.maxAge,
    });

    return response;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Authentication verification failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
