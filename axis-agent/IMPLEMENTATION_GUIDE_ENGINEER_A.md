# Engineer A 実装ガイド - トークン重複排除（Frontend単独）

**タスク**: フロントエンドのみでトークン重複排除を実装  
**所要時間**: 1-2時間  
**Backend変更**: **なし**（axis-api、kagemusha-program は触らない）

---

## 📋 実装チェックリスト

### Phase 1: コードファイル作成・修正（1時間）

- [ ] ✅ `src/utils/tokenDeduplication.ts` 作成済み（既にファイル存在）
- [ ] `src/components/discover/ListDiscoverView.tsx` 修正
- [ ] `src/__tests__/tokenDeduplication.test.ts` 作成

### Phase 2: テスト＆デプロイ（30分）

- [ ] Unit Tests 実行（`npm run test`）
- [ ] ビルド確認（`npm run build`）
- [ ] Git コミット＆プッシュ
- [ ] 動作確認（Vercel/Production）

---

## 🚀 実装手順

### Step 1: ListDiscoverView.tsx の修正

**ファイル**: `src/components/discover/ListDiscoverView.tsx`

#### 1.1 インポート追加（ファイル上部）

既存のインポート文の下に追加:

```typescript
import { deduplicateTokens } from '../../utils/tokenDeduplication';
```

**挿入位置**: 
```typescript
import { api } from '../../services/api';
import { JupiterService } from '../../services/jupiter';
import { DexScreenerService } from '../../services/dexscreener';
import { SwipeCardBody, type StrategyCardData } from './SwipeCard';
// ↓ ここに追加
import { deduplicateTokens } from '../../utils/tokenDeduplication';
```

#### 1.2 strategies useMemo の修正

**現在のコード** (Line ~480):
```typescript
const strategies = useMemo<DiscoveredStrategy[]>(() => {
  return rawStrategies.map((s: any) => {
    let tokens = s.tokens || s.composition || [];
    if (typeof tokens === 'string') {
      try { tokens = JSON.parse(tokens); } catch { tokens = []; }
    }

    const enrichedTokens: DiscoveredToken[] = tokens.map((t: any) => {
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
    // ... 以下続く
```

**修正後のコード**:
```typescript
const strategies = useMemo<DiscoveredStrategy[]>(() => {
  return rawStrategies.map((s: any) => {
    let tokens = s.tokens || s.composition || [];
    if (typeof tokens === 'string') {
      try { tokens = JSON.parse(tokens); } catch { tokens = []; }
    }

    // ★ [NEW] 重複排除を適用
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
    // ... 以下続く（変更なし）
```

**変更点**:
1. `deduplicateTokens()` を呼び出し
2. `tokens` の代わりに `deduplicatedTokens` を使用
3. 重複排除後に `enrichedTokens` をマッピング

**検索方法**: 
- `const enrichedTokens: DiscoveredToken[] = tokens.map(` を検索
- その直前に `deduplicateTokens()` を挿入

---

### Step 2: Unit Tests の作成

**ファイル**: `src/__tests__/tokenDeduplication.test.ts`（新規作成）

```bash
mkdir -p src/__tests__
touch src/__tests__/tokenDeduplication.test.ts
```

**内容**: 以下をコピー＆ペースト

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

### Step 3: テスト実行

```bash
cd /Users/yusukekikuta/.openclaw/workspace/Axis_MVP/axis-agent
npm run test
```

**期待される出力**:
```
✓ tokenDeduplication (11)
  ✓ deduplicateTokens (7)
    ✓ should remove duplicates by mint address
    ✓ should handle empty array
    ✓ should handle null/undefined
    ✓ should normalize weights to 100%
    ✓ should sort by weight descending
    ✓ should deduplicate by symbol when mint is unavailable
    ✓ should skip tokens without a key
    ✓ should merge logoURI from duplicate
  ✓ filterLowWeightTokens (2)
    ✓ should filter out tokens below threshold
    ✓ should use custom threshold
  ✓ validateTokenComposition (3)
    ✓ should detect duplicates
    ✓ should warn about incorrect total weight
    ✓ should pass for valid composition

Test Files  1 passed (1)
     Tests  14 passed (14)
```

---

### Step 4: ビルド確認

```bash
npm run build
```

**期待される出力**:
```
✓ built in XXXms
```

