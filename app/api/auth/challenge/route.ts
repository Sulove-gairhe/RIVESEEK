import { NextResponse, type NextRequest } from "next/server";
import { createAuthChallenge } from "@/app/lib/auth/challenge";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address } = body || {};

    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { error: "Wallet address is required" },
        { status: 400 }
      );
    }

    const host = request.headers.get("host") || "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const uri = `${protocol}://${host}`;

    const challenge = await createAuthChallenge(address, host, uri);

    return NextResponse.json(challenge);
  } catch (error) {
    console.error("[SIWS challenge] failed", error);

    if (error instanceof Error && "cause" in error) {
      console.error("[SIWS challenge] underlying cause:", error.cause);
    }

    return Response.json(
      { error: "Failed to create authentication challenge" },
      { status: 500 }
    );
  }
}
