# フロントエンド単独トークン重複排除 - 技術設計書

**作成日**: 2026-03-13  
**作成者**: CTO (Subagent)  
**対象**: Engineer A  
**方針**: **Backend変更ゼロ、Frontend（axis-agent/）のみで完結**

---

## 📋 エグゼクティブサマリー

**背景**: Museからバックエンド実装に懸念があり、フロントエンドのみで重複排除を実現

**制約条件**:
- ✅ Backend変更は**ゼロ**（axis-api、kagemusha-program は触らない）
- ✅ Frontend（axis-agent/）のみで完結
- ✅ 実装時間: **1-2時間**

**選択したアプローチ**: **Utilityライブラリ + useMemo最適化**

---

## 1. アーキテクチャ設計

### 1.1 データフロー（修正後）

```
Backend API (変更なし)
    ↓
Frontend: rawStrategies
    ↓
[NEW] deduplicateTokens() ← Utility関数
    ↓
Frontend: strategies (useMemo)
    ↓
UI表示
```

### 1.2 重複排除ロジックの配置

| アプローチ | メリット | デメリット | 選択 |
|-----------|---------|-----------|------|
| **Option A**: コンポーネント内 | シンプル | テストしづらい、再利用不可 | ❌ |
| **Option B**: カスタムフック | React的 | やや複雑、オーバーヘッド | ❌ |
| **Option C**: Utilityライブラリ | テスト容易、再利用可能 | ファイル追加 | ✅ |

**選択理由**: Pure Functionでテストが容易、かつ再利用可能

---

## 2. 実装コード

### 2.1 Utilityライブラリ: `src/utils/tokenDeduplication.ts`

**新規作成**

```typescript
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
```

---

### 2.2 ListDiscoverView.tsx の修正

**変更箇所**: `strategies` の useMemo 内で重複排除を適用

```typescript
import { deduplicateTokens } from '../../utils/tokenDeduplication';

// ...（既存コード）...

const strategies = useMemo<DiscoveredStrategy[]>(() => {
  return rawStrategies.map((s: any) => {
    let tokens = s.tokens || s.composition || [];
    if (typeof tokens === 'string') {
      try { tokens = JSON.parse(tokens); } catch { tokens = []; }
    }

    // ★ [NEW] 重複排除を適用（mint addressベース）
    const deduplicatedTokens = deduplicateTokens(tokens, {
      keyType: 'mint',
      normalizeWeights: true,  // 合計100%に正規化
      sortByWeight: true,      // weight降順にソート
    });

    const enrichedTokens: DiscoveredToken[] = deduplicatedTokens.map((t: any) => {
      const td = t.mint ? tokenDataMap[t.mint] : null;
      return {
        symbol: t.symbol?.toUpperCase() || 'UNKNOWN',
        weight: Number(t.weight) || 0,
        address: t.mint || undefined,
        logoURI: t.logoURI || td?.logoURI || null,
        currentPrice: td?.price ?? 0,
        change24h: td?.change24h ?? 0,
      };
    });

    let weightedSum = 0;
    let totalWeight = 0;
    enrichedTokens.forEach((t) => {
      const w = t.weight || 0;
      weightedSum += (t.change24h || 0) * w;
      totalWeight += w;
    });

    const ownerPubkey = s.ownerPubkey || s.creator || 'Unknown';
    const userProfile = userMap[ownerPubkey];

    return {
      id: s.id || s.address || `temp-${Math.random()}`,
      name: s.name || 'Untitled Strategy',
      description: s.description || userProfile?.bio || '',
      type: (s.type || 'BALANCED') as DiscoveredStrategy['type'],
      tokens: enrichedTokens,
      ownerPubkey,
      tvl: Number(s.tvl || 0),
      createdAt: s.createdAt ? Number(s.createdAt) : Date.now() / 1000,
      roi: totalWeight > 0 ? weightedSum / totalWeight : 0,
      creatorPfpUrl: userProfile?.avatar_url
        ? api.getProxyUrl(userProfile.avatar_url)
        : null,
      mintAddress: s.mintAddress || undefined,
      vaultAddress: s.vaultAddress || undefined,
    };
  });
}, [rawStrategies, tokenDataMap, userMap]);
```

