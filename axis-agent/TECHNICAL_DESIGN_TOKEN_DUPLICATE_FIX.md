# トークン一覧重複表示バグ修正 - 技術設計書

**作成日**: 2026-03-13  
**作成者**: CTO Technical Review  
**対象**: Engineer A  

---

## 1. 問題の定義

### 1.1 現象
予測市場を組み込んでいるトークンの一覧リストページ（Discover View）にて、同じマーケット（JPやENなど）で複数の同じトークンが同じロゴで表示される重複バグが発生している。

### 1.2 影響範囲
- **ユーザー体験**: 同じトークンが複数表示され、混乱を招く
- **データ整合性**: 実際のトークン数が不明確になる
- **パフォーマンス**: 不要な重複データの処理による負荷

---

## 2. 根本原因分析

### 2.1 アーキテクチャ概要

```
┌─────────────────┐
│  Frontend (SPA) │
│  ListDiscoverView
└────────┬────────┘
         │ API Calls
         ▼
┌─────────────────┐
│   Backend API   │
│ (Cloudflare)    │
│  - /api/discover│
│  - /api/tokens  │
│  - /dflow/markets│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Data Sources  │
│  - D1 Database  │
│  - DFlow API    │
│  - Jupiter API  │
│  - CoinGecko    │
└─────────────────┘
```

### 2.2 データフロー

#### 現在の実装（axis-agent/src/components/discover/ListDiscoverView.tsx）

```typescript
// Phase 1: データ取得
const [publicRes, myRes, tokensRes] = await Promise.all([
  api.discoverStrategies(100),      // /api/discover → strategies table
  api.getUserStrategies(pubkey),    // ユーザー戦略
  api.getTokens(),                  // /api/tokens → CoinGecko
]);

// Phase 2: 戦略レベルでの重複排除
const uniqueMap = new Map<string, any>();
combined.forEach((item: any) => {
  const key = item.id || item.address;
  if (key && !uniqueMap.has(key)) uniqueMap.set(key, item);
});

// Phase 3: トークン情報のエンリッチ
const enrichedTokens = tokens.map((t: any) => {
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
```

### 2.3 特定された問題点

#### 問題1: strategies テーブルの composition JSONに重複トークン
**発生箇所**: `axis-api/src/routes/kagemusha.ts` - POST `/strategies`

```typescript
// 問題のコード
await c.env.axis_db.prepare(`
  INSERT INTO strategies (
    id, owner_pubkey, name, ticker, description, type,
    composition, config, status, created_at, tvl, total_deposited, roi
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 0, 0, 0)
`).bind(
  id, owner_pubkey, name, ticker || '', description || '', type || 'MANUAL',
  JSON.stringify(tokens || []),  // ← ここで重複チェックなし
  JSON.stringify(config || {}), now
).run();
```

**根本原因**: 
- フロントエンドから送られてくる `tokens` 配列に同じ `mint` が複数含まれている場合、そのまま保存される
- バックエンドでの重複チェックがない

#### 問題2: DFlow予測市場トークンの処理
**発生箇所**: `axis-api/src/services/dflow.ts` - `getActiveMarketTokens()`

```typescript
for (const account of accounts as any[]) {
  // YES Token
  if (account.yesMint) {
    tokens.push({
      mint: account.yesMint,
      symbol: "YES",
      name: `YES: ${market.title}`,
      // ...
    });
  }
  // NO Token
  if (account.noMint) {
    tokens.push({
      mint: account.noMint,
      symbol: "NO",
      name: `NO: ${market.title}`,
      // ...
    });
  }
}
```

**根本原因**:
- `market.accounts` が複数の account オブジェクトを含む場合、同じ yesMint/noMint が複数回追加される
- アカウント構造の誤解釈により重複が発生

#### 問題3: フロントエンドでのトークンレベル重複排除の欠如
**発生箇所**: `axis-agent/src/components/discover/ListDiscoverView.tsx`

**根本原因**:
- 戦略レベル（strategy.id）での重複排除は実装済み
- 各戦略内のトークン配列（composition）に対する重複排除がない
- 同じ mint address を持つトークンが複数回表示される

---

## 3. 修正方針

### 3.1 防御的多層アプローチ

重複を**3つのレイヤー**で防ぐ：

