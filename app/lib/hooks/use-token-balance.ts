"use client";

import { useEffect } from "react";
import useSWR from "swr";
import {
    type Address,
    address as solanaAddress,
    getProgramDerivedAddress,
    getAddressEncoder,
} from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import { useSolanaClient } from "../solana-client-context";

/**
 * Derive the Associated Token Address (ATA) for a given owner and mint.
 * Standard ATA derivation using seeds: [owner, tokenProgramId, mint]
 */
async function findAssociatedTokenAddress(
    owner: Address,
    mint: Address
): Promise<readonly [Address, number]> {
    const TOKEN_PROGRAM_ID = solanaAddress("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const ASSOCIATED_TOKEN_PROGRAM_ID = solanaAddress("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

    const addressEncoder = getAddressEncoder();

    const [ata, bump] = await getProgramDerivedAddress({
        programAddress: ASSOCIATED_TOKEN_PROGRAM_ID,
        seeds: [
            addressEncoder.encode(owner),
            addressEncoder.encode(TOKEN_PROGRAM_ID),
            addressEncoder.encode(mint),
        ],
    });

    return [ata, bump];
}

/**
 * Hook to fetch and subscribe to SPL token balance for a given owner and mint.
 * Returns balance as bigint base units, or null if the account doesn't exist.
 * 
 * @param owner - The wallet address that owns the token account
 * @param mint - The SPL token mint address
 * @returns Object containing amount (bigint | null), isLoading, error, mutate
 */
export function useTokenBalance(owner?: Address, mint?: Address) {
    const { cluster } = useCluster();
    const client = useSolanaClient();

    const { data, isLoading, error, mutate } = useSWR(
        owner && mint ? (["token-balance", cluster, owner, mint] as const) : null,
        async ([, , ownerAddr, mintAddr]) => {
            try {
                // Derive the associated token address
                const [ata] = await findAssociatedTokenAddress(ownerAddr, mintAddr);

                // Fetch account info
                const accountInfo = await client.rpc.getAccountInfo(ata, {
                    encoding: "base64",
                }).send();

                // If account doesn't exist, return null (not an error condition)
                if (!accountInfo.value) {
                    return null;
                }

                // Parse the token account data
                // Token account layout: amount is at bytes 64-71 (u64 little-endian)
                const data = accountInfo.value.data;

                // Decode base64 if necessary
                let buffer: Uint8Array;
                if (typeof data === "string") {
                    buffer = Uint8Array.from(atob(data), c => c.charCodeAt(0));
                } else if (Array.isArray(data) && data.length === 2) {
                    // [base64String, encoding]
                    buffer = Uint8Array.from(atob(data[0]), c => c.charCodeAt(0));
                } else {
                    return null;
                }

                // Extract amount (u64 at offset 64)
                if (buffer.length < 72) {
                    return null;
                }

                // Read u64 little-endian from offset 64
                let amount = 0n;
                for (let i = 0; i < 8; i++) {
                    amount |= BigInt(buffer[64 + i]!) << BigInt(i * 8);
                }

                return amount;
            } catch (err) {
                // If the account doesn't exist, return null instead of throwing
                if (err instanceof Error && err.message.includes("could not find")) {
                    return null;
                }
                throw err;
            }
        },
        {
            refreshInterval: 60_000,
            revalidateOnFocus: true,
            // Don't throw on error, just return null
            shouldRetryOnError: false,
        }
    );

    useEffect(() => {
        if (!owner || !mint) return;

        const abortController = new AbortController();

        const subscribe = async () => {
            try {
                const [ata] = await findAssociatedTokenAddress(owner, mint);

                const notifications = await client.rpcSubscriptions
                    .accountNotifications(ata, { commitment: "confirmed" })
                    .subscribe({ abortSignal: abortController.signal });

                for await (const notification of notifications) {
                    // Parse amount from account data
                    const accountData = notification.value.data;

                    if (!accountData) {
                        mutate(null, { revalidate: false });
                        continue;
                    }

                    let buffer: Uint8Array;
                    if (typeof accountData === "string") {
                        buffer = Uint8Array.from(atob(accountData), c => c.charCodeAt(0));
                    } else if (Array.isArray(accountData) && accountData.length === 2) {
                        buffer = Uint8Array.from(atob(accountData[0]), c => c.charCodeAt(0));
                    } else {
                        continue;
                    }

                    if (buffer.length >= 72) {
                        let amount = 0n;
                        for (let i = 0; i < 8; i++) {
                            amount |= BigInt(buffer[64 + i]!) << BigInt(i * 8);
                        }
                        mutate(amount, { revalidate: false });
                    }
                }
            } catch {
                // SWR polling and focus revalidation remain as fallback
            }
        };

        void subscribe();

        return () => {
            abortController.abort();
        };
    }, [owner, mint, client, mutate]);

    return {
        amount: (data ?? null) as bigint | null,
        isLoading,
        error,
        mutate,
    };
}