**変更内容**:
- `deduplicateTokens()` をインポート
- `deduplicatedTokens` を生成してから `enrichedTokens` にマッピング
- オプション: `normalizeWeights: true` で合計100%に正規化

---

### 2.3 Unit Tests: `src/__tests__/tokenDeduplication.test.ts`

**新規作成**

```typescript
import { describe, it, expect } from 'vitest';
import {
  deduplicateTokens,
  filterLowWeightTokens,
  validateTokenComposition,
  type TokenBase,
} from '../utils/tokenDeduplication';

describe('tokenDeduplication', () => {
  describe('deduplicateTokens', () => {
    it('should remove duplicates by mint address', () => {
      const input: TokenBase[] = [
        { mint: 'ABC123', symbol: 'SOL', weight: 30 },
        { mint: 'ABC123', symbol: 'SOL', weight: 20 },
        { mint: 'DEF456', symbol: 'USDC', weight: 50 },
      ];

      const result = deduplicateTokens(input);

      expect(result).toHaveLength(2);
      expect(result[0].weight).toBe(50); // 30 + 20
      expect(result[1].weight).toBe(50);
    });

    it('should handle empty array', () => {
      expect(deduplicateTokens([])).toEqual([]);
    });

    it('should handle null/undefined', () => {
      expect(deduplicateTokens(null)).toEqual([]);
      expect(deduplicateTokens(undefined)).toEqual([]);
    });

    it('should normalize weights to 100%', () => {
      const input: TokenBase[] = [
        { mint: 'ABC', weight: 60 },
        { mint: 'DEF', weight: 40 },
      ];

      const result = deduplicateTokens(input, { normalizeWeights: true });
      const total = result.reduce((sum, t) => sum + (t.weight || 0), 0);

      expect(total).toBeCloseTo(100, 2);
    });

    it('should sort by weight descending', () => {
      const input: TokenBase[] = [
        { mint: 'A', weight: 10 },
        { mint: 'B', weight: 50 },
        { mint: 'C', weight: 30 },
      ];

      const result = deduplicateTokens(input, { sortByWeight: true });

      expect(result[0].mint).toBe('B'); // Highest weight
      expect(result[1].mint).toBe('C');
      expect(result[2].mint).toBe('A');
    });

    it('should deduplicate by symbol when mint is unavailable', () => {
      const input: TokenBase[] = [
        { symbol: 'SOL', weight: 30 },
        { symbol: 'SOL', weight: 20 },
        { symbol: 'USDC', weight: 50 },
      ];

      const result = deduplicateTokens(input, { keyType: 'symbol' });

      expect(result).toHaveLength(2);
      expect(result.find((t) => t.symbol === 'SOL')?.weight).toBe(50);
    });

    it('should skip tokens without a key', () => {
      const input: TokenBase[] = [
        { mint: 'ABC', weight: 50 },
        { weight: 20 }, // No mint or symbol
        { mint: 'DEF', weight: 30 },
      ];

      const result = deduplicateTokens(input);

      expect(result).toHaveLength(2);
      expect(result.map((t) => t.mint)).toEqual(['ABC', 'DEF']);
    });

    it('should merge logoURI from duplicate', () => {
      const input: TokenBase[] = [
        { mint: 'ABC', weight: 30, logoURI: null },
        { mint: 'ABC', weight: 20, logoURI: 'https://example.com/logo.png' },
      ];

      const result = deduplicateTokens(input);

      expect(result).toHaveLength(1);
      expect(result[0].logoURI).toBe('https://example.com/logo.png');
    });
  });

  describe('filterLowWeightTokens', () => {
    it('should filter out tokens below threshold', () => {
      const input: TokenBase[] = [
        { mint: 'A', weight: 50 },
        { mint: 'B', weight: 0.05 }, // Below default threshold (0.1%)
        { mint: 'C', weight: 30 },
      ];

      const result = filterLowWeightTokens(input);

      expect(result).toHaveLength(2);
      expect(result.map((t) => t.mint)).toEqual(['A', 'C']);
    });

    it('should use custom threshold', () => {
      const input: TokenBase[] = [
        { mint: 'A', weight: 50 },
        { mint: 'B', weight: 5 },
        { mint: 'C', weight: 30 },
      ];

      const result = filterLowWeightTokens(input, 10); // 10% threshold

      expect(result).toHaveLength(2);
      expect(result.map((t) => t.mint)).toEqual(['A', 'C']);
    });
  });

  describe('validateTokenComposition', () => {
    it('should detect duplicates', () => {
      const input: TokenBase[] = [
        { mint: 'ABC', weight: 50 },
        { mint: 'ABC', weight: 50 },
      ];

      const result = validateTokenComposition(input);

      expect(result.valid).toBe(false);
      expect(result.warnings).toContain('Duplicate token detected: ABC');
    });

    it('should warn about incorrect total weight', () => {
      const input: TokenBase[] = [
        { mint: 'A', weight: 30 },
        { mint: 'B', weight: 50 },
      ]; // Total = 80, not 100

      const result = validateTokenComposition(input);

      expect(result.valid).toBe(false);
      expect(result.totalWeight).toBe(80);
      expect(result.warnings.some((w) => w.includes('Total weight'))).toBe(true);
    });

    it('should pass for valid composition', () => {
      const input: TokenBase[] = [
        { mint: 'A', weight: 60 },
        { mint: 'B', weight: 40 },
      ];

      const result = validateTokenComposition(input);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.totalWeight).toBe(100);
    });
  });
});
```