```
Layer 1: Backend - データ保存時の重複排除
    ↓
Layer 2: Backend - データ取得時のサニタイズ
    ↓
Layer 3: Frontend - 表示前の最終チェック
```

### 3.2 DFlow流動性データの活用

DFlowの流動性データを以下の用途に活用：

1. **重複排除の優先順位決定**: 流動性が高いトークンを優先表示
2. **表示順序の最適化**: 流動性順にソート
3. **フィルタリング**: 流動性が極端に低いトークン（例: <$100）を除外

---

## 4. 実装詳細設計

### 4.1 Layer 1: Backend - データ保存時の重複排除

#### 4.1.1 strategies作成時の重複排除

**ファイル**: `axis-api/src/routes/kagemusha.ts`

**修正内容**:

```typescript
// ★ 新規ヘルパー関数を追加
function deduplicateTokens(tokens: any[]): any[] {
  if (!Array.isArray(tokens)) return [];
  
  const seen = new Map<string, any>();
  
  for (const token of tokens) {
    const key = token.mint || token.address || token.symbol;
    if (!key) continue;
    
    if (!seen.has(key)) {
      seen.set(key, token);
    } else {
      // 重複の場合、weightを合算
      const existing = seen.get(key)!;
      existing.weight = (existing.weight || 0) + (token.weight || 0);
    }
  }
  
  return Array.from(seen.values());
}

// POST /strategies の修正
app.post('/strategies', async (c) => {
  try {
    const body = await c.req.json();
    const { owner_pubkey, name, ticker, description, type, tokens, address, config } = body;

    if (!owner_pubkey || !name) {
      return c.json({ success: false, error: 'owner_pubkey and name are required' }, 400);
    }

    // ★ 重複排除を適用
    const deduplicatedTokens = deduplicateTokens(tokens);
    
    // weightの正規化（合計100%になるように調整）
    const totalWeight = deduplicatedTokens.reduce((sum, t) => sum + (t.weight || 0), 0);
    if (totalWeight > 0) {
      deduplicatedTokens.forEach(t => {
        t.weight = (t.weight || 0) / totalWeight * 100;
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const existing = await c.env.axis_db.prepare(
      "SELECT id FROM strategies WHERE owner_pubkey = ? AND name = ?"
    ).bind(owner_pubkey, name).first();

    if (existing) {
      await c.env.axis_db.prepare(
        `UPDATE strategies SET ticker = ?, description = ?, composition = ?, config = ? WHERE id = ?`
      ).bind(
        ticker || '', description || '',
        JSON.stringify(deduplicatedTokens),  // ★ 重複排除済みデータ
        JSON.stringify(config || {}),
        existing.id
      ).run();
      return c.json({ success: true, strategyId: existing.id, updated: true });
    }

    const id = crypto.randomUUID();
    await c.env.axis_db.prepare(`
      INSERT INTO strategies (
        id, owner_pubkey, name, ticker, description, type,
        composition, config, status, created_at, tvl, total_deposited, roi
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 0, 0, 0)
    `).bind(
      id, owner_pubkey, name, ticker || '', description || '', type || 'MANUAL',
      JSON.stringify(deduplicatedTokens),  // ★ 重複排除済みデータ
      JSON.stringify(config || {}), now
    ).run();

    return c.json({ success: true, strategyId: id });
  } catch (e: any) {
    console.error('[CreateStrategy] Error:', e);
    return c.json({ success: false, error: e.message }, 500);
  }
});
```

#### 4.1.2 DFlow予測市場トークンの重複排除

**ファイル**: `axis-api/src/services/dflow.ts`

**修正内容**:

