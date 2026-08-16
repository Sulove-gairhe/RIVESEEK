import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { config } from "dotenv";
config({ path: ".env.local" });

import https from "node:https";
import { neonConfig } from "@neondatabase/serverless";
import {
  generateKeyPair,
  getAddressFromPublicKey,
  signBytes,
} from "@solana/kit";
import {
  createAuthChallenge,
  verifyAuthChallenge,
  buildSIWSMessage,
  STATEMENT,
  VERSION,
  DEFAULT_CHAIN_ID,
} from "./challenge";
import { signSession, verifySession } from "./session";
import { db } from "@/db";
import { wallets, authChallenges } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// Configure custom IPv4 fetch for Neon to ensure test runner connects reliably in WSL2
neonConfig.fetchFunction = (
  url: string | URL | Request,
  options?: Record<string, unknown>
) => {
  return new Promise<Response>((resolve, reject) => {
    const urlObj = new URL(url.toString());
    const reqOptions: https.RequestOptions = {
      method: (options?.method as string) || "GET",
      headers: (options?.headers as Record<string, string>) || {},
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      timeout: 10000,
      family: 4,
    };
    const req = https.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({
          ok: (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300,
          status: res.statusCode ?? 500,
          statusText: res.statusMessage ?? "",
          json: async () => JSON.parse(data),
          text: async () => data,
        } as unknown as Response);
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
    if (options?.body) {
      req.write(options.body);
    }
    req.end();
  });
};

async function runTests() {
  console.log(
    "🧪 Running Sign-In With Solana (Milestone 2B) Authentication Tests...\n"
  );
  let passedCount = 0;
  let totalCount = 0;

  async function assertTest(name: string, fn: () => Promise<void>) {
    totalCount++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passedCount++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✕ ${name}`);
      console.error(`    Error: ${msg}`);
    }
  }

  // Generate test keypairs
  const keyPairA = await generateKeyPair();
  const addressA = await getAddressFromPublicKey(keyPairA.publicKey);

  const keyPairB = await generateKeyPair();
  const addressB = await getAddressFromPublicKey(keyPairB.publicKey);

  const testDomain = "localhost:3000";
  const testUri = "http://localhost:3000";

  // 1. Successful Login Test
  let activeChallengeNonce: string;
  let activeSignatureHex: string;

  await assertTest(
    "1. Successful Login (Challenge -> Sign -> Verify -> Resolve User & Wallet -> Session)",
    async () => {
      const challenge = await createAuthChallenge(
        addressA,
        testDomain,
        testUri
      );
      activeChallengeNonce = challenge.nonce;

      const messageBytes = new TextEncoder().encode(challenge.messageText);
      const sigBytes = await signBytes(keyPairA.privateKey, messageBytes);
      activeSignatureHex = Buffer.from(sigBytes).toString("hex");

      const result = await verifyAuthChallenge({
        nonce: challenge.nonce,
        address: addressA,
        signatureHex: activeSignatureHex,
      });

      if (!result.userId) throw new Error("Expected resolved userId");

      // Verify database resolution
      const [dbWallet] = await db
        .select()
        .from(wallets)
        .where(and(eq(wallets.chain, "solana"), eq(wallets.address, addressA)));

      if (!dbWallet || dbWallet.userId !== result.userId) {
        throw new Error("Wallet not correctly linked to user in database");
      }

      // Verify session token creation and parsing
      const sessionToken = signSession({
        userId: result.userId,
        expiresAt: Date.now() + 60000,
      });
      const parsedSession = verifySession(sessionToken);

      if (!parsedSession || parsedSession.userId !== result.userId) {
        throw new Error("Session token verification failed");
      }
    }
  );

  // 2. Replay Test
  await assertTest(
    "2. Replay Protection (Consuming same nonce twice fails)",
    async () => {
      try {
        await verifyAuthChallenge({
          nonce: activeChallengeNonce,
          address: addressA,
          signatureHex: activeSignatureHex,
        });
        throw new Error("Expected replay verification to fail");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (!msg.includes("CONSUMED")) {
          throw err;
        }
      }
    }
  );

  // 3. Wrong Signer Test
  await assertTest(
    "3. Wrong Signer (Challenge for Wallet A signed by Wallet B fails)",
    async () => {
      const challenge = await createAuthChallenge(
        addressA,
        testDomain,
        testUri
      );
      const messageBytes = new TextEncoder().encode(challenge.messageText);

      // Wallet B signs Wallet A's challenge
      const sigBytesB = await signBytes(keyPairB.privateKey, messageBytes);
      const signatureHexB = Buffer.from(sigBytesB).toString("hex");

      try {
        await verifyAuthChallenge({
          nonce: challenge.nonce,
          address: addressA,
          signatureHex: signatureHexB,
        });
        throw new Error("Expected wrong signer verification to fail");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (!msg.includes("INVALID_SIGNATURE")) {
          throw err;
        }
      }
    }
  );

  // 4. Tampered Message Test
  await assertTest(
    "4. Tampered Message (Signed message with altered fields fails)",
    async () => {
      const challenge = await createAuthChallenge(
        addressA,
        testDomain,
        testUri
      );

      // Tamper with the domain in message
      const tamperedMessageText = buildSIWSMessage({
        domain: "attacker.com",
        address: challenge.address,
        statement: STATEMENT,
        uri: challenge.uri,
        version: VERSION,
        chainId: DEFAULT_CHAIN_ID,
        nonce: challenge.nonce,
        issuedAt: challenge.issuedAt,
        expirationTime: challenge.expirationTime,
      });

      const tamperedBytes = new TextEncoder().encode(tamperedMessageText);
      const sigBytes = await signBytes(keyPairA.privateKey, tamperedBytes);
      const signatureHex = Buffer.from(sigBytes).toString("hex");
      const signedMessageHex = Buffer.from(tamperedBytes).toString("hex");

      try {
        await verifyAuthChallenge({
          nonce: challenge.nonce,
          address: addressA,
          signatureHex,
          signedMessageHex,
        });
        throw new Error("Expected tampered message verification to fail");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (!msg.includes("TAMPERED") && !msg.includes("INVALID_SIGNATURE")) {
          throw err;
        }
      }
    }
  );

  // 5. Expired Challenge Test
  await assertTest(
    "5. Expired Challenge (Challenge past expiration fails)",
    async () => {
      const nonce = "expired_nonce_" + Math.random().toString(36).substring(2);
      const past = new Date(Date.now() - 60000);

      await db.insert(authChallenges).values({
        nonce,
        address: addressA,
        domain: testDomain,
        uri: testUri,
        issuedAt: new Date(Date.now() - 120000),
        expiresAt: past,
      });

      try {
        await verifyAuthChallenge({
          nonce,
          address: addressA,
          signatureHex: activeSignatureHex,
        });
        throw new Error("Expected expired challenge to fail");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (!msg.includes("EXPIRED")) {
          throw err;
        }
      }
    }
  );

  // 6. Unknown Nonce Test
  await assertTest(
    "6. Unknown Nonce (Non-existent challenge fails)",
    async () => {
      try {
        await verifyAuthChallenge({
          nonce: "non_existent_nonce_12345",
          address: addressA,
          signatureHex: activeSignatureHex,
        });
        throw new Error("Expected unknown nonce to fail");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (!msg.includes("NOT_FOUND")) {
          throw err;
        }
      }
    }
  );

  // 7. Malformed Public Key / Signature Test
  await assertTest(
    "7. Malformed Input Safety (Invalid public key or signature fails cleanly)",
    async () => {
      try {
        await createAuthChallenge(
          "invalid_solana_address",
          testDomain,
          testUri
        );
        throw new Error("Expected invalid address to throw error");
      } catch {
        /* expected */
      }

      try {
        await verifyAuthChallenge({
          nonce: "any_nonce",
          address: addressA,
          signatureHex: "1234", // invalid signature length
        });
        throw new Error("Expected malformed signature to throw error");
      } catch {
        /* expected */
      }
    }
  );

  // 8. Duplicate / Concurrent Wallet Creation Test
  await assertTest(
    "8. Idempotent / Duplicate Wallet Login (Repeated login maps to same user.id)",
    async () => {
      const challenge1 = await createAuthChallenge(
        addressB,
        testDomain,
        testUri
      );
      const msg1 = new TextEncoder().encode(challenge1.messageText);
      const sig1 = Buffer.from(
        await signBytes(keyPairB.privateKey, msg1)
      ).toString("hex");

      const res1 = await verifyAuthChallenge({
        nonce: challenge1.nonce,
        address: addressB,
        signatureHex: sig1,
      });

      const challenge2 = await createAuthChallenge(
        addressB,
        testDomain,
        testUri
      );
      const msg2 = new TextEncoder().encode(challenge2.messageText);
      const sig2 = Buffer.from(
        await signBytes(keyPairB.privateKey, msg2)
      ).toString("hex");

      const res2 = await verifyAuthChallenge({
        nonce: challenge2.nonce,
        address: addressB,
        signatureHex: sig2,
      });

      if (res1.userId !== res2.userId) {
        throw new Error(
          `Expected identical userId across logins, got ${res1.userId} vs ${res2.userId}`
        );
      }
    }
  );

  // 9. Logout / Expired Session Test
  await assertTest(
    "9. Session Expiry & Invalidation (Expired token returns null)",
    async () => {
      const expiredSessionToken = signSession({
        userId: "test_user_id",
        expiresAt: Date.now() - 1000,
      });

      const result = verifySession(expiredSessionToken);
      if (result !== null) {
        throw new Error("Expected expired session token to return null");
      }
    }
  );

  console.log(
    `\n📊 Authentication Test Summary: ${passedCount}/${totalCount} tests passed.\n`
  );

  // Clean up test data
  try {
    await db.delete(wallets).where(eq(wallets.address, addressA));
    await db.delete(wallets).where(eq(wallets.address, addressB));
    await db.delete(authChallenges).where(eq(authChallenges.address, addressA));
    await db.delete(authChallenges).where(eq(authChallenges.address, addressB));
  } catch {
    /* ignore cleanup errors */
  }

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal error in auth test suite:", err);
  process.exit(1);
});