エラーが出た場合は、TypeScript型エラーを修正してください。

---

### Step 5: Git コミット

```bash
git add src/utils/tokenDeduplication.ts
git add src/components/discover/ListDiscoverView.tsx
git add src/__tests__/tokenDeduplication.test.ts
git add FRONTEND_ONLY_TOKEN_DEDUPLICATION.md
git add IMPLEMENTATION_GUIDE_ENGINEER_A.md

git commit -m "Fix: Frontend-only token deduplication in ListDiscoverView

- Add deduplicateTokens() utility with weight combining
- Apply deduplication in strategies useMemo
- Add comprehensive unit tests
- No backend changes (axis-api untouched)

Resolves duplicate token display bug in Discover page."

git push origin main
```

---

### Step 6: 動作確認

#### 6.1 ローカル確認

```bash
npm run dev
```

1. ブラウザで http://localhost:5173 を開く
2. Discover ページに移動
3. Chrome DevTools Console を開く
4. 以下のコマンドを実行:

```javascript
// 戦略のトークン数を確認
const strategies = document.querySelectorAll('[data-strategy-id]');
console.log(`Total strategies: ${strategies.length}`);

// 重複チェック（手動）
// - 同じロゴが複数表示されていないか
// - 各トークンのweightが合算されているか
```

#### 6.2 本番環境確認

1. Vercel デプロイ完了後、本番URLにアクセス
2. Discover ページを開く
3. 重複が排除されていることを確認
4. Console に警告・エラーがないことを確認

---

## 🐛 トラブルシューティング

### 問題1: テストが失敗する

**エラー**: `Cannot find module '../utils/tokenDeduplication'`

**解決方法**:
```bash
# ファイルパスを確認
ls -la src/utils/tokenDeduplication.ts
ls -la src/__tests__/tokenDeduplication.test.ts

# 存在しない場合、再度作成
```

---

### 問題2: ビルドエラー

**エラー**: `Type 'X' is not assignable to type 'Y'`

**解決方法**:
```typescript
// tokenDeduplication.ts の TokenBase インターフェースを確認
// DiscoveredToken インターフェースと互換性があるか確認

// 必要に応じて型キャストを追加
const deduplicatedTokens = deduplicateTokens(tokens, {
  keyType: 'mint',
  normalizeWeights: true,
  sortByWeight: true,
}) as any[]; // 暫定的にany[]でキャスト
```

---

### 問題3: 重複が排除されない

**確認事項**:
1. `deduplicateTokens()` が呼び出されているか（Console.log で確認）
2. `tokens` 配列が正しく渡されているか
3. `mint` または `address` が存在するか

**デバッグコード**（一時的に追加）:
```typescript
const deduplicatedTokens = deduplicateTokens(tokens, {
  keyType: 'mint',
  normalizeWeights: true,
  sortByWeight: true,
});

console.log('[Debug] Original tokens:', tokens.length);
console.log('[Debug] Deduplicated tokens:', deduplicatedTokens.length);
console.log('[Debug] Tokens:', deduplicatedTokens);
```

---

## 📊 成功の指標

### Before（修正前）
- ❌ 同じトークンが複数表示される（例: SOLが2つ、3つ）
- ❌ weightが分散している（30% + 20% = 2つのSOL）

### After（修正後）
- ✅ 各トークンが1つずつ表示される
- ✅ weightが合算されている（30% + 20% = 50%のSOL）
- ✅ 合計weightが100%に正規化されている
- ✅ Console に警告・エラーなし

---

## 📝 完了報告フォーマット

実装完了後、以下をMuseに報告:

```
✅ トークン重複排除実装完了

【実装内容】
- src/utils/tokenDeduplication.ts 作成
- src/components/discover/ListDiscoverView.tsx 修正
- src/__tests__/tokenDeduplication.test.ts 作成

【テスト結果】
- Unit Tests: 14/14 Pass
- Build: Success
- Local確認: 重複排除動作OK

【デプロイ】
- Commit: [コミットハッシュ]
- Vercel: [デプロイURL]
- 本番確認: OK

【所要時間】
- 実装: X時間
- テスト: Y時間
- 合計: Z時間

【備考】
- Backend変更なし（懸念事項解消）
- パフォーマンス影響なし（<10ms）
```

---

**質問があれば、Museまたはチームに相談してください！**