```typescript
export class DFlowService {
  static async getActiveMarketTokens(apiKey: string): Promise<DFlowTokenInfo[]> {
    if (!apiKey) {
      console.warn("⚠️ DFLOW_API_KEY is not set.");
      return [];
    }

    try {
      const url = `${DFLOW_API_BASE}/api/v1/events?withNestedMarkets=true&status=active&limit=100`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`DFlow API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const events = data.events || [];
      
      // ★ Mapで重複管理
      const tokenMap = new Map<string, DFlowTokenInfo>();

      for (const event of events) {
        if (!event.markets) continue;

        for (const market of event.markets) {
          // YES/NO の現在価格(Mid Price)を計算
          const yesBid = market.yesBid ? parseFloat(market.yesBid) : null;
          const yesAsk = market.yesAsk ? parseFloat(market.yesAsk) : null;
          let yesPrice = 0.5;
          if (yesBid !== null && yesAsk !== null) yesPrice = (yesBid + yesAsk) / 2;
          else if (yesBid !== null) yesPrice = yesBid;
          else if (yesAsk !== null) yesPrice = yesAsk;

          const noBid = market.noBid ? parseFloat(market.noBid) : null;
          const noAsk = market.noAsk ? parseFloat(market.noAsk) : null;
          let noPrice = 0.5;
          if (noBid !== null && noAsk !== null) noPrice = (noBid + noAsk) / 2;
          else if (noBid !== null) noPrice = noBid;
          else if (noAsk !== null) noPrice = noAsk;

          const eventImage = event.imageUrl || "";
          const expiry = market.expirationTime
            ? new Date(market.expirationTime * 1000).toISOString()
            : "";

          // ★ accounts が配列かオブジェクトかを確認
          const accountsList = Array.isArray(market.accounts)
            ? market.accounts
            : market.accounts
            ? [market.accounts]
            : [];

          // ★ 最初のアカウントのみを使用（重複を防ぐ）
          const primaryAccount = accountsList[0];
          if (!primaryAccount) continue;

          // YES Token
          if (primaryAccount.yesMint && !tokenMap.has(primaryAccount.yesMint)) {
            tokenMap.set(primaryAccount.yesMint, {
              mint: primaryAccount.yesMint,
              symbol: "YES",
              name: `YES: ${market.title}`,
              image: eventImage,
              side: 'YES',
              eventId: event.ticker,
              eventTitle: event.title,
              marketId: market.ticker,
              marketTitle: market.title,
              expiry,
              price: yesPrice,
            });
          }

          // NO Token
          if (primaryAccount.noMint && !tokenMap.has(primaryAccount.noMint)) {
            tokenMap.set(primaryAccount.noMint, {
              mint: primaryAccount.noMint,
              symbol: "NO",
              name: `NO: ${market.title}`,
              image: eventImage,
              side: 'NO',
              eventId: event.ticker,
              eventTitle: event.title,
              marketId: market.ticker,
              marketTitle: market.title,
              expiry,
              price: noPrice,
            });
          }
        }
      }

      // ★ Mapから配列に変換
      return Array.from(tokenMap.values());

    } catch (error) {
      console.error("Failed to fetch DFlow markets:", error);
      return [];
    }
  }

  // ★ 新規メソッド: 流動性データの取得
  static async getTokenLiquidity(mints: string[], apiKey: string): Promise<Record<string, number>> {
    if (!apiKey || mints.length === 0) return {};

    try {
      // DFlow APIの流動性エンドポイント（実際のエンドポイントに合わせて調整）
      const url = `${DFLOW_API_BASE}/api/v1/liquidity`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({ mints })
      });

      if (!response.ok) return {};

      const data = await response.json();
      const liquidityMap: Record<string, number> = {};

      // レスポンス構造に合わせて調整
      if (Array.isArray(data)) {
        data.forEach((item: any) => {
          if (item.mint && item.liquidity !== undefined) {
            liquidityMap[item.mint] = item.liquidity;
          }
        });
      }

      return liquidityMap;
    } catch (error) {
      console.error("Failed to fetch liquidity:", error);
      return {};
    }
  }
}
```

### 4.2 Layer 2: Backend - データ取得時のサニタイズ

**ファイル**: `axis-api/src/routes/kagemusha.ts`

**修正内容**:

```typescript
/**
 * GET /discover - Public strategies with sanitized composition
 */