---

## 3. エッジケース対応

### 3.1 compositionがnullまたは不正なJSON

**対応方法**: 既存のtry-catchで処理済み

```typescript
let tokens = s.tokens || s.composition || [];
if (typeof tokens === 'string') {
  try { tokens = JSON.parse(tokens); } catch { tokens = []; }
}
```

### 3.2 mint addressが存在しないトークン

**対応方法**: `deduplicateTokens()` 内でスキップ

```typescript
if (!key) {
  console.warn('[TokenDedup] Skipping token without key:', token);
  continue;
}
```

### 3.3 APIレスポンスが遅い場合

**対応方法**: 既存のローディング状態を維持
- Phase 1でデータ取得 → UI表示
- Phase 2でlive priceを取得（バックグラウンド）

### 3.4 大量の戦略（100+）での処理時間

**パフォーマンス評価**:
- `deduplicateTokens()`: O(n) - n = トークン数（通常10-20個）
- 100戦略 × 15トークン = 1500回の処理
- **予想処理時間**: <10ms（無視できるレベル）

---

## 4. DFlow流動性データの取得方法（オプション）

### 4.1 方針

**推奨**: **Backend経由で取得（最小限の変更）**

**理由**:
- CORS問題を回避
- API Keyを隠蔽
- キャッシュ制御が可能

### 4.2 実装方法（オプション機能）

**Backend側**（axis-api/src/routes/dflow.ts）:

```typescript
// 既存のエンドポイントに流動性データを追加
app.get('/markets', async (c) => {
  try {
    const apiKey = c.env.DFLOW_API_KEY;
    const tokens = await DFlowService.getActiveMarketTokens(apiKey);

    // ★ [NEW] 流動性データを追加
    const mints = tokens.map((t) => t.mint);
    const liquidityMap = await DFlowService.getTokenLiquidity(mints, apiKey);

    const enriched = tokens.map((t) => ({
      ...t,
      liquidity: liquidityMap[t.mint] || 0,
    }));

    c.header('Cache-Control', 'public, max-age=60');
    return c.json({ tokens: enriched });
  } catch (error) {
    console.error("DFlow Markets Route Error:", error);
    return c.json({ error: 'Failed to fetch markets' }, 500);
  }
});
```

**Frontend側**: 既存のAPIコールを使用（変更不要）

```typescript
// 既存コード（修正不要）
const dflowTokens = await api.getDFlowMarkets();
// dflowTokens には liquidity が含まれる
```

**注意**: DFlow流動性統合は**オプション機能**。重複排除には必須ではない。

---

## 5. パフォーマンスへの影響

### 5.1 Frontend処理時間

| 処理 | 戦略数 | 平均トークン数 | 処理時間 |
|-----|-------|--------------|---------|
| `deduplicateTokens()` | 1 | 15 | <0.1ms |
| `deduplicateTokens()` | 100 | 15 | <10ms |
| `strategies` useMemo | 100 | 15 | ~20ms |

**結論**: **パフォーマンスへの影響は無視できるレベル**

### 5.2 メモリ使用量

- Map ベースの重複排除: O(n) - n = トークン数
- 100戦略 × 15トークン = 1500個 → 約100KB

