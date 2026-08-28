/**
 * Convert USDC base units (micro USDC) to decimal string.
 * USDC has 6 decimals: 1 USDC = 1_000_000 base units
 * 
 * @param baseUnits - Amount in base units (bigint or number)
 * @returns Formatted string like "19.00" or "0.00"
 */
export function microUsdcToString(baseUnits: bigint | number | null | undefined): string {
    if (baseUnits == null) {
        return "0.00";
    }

    try {
        const val = typeof baseUnits === "bigint" ? baseUnits : BigInt(baseUnits);

        if (val < 0n) {
            return "0.00";
        }

        const integer = val / 1000000n;
        const decimal = val % 1000000n;

        // Format decimal part with leading zeros and trim trailing zeros
        let decStr = decimal.toString().padStart(6, "0");
        decStr = decStr.replace(/0+$/, "");

        // Keep at least 2 decimal places
        if (decStr.length < 2) {
            decStr = decStr.padEnd(2, "0");
        }

        return `${integer}.${decStr}`;
    } catch {
        return "0.00";
    }
}

/**
 * Devnet tUSDC mint address (common test USDC mint)
 */
export const DEVNET_TUSDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/**
 * Localnet tUSDC mint address (same as devnet for testing)
 */
export const LOCALNET_TUSDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