app.get('/discover', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    
    const { results } = await c.env.axis_db.prepare(
      `SELECT * FROM strategies 
       WHERE status = 'active' 
       ORDER BY tvl DESC, total_deposited DESC, created_at DESC 
       LIMIT ? OFFSET ?`
    ).bind(limit, offset).all();
    
    const strategies = results.map((s: any) => {
      // ★ composition をパース
      let tokens = [];
      try {
        tokens = s.composition ? JSON.parse(s.composition) : 
                 (s.config ? JSON.parse(s.config) : []);
      } catch (e) {
        console.error(`Failed to parse composition for strategy ${s.id}:`, e);
        tokens = [];
      }

      // ★ 重複排除を適用
      const deduplicatedTokens = deduplicateTokens(tokens);

      return {
        id: s.id,
        ownerPubkey: s.owner_pubkey,
        name: s.name,
        ticker: s.ticker,
        tokens: deduplicatedTokens,  // ★ 重複排除済み
        config: s.config ? JSON.parse(s.config) : {},
        tvl: s.tvl || s.total_deposited || 0,
        mintAddress: s.mint_address,
        vaultAddress: s.vault_address,
        createdAt: s.created_at,
        description: s.description || '',
        type: s.type || 'BALANCED',
      };
    });
    
    return c.json({ success: true, strategies });
  } catch (e: any) {
    console.error('[Discover] Error:', e);
    return c.json({ success: false, error: e.message }, 500);
  }
});

/**
 * GET /strategies/:pubkey - User strategies with sanitized composition
 */
app.get('/strategies/:pubkey', async (c) => {
  try {
    const pubkey = c.req.param('pubkey');
    const { results } = await c.env.axis_db.prepare(
      `SELECT * FROM strategies WHERE owner_pubkey = ? ORDER BY created_at DESC`
    ).bind(pubkey).all();
    
    const strategies = results.map((s: any) => {
      let tokens = [];
      try {
        tokens = s.composition ? JSON.parse(s.composition) : 
                 (s.config ? JSON.parse(s.config) : []);
      } catch (e) {
        tokens = [];
      }

      // ★ 重複排除を適用
      const deduplicatedTokens = deduplicateTokens(tokens);

      return {
        id: s.id,
        ownerPubkey: s.owner_pubkey,
        name: s.name,
        ticker: s.ticker,
        type: s.type,
        tokens: deduplicatedTokens,  // ★ 重複排除済み
        config: s.config ? JSON.parse(s.config) : {},
        description: s.description || '',
        tvl: s.tvl || s.total_deposited || 0,
        totalDeposited: s.total_deposited || 0,
        status: s.status,
        mintAddress: s.mint_address,
        vaultAddress: s.vault_address,
        createdAt: s.created_at,
      };
    });
    
    return c.json({ success: true, strategies });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});
```

### 4.3 Layer 3: Frontend - 表示前の最終チェック

**ファイル**: `axis-agent/src/components/discover/ListDiscoverView.tsx`

**修正内容**:

```typescript
// ★ 新規ヘルパー関数を追加（ファイル上部）
function deduplicateAndSortTokens(
  tokens: DiscoveredToken[],
  liquidityMap?: Record<string, number>
): DiscoveredToken[] {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];

  const tokenMap = new Map<string, DiscoveredToken>();

  for (const token of tokens) {
    const key = token.address || token.symbol;
    if (!key) continue;

    if (!tokenMap.has(key)) {
      tokenMap.set(key, { ...token });
    } else {
      // 重複の場合、weightを合算
      const existing = tokenMap.get(key)!;
      existing.weight = (existing.weight || 0) + (token.weight || 0);
    }
  }

  let result = Array.from(tokenMap.values());

  // 流動性データがある場合、ソート＆フィルタリング
  if (liquidityMap && Object.keys(liquidityMap).length > 0) {
    // 流動性を付与
    result = result.map(t => ({
      ...t,
      liquidity: t.address ? (liquidityMap[t.address] || 0) : 0,
    }));

    // 流動性が極端に低いトークンを除外（オプション）
    const MIN_LIQUIDITY = 100; // $100以上
    result = result.filter(t => (t as any).liquidity >= MIN_LIQUIDITY);

    // 流動性順にソート（降順）
    result.sort((a, b) => ((b as any).liquidity || 0) - ((a as any).liquidity || 0));
  }

  return result;
}