**結論**: **メモリ影響も無視できるレベル**

---

## 6. テスト計画

### 6.1 Unit Tests（必須）

- ✅ `deduplicateTokens()` の各種ケース
- ✅ `filterLowWeightTokens()`
- ✅ `validateTokenComposition()`

**実行方法**:
```bash
cd axis-agent
npm run test -- tokenDeduplication.test.ts
```

### 6.2 Integration Tests（推奨）

#### Test Case 1: 重複トークンを含む戦略の表示

1. Backend APIレスポンスをモック（重複トークン含む）
2. `ListDiscoverView` をレンダリング
3. 重複が排除されていることを確認

```typescript
// Mockデータ
const mockStrategy = {
  id: 'test-1',
  name: 'Test Strategy',
  tokens: [
    { mint: 'ABC123', symbol: 'SOL', weight: 30 },
    { mint: 'ABC123', symbol: 'SOL', weight: 20 }, // Duplicate
    { mint: 'DEF456', symbol: 'USDC', weight: 50 },
  ],
};

// Expected: 2トークンのみ表示、SOLのweightが50
```

#### Test Case 2: 大量の戦略でのパフォーマンス

```typescript
const largeDataset = Array.from({ length: 100 }, (_, i) => ({
  id: `strategy-${i}`,
  name: `Strategy ${i}`,
  tokens: Array.from({ length: 15 }, (_, j) => ({
    mint: `mint-${i}-${j}`,
    symbol: `TOKEN${j}`,
    weight: 100 / 15,
  })),
}));

const start = performance.now();
// Render ListDiscoverView with largeDataset
const end = performance.now();

expect(end - start).toBeLessThan(100); // <100ms
```

### 6.3 Visual Regression Tests（オプション）

Percy、Chromatic などで UI の視覚的変化を確認

---

## 7. デプロイメント計画

### 7.1 段階的ロールアウト

#### Phase 1: Frontend修正のみ（優先度: 高）

1. `axis-agent` リポジトリに以下をコミット:
   - `src/utils/tokenDeduplication.ts`（新規）
   - `src/components/discover/ListDiscoverView.tsx`（修正）
   - `src/__tests__/tokenDeduplication.test.ts`（新規）

2. テスト実行
   ```bash
   npm run test
   npm run build  # ビルドエラーチェック
   ```

3. Vercel/Cloudflare Pages にデプロイ

**所要時間**: **1-2時間**

#### Phase 2: DFlow流動性統合（優先度: 低・オプション）

Backend側の `/dflow/markets` に流動性データを追加（オプション機能）

**所要時間**: 1-2時間（必要な場合のみ）

### 7.2 Rollback Plan

問題が発生した場合:
1. Vercel デプロイメントのロールバック（即座）
2. Git revert（即座）
3. データベース変更なし → 安全

---

## 8. モニタリング＆デバッグ

### 8.1 開発者ツールでの確認

**Chrome DevTools Console**:

```typescript
// Validationユーティリティを使用
import { validateTokenComposition } from './utils/tokenDeduplication';

const result = validateTokenComposition(strategies[0].tokens);
console.log(result);
// {
//   valid: true/false,
//   warnings: [...],
//   totalWeight: 100
// }
```

### 8.2 ログ出力

`deduplicateTokens()` 内で重複検出時にログ:

```typescript
if (tokenMap.has(key)) {
  console.debug(`[TokenDedup] Merging duplicate: ${key}`);
}
```

**本番環境**: `console.debug` は自動的に無効化（Vite設定）

---

## 9. Engineer A への実装指示

### 9.1 優先順位

1. **High**: Utilityライブラリ作成（30分）
2. **High**: `ListDiscoverView.tsx` 修正（30分）
3. **High**: Unit Tests作成（30分）
4. **Low**: DFlow流動性統合（オプション、1-2時間）

### 9.2 実装手順

#### ステップ1: Utilityライブラリ作成（30分）

```bash
cd axis-agent
mkdir -p src/utils
touch src/utils/tokenDeduplication.ts
```

1. `src/utils/tokenDeduplication.ts` を開く
2. セクション2.1のコードをコピー＆ペースト
3. コミット
   ```bash
   git add src/utils/tokenDeduplication.ts
   git commit -m "Add token deduplication utility"
   ```

