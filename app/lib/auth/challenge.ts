import crypto from "node:crypto";
import {
  getPublicKeyFromAddress,
  verifySignature,
  signatureBytes,
  type Address,
} from "@solana/kit";
import { eq, and, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authChallenges, users, wallets } from "@/db/schema";

export type SIWSParams = {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
};

export const STATEMENT = "Sign in to RiveSeek.";
export const VERSION = "1";
export const DEFAULT_CHAIN_ID = "solana:devnet";
export const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function buildSIWSMessage(params: SIWSParams): string {
  return `${params.domain} wants you to sign in with your Solana account:
${params.address}

${params.statement}

URI: ${params.uri}
Version: ${params.version}
Chain ID: ${params.chainId}
Nonce: ${params.nonce}
Issued At: ${params.issuedAt}
Expiration Time: ${params.expirationTime}`;
}

export function parseSIWSMessage(
  messageText: string
): Partial<SIWSParams> | null {
  const normalized = messageText.replace(/\r\n/g, "\n");
  const domainMatch = normalized.match(
    /^([^\s]+) wants you to sign in with your Solana account:\n([^\s]+)/
  );
  if (!domainMatch) return null;
  const [, domain, address] = domainMatch;

  const uriMatch = normalized.match(/URI: ([^\n]+)/);
  const versionMatch = normalized.match(/Version: ([^\n]+)/);
  const chainIdMatch = normalized.match(/Chain ID: ([^\n]+)/);
  const nonceMatch = normalized.match(/Nonce: ([^\n]+)/);
  const issuedAtMatch = normalized.match(/Issued At: ([^\n]+)/);
  const expiresAtMatch = normalized.match(/Expiration Time: ([^\n]+)/);

  return {
    domain,
    address,
    statement: STATEMENT,
    uri: uriMatch ? uriMatch[1] : undefined,
    version: versionMatch ? versionMatch[1] : undefined,
    chainId: chainIdMatch ? chainIdMatch[1] : undefined,
    nonce: nonceMatch ? nonceMatch[1] : undefined,
    issuedAt: issuedAtMatch ? issuedAtMatch[1] : undefined,
    expirationTime: expiresAtMatch ? expiresAtMatch[1] : undefined,
  };
}

export async function createAuthChallenge(
  address: string,
  domain: string,
  uri: string
) {
  // Validate address structural format
  await getPublicKeyFromAddress(address as Address);

  const nonce = crypto.randomBytes(16).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);

  const [challenge] = await db
    .insert(authChallenges)
    .values({
      nonce,
      address,
      domain,
      uri,
      issuedAt: now,
      expiresAt,
    })
    .returning();

  const messageText = buildSIWSMessage({
    domain: challenge.domain,
    address: challenge.address,
    statement: STATEMENT,
    uri: challenge.uri,
    version: VERSION,
    chainId: DEFAULT_CHAIN_ID,
    nonce: challenge.nonce,
    issuedAt: challenge.issuedAt.toISOString(),
    expirationTime: challenge.expiresAt.toISOString(),
  });

  return {
    nonce: challenge.nonce,
    address: challenge.address,
    domain: challenge.domain,
    uri: challenge.uri,
    issuedAt: challenge.issuedAt.toISOString(),
    expirationTime: challenge.expiresAt.toISOString(),
    statement: STATEMENT,
    version: VERSION,
    chainId: DEFAULT_CHAIN_ID,
    messageText,
  };
}

export type VerifyAuthParams = {
  nonce: string;
  address: string;
  signatureHex: string;
  signedMessageHex?: string;
};

export async function verifyAuthChallenge({
  nonce,
  address,
  signatureHex,
  signedMessageHex,
}: VerifyAuthParams): Promise<{ userId: string }> {
  // Step 1: Load stored challenge by nonce
  const [stored] = await db
    .select()
    .from(authChallenges)
    .where(eq(authChallenges.nonce, nonce))
    .limit(1);

  if (!stored) {
    throw new Error("AUTH_CHALLENGE_NOT_FOUND");
  }

  // Step 2: Verify challenge status (unused & not expired)
  if (stored.consumedAt !== null) {
    throw new Error("AUTH_CHALLENGE_ALREADY_CONSUMED");
  }

  const now = new Date();
  if (stored.expiresAt.getTime() <= now.getTime()) {
    throw new Error("AUTH_CHALLENGE_EXPIRED");
  }

  // Step 3: Verify address match
  if (stored.address !== address) {
    throw new Error("AUTH_ADDRESS_MISMATCH");
  }

  // Step 4: Reconstruct exact stored message bytes & verify signature
  const expectedMessageText = buildSIWSMessage({
    domain: stored.domain,
    address: stored.address,
    statement: STATEMENT,
    uri: stored.uri,
    version: VERSION,
    chainId: DEFAULT_CHAIN_ID,
    nonce: stored.nonce,
    issuedAt: stored.issuedAt.toISOString(),
    expirationTime: stored.expiresAt.toISOString(),
  });

  const expectedBytes = new TextEncoder().encode(expectedMessageText);

  // If signedMessageHex was provided (e.g. from wallet-standard signIn), verify it matches expected stored message bytes
  if (signedMessageHex) {
    const receivedBytes = Buffer.from(signedMessageHex, "hex");
    const receivedText = new TextDecoder().decode(receivedBytes);
    const parsed = parseSIWSMessage(receivedText);
    if (
      !parsed ||
      parsed.nonce !== stored.nonce ||
      parsed.address !== stored.address
    ) {
      throw new Error("AUTH_TAMPERED_MESSAGE");
    }
  }

  // Cryptographic signature verification using @solana/kit
  const pubKey = await getPublicKeyFromAddress(address as Address);
  const sigBytes = signatureBytes(
    new Uint8Array(Buffer.from(signatureHex, "hex"))
  );

  const isValid = await verifySignature(pubKey, sigBytes, expectedBytes);
  if (!isValid) {
    throw new Error("AUTH_INVALID_SIGNATURE");
  }

  // Step 5: Atomically claim/consume challenge
  const updated = await db
    .update(authChallenges)
    .set({ consumedAt: now })
    .where(
      and(
        eq(authChallenges.nonce, nonce),
        isNull(authChallenges.consumedAt),
        gt(authChallenges.expiresAt, now)
      )
    )
    .returning();

  if (updated.length === 0) {
    throw new Error("AUTH_CHALLENGE_ALREADY_CONSUMED_OR_EXPIRED");
  }

  // Step 6: Resolve or create user + wallet
  const [existingWallet] = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.chain, "solana"), eq(wallets.address, address)))
    .limit(1);

  if (existingWallet) {
    return { userId: existingWallet.userId };
  }

  // Create new user and linked primary wallet in a safe fallback pattern
  try {
    const [newUser] = await db.insert(users).values({}).returning();

    await db.insert(wallets).values({
      userId: newUser.id,
      chain: "solana",
      address,
      isPrimary: true,
      verifiedAt: now,
    });

    return { userId: newUser.id };
  } catch (err: unknown) {
    // If concurrent creation happened, look up the newly inserted wallet
    const [raceWallet] = await db
      .select()
      .from(wallets)
      .where(and(eq(wallets.chain, "solana"), eq(wallets.address, address)))
      .limit(1);

    if (raceWallet) {
      return { userId: raceWallet.userId };
    }
    throw err;
  }
}