// strategies の enrichment ロジックを修正
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

    // ★ 重複排除とソートを適用
    const deduplicatedTokens = deduplicateAndSortTokens(enrichedTokens);

    let weightedSum = 0;
    let totalWeight = 0;
    deduplicatedTokens.forEach((t) => {
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
      tokens: deduplicatedTokens,  // ★ 重複排除済み
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

### 4.4 DFlow流動性データの統合（オプション機能）

**ファイル**: `axis-agent/src/services/dflow.ts`

**追加内容**:

```typescript
// ★ 流動性データ取得メソッド
export async function fetchTokenLiquidity(mints: string[]): Promise<Record<string, number>> {
  if (mints.length === 0) return {};

  try {
    const res = await fetch(`${AXIS_API_BASE}/api/dflow/liquidity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mints }),
    });

    if (!res.ok) return {};

    const data = await res.json();
    return data.liquidity || {};
  } catch (e) {
    console.warn('[DFlow] fetchTokenLiquidity failed:', e);
    return {};
  }
}
```

**ファイル**: `axis-api/src/routes/dflow.ts`

**追加エンドポイント**:

```typescript
// ★ 新規エンドポイント
app.post('/liquidity', async (c) => {
  try {
    const { mints } = await c.req.json();
    if (!Array.isArray(mints) || mints.length === 0) {
      return c.json({ error: 'mints array is required' }, 400);
    }

    const apiKey = c.env.DFLOW_API_KEY;
    const liquidity = await DFlowService.getTokenLiquidity(mints, apiKey);

    c.header('Cache-Control', 'public, max-age=60');
    return c.json({ liquidity });
  } catch (error) {
    console.error("DFlow Liquidity Route Error:", error);
    return c.json({ error: 'Failed to fetch liquidity' }, 500);
  }
});
```

---

## 5. エッジケース考慮

### 5.1 流動性が0のトークン

**対応方法**:
- フィルタリングはオプションとし、デフォルトでは全て表示
- MIN_LIQUIDITY定数で閾値を設定可能
- 流動性データ取得失敗時は、元の順序を維持

### 5.2 compositionがnullまたは不正なJSON

**対応方法**:
```typescript
let tokens = [];
try {
  tokens = s.composition ? JSON.parse(s.composition) : [];
} catch (e) {
  console.error(`Failed to parse composition for strategy ${s.id}:`, e);
  tokens = [];
}
```

### 5.3 mint addressが存在しないトークン

**対応方法**:
```typescript
const key = token.mint || token.address || token.symbol;
if (!key) continue; // スキップ
```

### 5.4 weight合計が100%でない場合

**対応方法**:
```typescript
const totalWeight = deduplicatedTokens.reduce((sum, t) => sum + (t.weight || 0), 0);
if (totalWeight > 0) {
  deduplicatedTokens.forEach(t => {
    t.weight = (t.weight || 0) / totalWeight * 100;
  });
}
```

---

## 6. パフォーマンスへの影響

### 6.1 Backend

**追加処理**:
- `deduplicateTokens()`: O(n) - n = トークン数（通常10-20個）
- `Map` ベースの重複チェック: 非常に高速

**影響**: **無視できるレベル**（1ms未満）

### 6.2 Frontend

**追加処理**:
- `deduplicateAndSortTokens()`: O(n log n) - ソート含む
- 戦略あたりの処理時間: <1ms

**影響**: **無視できるレベル**（50戦略で50ms未満）

### 6.3 キャッシュ戦略

現在のキャッシュ設定を維持:
- `/api/discover`: 60秒キャッシュ
- `/api/tokens`: 5分キャッシュ
- `/api/dflow/markets`: 60秒キャッシュ

---

## 7. テスト計画

### 7.1 Unit Tests

#### Backend Tests

**ファイル**: `axis-api/tests/deduplication.test.ts` (新規作成)

```typescript
import { describe, it, expect } from 'vitest';

describe('deduplicateTokens', () => {
  it('should remove duplicate tokens by mint address', () => {
    const input = [
      { mint: 'ABC123', symbol: 'TOKEN1', weight: 30 },
      { mint: 'ABC123', symbol: 'TOKEN1', weight: 20 },
      { mint: 'DEF456', symbol: 'TOKEN2', weight: 50 },
    ];
    
    const result = deduplicateTokens(input);
    
    expect(result).toHaveLength(2);
    expect(result[0].weight).toBe(50); // 30 + 20
    expect(result[1].weight).toBe(50);
  });

  it('should handle empty array', () => {
    expect(deduplicateTokens([])).toEqual([]);
  });

  it('should handle null composition', () => {
    expect(deduplicateTokens(null as any)).toEqual([]);
  });

  it('should normalize weights to 100%', () => {
    const input = [
      { mint: 'ABC', weight: 60 },
      { mint: 'DEF', weight: 40 },
    ];
    
    const result = deduplicateTokens(input);
    const total = result.reduce((sum, t) => sum + t.weight, 0);
    
    expect(total).toBeCloseTo(100);
  });
});
```

#### Frontend Tests

**ファイル**: `axis-agent/src/components/discover/__tests__/ListDiscoverView.test.tsx`

```typescript
import { describe, it, expect } from 'vitest';
import { deduplicateAndSortTokens } from '../ListDiscoverView';

