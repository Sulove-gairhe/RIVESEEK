"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type PropsWithChildren,
} from "react";
import { useWallet } from "../wallet/context";

type AuthUser = {
  id: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const { wallet } = useWallet();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.authenticated && data.user ? data.user : null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { authenticated: false }))
      .then((data) => {
        if (mounted)
          setUser(data.authenticated && data.user ? data.user : null);
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const signIn = useCallback(async () => {
    if (!wallet) {
      throw new Error("Wallet is not connected");
    }

    setError(null);
    setIsLoading(true);

    try {
      const address = wallet.account.address;

      // Step 1: Request server challenge
      const challengeRes = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });

      if (!challengeRes.ok) {
        const errData = await challengeRes.json();
        throw new Error(errData.error || "Failed to generate login challenge");
      }

      const challenge = await challengeRes.json();

      let signatureHex: string;
      let signedMessageHex: string;

      // Step 2: Request wallet signature
      if (wallet.signIn) {
        const signInResult = await wallet.signIn({
          domain: challenge.domain,
          address: challenge.address,
          statement: challenge.statement,
          uri: challenge.uri,
          version: challenge.version,
          nonce: challenge.nonce,
          chainId: challenge.chainId,
          issuedAt: challenge.issuedAt,
          expirationTime: challenge.expirationTime,
        });

        signatureHex = Buffer.from(signInResult.signature).toString("hex");
        signedMessageHex = Buffer.from(signInResult.signedMessage).toString(
          "hex"
        );
      } else if (wallet.signMessage) {
        const messageBytes = new TextEncoder().encode(challenge.messageText);
        const sigBytes = await wallet.signMessage(messageBytes);

        signatureHex = Buffer.from(sigBytes).toString("hex");
        signedMessageHex = Buffer.from(messageBytes).toString("hex");
      } else {
        throw new Error(
          "Connected wallet does not support message or SIWS signing"
        );
      }

      // Step 3: Send signature to backend verification endpoint
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nonce: challenge.nonce,
          address,
          signatureHex,
          signedMessageHex,
        }),
      });

      if (!verifyRes.ok) {
        const errData = await verifyRes.json();
        throw new Error(errData.error || "Authentication verification failed");
      }

      const verifyData = await verifyRes.json();
      if (verifyData.success && verifyData.user) {
        setUser(verifyData.user);
      } else {
        throw new Error("Authentication failed");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [wallet]);

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    } finally {
      setUser(null);
      setIsLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      error,
      signIn,
      signOut,
      refreshSession,
    }),
    [user, isLoading, error, signIn, signOut, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
