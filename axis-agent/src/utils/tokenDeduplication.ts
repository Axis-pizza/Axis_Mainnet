/**
 * Token Deduplication Utility
 * 
 * Removes duplicate tokens by mint address/symbol and combines their weights.
 * Used exclusively in the frontend to sanitize strategy compositions.
 */

export interface TokenBase {
  mint?: string;
  address?: string;
  symbol?: string;
  weight?: number;
  logoURI?: string | null;
  [key: string]: any; // Allow other properties
}

export interface DeduplicationOptions {
  /**
   * Key to use for deduplication
   * - 'mint': Use mint/address (default, most accurate)
   * - 'symbol': Use symbol (less accurate, use when mint is unavailable)
   */
  keyType?: 'mint' | 'symbol';

  /**
   * Normalize weights to sum to 100
   */
  normalizeWeights?: boolean;

  /**
   * Sort by weight descending after deduplication
   */
  sortByWeight?: boolean;
}

/**
 * Deduplicates tokens by mint address or symbol.
 * When duplicates are found, their weights are combined.
 * 
 * @param tokens - Array of tokens (can contain duplicates)
 * @param options - Deduplication options
 * @returns Deduplicated array of tokens
 * 
 * @example
 * const tokens = [
 *   { mint: 'ABC123', symbol: 'SOL', weight: 30 },
 *   { mint: 'ABC123', symbol: 'SOL', weight: 20 },
 *   { mint: 'DEF456', symbol: 'USDC', weight: 50 },
 * ];
 * 
 * const result = deduplicateTokens(tokens);
 * // Result: [
 * //   { mint: 'ABC123', symbol: 'SOL', weight: 50 },
 * //   { mint: 'DEF456', symbol: 'USDC', weight: 50 },
 * // ]
 */
export function deduplicateTokens<T extends TokenBase>(
  tokens: T[] | null | undefined,
  options: DeduplicationOptions = {}
): T[] {
  const {
    keyType = 'mint',
    normalizeWeights = false,
    sortByWeight = false,
  } = options;

  // Handle edge cases
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return [];
  }

  const tokenMap = new Map<string, T>();

  for (const token of tokens) {
    // Determine deduplication key
    let key: string | undefined;
    if (keyType === 'mint') {
      key = token.mint || token.address;
    } else {
      key = token.symbol;
    }

    // Skip tokens without a valid key
    if (!key) {
      console.warn('[TokenDedup] Skipping token without key:', token);
      continue;
    }

    if (!tokenMap.has(key)) {
      // First occurrence: store as-is
      tokenMap.set(key, { ...token });
    } else {
      // Duplicate found: combine weights
      const existing = tokenMap.get(key)!;
      existing.weight = (existing.weight || 0) + (token.weight || 0);

      // Optionally merge other fields (e.g., prefer non-null logoURI)
      if (!existing.logoURI && token.logoURI) {
        existing.logoURI = token.logoURI;
      }
    }
  }

  let result = Array.from(tokenMap.values());

  // Optional: Normalize weights to sum to 100%
  if (normalizeWeights) {
    const totalWeight = result.reduce((sum, t) => sum + (t.weight || 0), 0);
    if (totalWeight > 0) {
      result.forEach((t) => {
        t.weight = ((t.weight || 0) / totalWeight) * 100;
      });
    }
  }

  // Optional: Sort by weight descending
  if (sortByWeight) {
    result.sort((a, b) => (b.weight || 0) - (a.weight || 0));
  }

  return result;
}

/**
 * Filter out tokens with extremely low weights (noise reduction)
 * 
 * @param tokens - Array of tokens
 * @param minWeight - Minimum weight threshold (default: 0.1%)
 * @returns Filtered array
 */
export function filterLowWeightTokens<T extends TokenBase>(
  tokens: T[],
  minWeight: number = 0.1
): T[] {
  return tokens.filter((t) => (t.weight || 0) >= minWeight);
}

/**
 * Validate token composition (debugging utility)
 * 
 * @param tokens - Array of tokens
 * @returns Validation result with warnings
 */
export function validateTokenComposition<T extends TokenBase>(
  tokens: T[]
): {
  valid: boolean;
  warnings: string[];
  totalWeight: number;
} {
  const warnings: string[] = [];
  let totalWeight = 0;

  if (!Array.isArray(tokens)) {
    warnings.push('Tokens is not an array');
    return { valid: false, warnings, totalWeight: 0 };
  }

  const seenKeys = new Set<string>();

  tokens.forEach((token, i) => {
    const key = token.mint || token.address || token.symbol;
    if (!key) {
      warnings.push(`Token at index ${i} has no identifier (mint/address/symbol)`);
    }

    if (key && seenKeys.has(key)) {
      warnings.push(`Duplicate token detected: ${key}`);
    }
    seenKeys.add(key || `unknown-${i}`);

    totalWeight += token.weight || 0;
  });

  if (Math.abs(totalWeight - 100) > 0.01 && tokens.length > 0) {
    warnings.push(`Total weight is ${totalWeight.toFixed(2)}% (expected ~100%)`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
    totalWeight,
  };
}