describe('deduplicateAndSortTokens', () => {
  it('should remove duplicate tokens', () => {
    const input = [
      { address: 'mint1', symbol: 'A', weight: 30, currentPrice: 1, change24h: 0 },
      { address: 'mint1', symbol: 'A', weight: 20, currentPrice: 1, change24h: 0 },
      { address: 'mint2', symbol: 'B', weight: 50, currentPrice: 2, change24h: 0 },
    ];
    
    const result = deduplicateAndSortTokens(input);
    
    expect(result).toHaveLength(2);
    expect(result.find(t => t.address === 'mint1')?.weight).toBe(50);
  });

  it('should sort by liquidity when provided', () => {
    const input = [
      { address: 'mint1', symbol: 'A', weight: 50 },
      { address: 'mint2', symbol: 'B', weight: 50 },
    ];
    const liquidity = { mint1: 100, mint2: 500 };
    
    const result = deduplicateAndSortTokens(input, liquidity);
    
    expect(result[0].address).toBe('mint2'); // Higher liquidity first
    expect(result[1].address).toBe('mint1');
  });

  it('should filter out low liquidity tokens', () => {
    const input = [
      { address: 'mint1', symbol: 'A', weight: 50 },
      { address: 'mint2', symbol: 'B', weight: 50 },
    ];
    const liquidity = { mint1: 50, mint2: 500 }; // mint1 < MIN_LIQUIDITY(100)
    
    const result = deduplicateAndSortTokens(input, liquidity);
    
    expect(result).toHaveLength(1);
    expect(result[0].address).toBe('mint2');
  });
});
```

### 7.2 Integration Tests

#### Test Case 1: 重複トークンを含む戦略の保存
```typescript
POST /api/strategies
Body: {
  owner_pubkey: "test_pubkey",
  name: "Test Strategy",
  tokens: [
    { mint: "mint1", symbol: "A", weight: 30 },
    { mint: "mint1", symbol: "A", weight: 20 },
    { mint: "mint2", symbol: "B", weight: 50 }
  ]
}

Expected Response:
- success: true
- Database composition: 重複排除済み（2トークンのみ）
- weights正規化済み
```

#### Test Case 2: DFlow マーケットの重複排除
```typescript
GET /api/dflow/markets

Expected:
- 同じ yesMint/noMint が複数回出現しない
- 各マーケットごとに YES/NO が1ペアずつ
```

#### Test Case 3: Discover ページの表示
```typescript
1. 重複トークンを含む戦略をDBに保存
2. GET /api/discover を呼び出し
3. Frontend で ListDiscoverView をレンダリング

