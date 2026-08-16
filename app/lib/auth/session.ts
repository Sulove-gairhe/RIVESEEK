import crypto from "node:crypto";

const SESSION_COOKIE_NAME = "riveseek_session";
const DEFAULT_SESSION_SECRET =
  "riveseek-dev-session-secret-change-in-production-min-32-chars";

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET || DEFAULT_SESSION_SECRET;
  if (
    process.env.NODE_ENV === "production" &&
    secret === DEFAULT_SESSION_SECRET
  ) {
    throw new Error(
      "SESSION_SECRET environment variable must be set in production"
    );
  }
  return secret;
}

export type SessionPayload = {
  userId: string;
  expiresAt: number;
};

export function signSession(payload: SessionPayload): string {
  const secret = getSessionSecret();
  const jsonStr = JSON.stringify(payload);
  const base64Data = Buffer.from(jsonStr, "utf8").toString("base64url");
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(base64Data)
    .digest("base64url");
  return `${base64Data}.${hmac}`;
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const secret = getSessionSecret();
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [base64Data, signature] = parts;
    const expectedHmac = crypto
      .createHmac("sha256", secret)
      .update(base64Data)
      .digest("base64url");

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedHmac);

    if (sigBuffer.length !== expectedBuffer.length) return null;
    if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;

    const jsonStr = Buffer.from(base64Data, "base64url").toString("utf8");
    const payload = JSON.parse(jsonStr) as SessionPayload;

    if (
      typeof payload.userId !== "string" ||
      typeof payload.expiresAt !== "number"
    ) {
      return null;
    }

    if (Date.now() > payload.expiresAt) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_OPTIONS = {
  name: SESSION_COOKIE_NAME,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
};