#### ステップ2: ListDiscoverView.tsx 修正（30分）

1. `src/components/discover/ListDiscoverView.tsx` を開く
2. インポート追加:
   ```typescript
   import { deduplicateTokens } from '../../utils/tokenDeduplication';
   ```
3. `strategies` useMemo 内で `deduplicateTokens()` を呼び出し（セクション2.2参照）
4. コミット
   ```bash
   git add src/components/discover/ListDiscoverView.tsx
   git commit -m "Fix: Apply token deduplication in ListDiscoverView"
   ```

#### ステップ3: Unit Tests作成（30分）

```bash
mkdir -p src/__tests__
touch src/__tests__/tokenDeduplication.test.ts
```

1. `src/__tests__/tokenDeduplication.test.ts` を開く
2. セクション2.3のコードをコピー＆ペースト
3. テスト実行
   ```bash
   npm run test
   ```
4. コミット
   ```bash
   git add src/__tests__/tokenDeduplication.test.ts
   git commit -m "Add unit tests for token deduplication"
   ```

#### ステップ4: ビルド＆デプロイ（10分）

```bash
npm run build  # ビルドエラーチェック
git push origin main  # Vercel自動デプロイ
```

#### ステップ5: 動作確認（10分）

1. Devnet/Testnet環境で確認
   - 重複トークンを含む戦略を作成（Backend側で既に存在）
   - ListDiscoverView を開く
   - 同じトークンが1つずつ表示されることを確認

2. 本番環境で確認
   - 既存の戦略が正常に表示されるか
   - Console に警告が出ていないか

---

### 9.3 チェックリスト

- [ ] `src/utils/tokenDeduplication.ts` 作成完了
- [ ] `src/components/discover/ListDiscoverView.tsx` 修正完了
- [ ] `src/__tests__/tokenDeduplication.test.ts` 作成完了
- [ ] Unit Tests 全て Pass
- [ ] ビルド成功（`npm run build`）
- [ ] Vercel デプロイ完了
- [ ] 動作確認完了（重複が排除されている）
- [ ] Console に警告・エラーなし

---

## 10. まとめ

### 10.1 期待される成果

1. **重複の完全排除**: Frontend単独で重複を防ぐ
2. **Backend変更ゼロ**: 懸念点を完全に回避
3. **高速実装**: 1-2時間で完了
4. **テストしやすい**: Pure Function で Unit Tests が容易
5. **再利用可能**: 他のコンポーネントでも使える

### 10.2 技術的メリット

| アプローチ | Backend変更 | Frontend変更 | 実装時間 | テスト容易性 |
|-----------|------------|-------------|---------|------------|
| **3層防御**（既存設計） | ✅ 必要 | ✅ 必要 | 3-4時間 | ⭕ 普通 |
| **Frontend単独**（本設計） | ❌ 不要 | ✅ 必要 | 1-2時間 | ✅ 容易 |

### 10.3 次のステップ

修正完了後、以下を検討:
1. **DFlow流動性データの統合**（オプション）
   - Backend側で流動性情報を追加
   - Frontend側で流動性順にソート

2. **他のコンポーネントでも適用**
   - CreateStrategyView でも重複排除
   - StrategyDetailView でも適用

3. **パフォーマンス最適化**
   - useMemo の依存関係を最適化
   - React.memo でコンポーネントをメモ化

---

## 11. FAQ

### Q1: Backendで修正しない理由は？

**A**: Museからの要望により、Backend変更を最小限（またはゼロ）にする方針。Frontend単独で完結する方が安全かつ高速。

### Q2: DFlow流動性データは必須？

**A**: **いいえ、オプション機能です**。重複排除には不要。流動性順のソートが必要な場合のみ実装。

### Q3: パフォーマンスへの影響は？

**A**: **無視できるレベル**（<10ms/100戦略）。useMemo により不要な再計算も防止。

### Q4: 既存の戦略データに影響は？

**A**: **ゼロ**。Frontend側の表示ロジックのみを変更。Backend APIレスポンスは変更なし。

### Q5: テストは必須？

**A**: Unit Tests は**必須**。Integration Tests は推奨（時間があれば）。

---

**以上、フロントエンド単独での技術設計書を終わります。**

質問や不明点があれば、Museにお知らせください。