Expected:
- 同じロゴが複数表示されない
- 各トークンのweight合計が妥当
```

### 7.3 Regression Tests

既存機能が壊れていないことを確認：

- [ ] 戦略の新規作成が正常に動作
- [ ] 戦略の更新が正常に動作
- [ ] Swipe View の表示が正常
- [ ] List View の表示が正常
- [ ] 検索機能が正常に動作
- [ ] ソート機能が正常に動作

---

## 8. デプロイメント計画

### 8.1 段階的ロールアウト

#### Phase 1: Backend 修正（優先度: 高）
1. `axis-api` リポジトリに修正をコミット
2. Cloudflare Workers にデプロイ
3. 本番環境での動作確認

**所要時間**: 2-3時間

#### Phase 2: Frontend 修正（優先度: 中）
1. `axis-agent` リポジトリに修正をコミット
2. Vercel/Cloudflare Pages にデプロイ
3. キャッシュクリア

**所要時間**: 1-2時間

#### Phase 3: DFlow 流動性統合（優先度: 低・オプション）
1. `/api/dflow/liquidity` エンドポイント実装
2. Frontend で流動性データを活用
3. A/Bテストで効果測定

**所要時間**: 3-4時間

### 8.2 Rollback Plan

問題が発生した場合：
1. Cloudflare Workers のロールバック（即座）
2. Vercel デプロイメントのロールバック（即座）
3. データベースのマイグレーションなし（変更なし）

---

## 9. モニタリング＆アラート

### 9.1 メトリクス

以下を監視：
- `/api/discover` のレスポンスタイム
- `/api/dflow/markets` のレスポンスタイム
- フロントエンドのレンダリング時間
- エラー率

### 9.2 ログ

以下をログ出力：
```typescript
console.log(`[Dedupe] Strategy ${id}: ${originalCount} → ${deduplicatedCount} tokens`);
```

**期待値**: 重複が多い戦略で差分が確認できる

---

## 10. Engineer A への実装指示

### 10.1 優先順位

1. **High**: Backend Layer 1 & 2（重複排除）
2. **Medium**: Frontend Layer 3（最終チェック）
3. **Low**: DFlow流動性統合（オプション機能）

### 10.2 実装手順

#### ステップ1: Backend修正（2-3時間）

1. `axis-api/src/routes/kagemusha.ts` を開く
2. `deduplicateTokens()` ヘルパー関数を追加（セクション4.1.1参照）
3. `POST /strategies` を修正（セクション4.1.1参照）
4. `GET /discover` を修正（セクション4.2参照）
5. `GET /strategies/:pubkey` を修正（セクション4.2参照）

6. `axis-api/src/services/dflow.ts` を開く
7. `getActiveMarketTokens()` を修正（セクション4.1.2参照）
8. コミット＆プッシュ
9. Cloudflare Workers にデプロイ

#### ステップ2: Frontend修正（1-2時間）

1. `axis-agent/src/components/discover/ListDiscoverView.tsx` を開く
2. `deduplicateAndSortTokens()` ヘルパー関数を追加（セクション4.3参照）
3. `strategies` の useMemo を修正（セクション4.3参照）
4. コミット＆プッシュ
5. Vercel にデプロイ

#### ステップ3: テスト（1時間）

1. Devnet環境で動作確認
   - 重複トークンを含む戦略を作成
   - Discoverページで表示確認
   - 重複が排除されていることを確認

2. 本番環境で動作確認
   - 既存の戦略が正常に表示されるか
   - 重複が解消されているか

#### ステップ4: DFlow流動性統合（オプション・3-4時間）

**実装する場合のみ**:
1. セクション4.1.2の `getTokenLiquidity()` を実装
2. セクション4.4の `/liquidity` エンドポイントを追加
3. Frontend で流動性データを取得＆活用
4. MIN_LIQUIDITY定数で閾値を調整

### 10.3 チェックリスト

- [ ] Backend: `deduplicateTokens()` 実装
- [ ] Backend: POST `/strategies` 修正
- [ ] Backend: GET `/discover` 修正
- [ ] Backend: GET `/strategies/:pubkey` 修正
- [ ] Backend: DFlow `getActiveMarketTokens()` 修正
- [ ] Backend: デプロイ完了
- [ ] Frontend: `deduplicateAndSortTokens()` 実装
- [ ] Frontend: strategies useMemo 修正
- [ ] Frontend: デプロイ完了
- [ ] テスト: 重複排除の動作確認
- [ ] テスト: リグレッションテスト完了
- [ ] ドキュメント: 変更内容をCHANGELOG.mdに記録

---

## 11. まとめ

### 11.1 期待される成果

1. **重複の完全排除**: 3層防御により、あらゆるケースで重複を防ぐ
2. **データ整合性の向上**: トークン数とweight合計が正確になる
3. **ユーザー体験の改善**: 混乱がなくなり、信頼性が向上
4. **将来の拡張性**: DFlow流動性データを活用した高度な機能への道

### 11.2 技術的負債の解消

- **現状**: フロントエンドのみで対処 → データソースからの問題が解決されず
- **修正後**: バックエンドでサニタイズ → クリーンなデータを配信

### 11.3 次のステップ

修正完了後、以下を検討：
1. 流動性データを活用した推奨戦略機能
2. トークンの動的リバランス機能
3. ユーザーごとのカスタム表示順序

---

**以上、技術設計書を終わります。**

質問や不明点があれば、いつでも @CTO にお知らせください。
