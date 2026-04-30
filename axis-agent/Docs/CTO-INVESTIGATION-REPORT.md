# CTO追加調査報告：「All」タブ重複問題 + PredictionToken D-Flow接続

**調査日時**: 2026-03-13 15:31 JST  
**調査担当**: Alex (CTO Subagent)

---

## 📋 問題の要約

### 1. 「All」タブでの重複表示問題
- **現象**: 同じマーケットのYes/Noトークンが全部表示される
- **ユーザー要望**: まんべんなく他のトークンも見れるようにしたい
- **現在の修正（PR #82）**: シンボルベースの重複排除実装済み → **Predictionトークンには効いていない**

### 2. PredictionToken + D-Flow接続の不完全実装
- **フィードバック**: 裏側の接続部分がまだしっかり実装できていない
- **調査結果**: **API接続自体は正常に動作中** ✅

---

## 🔍 根本原因分析

### A. API接続状態（DFlow）

**✅ 接続状況: 正常**
```bash
curl https://axis-api.yusukekikuta-05.workers.dev/api/dflow/markets
```

**返却データ構造:**
```json
{
  "tokens": [
    {
      "mint": "E7YDoq4vX6Stxq9PvPcrnBqV9DsGRoiHBL77W6R7UMxQ",
      "symbol": "YES",
      "name": "YES: Will Bryson DeChambeau win...",
      "image": "https://...",
      "side": "YES",
      "eventId": "KXLIVTOUR-LIGS26",
      "marketId": "KXLIVTOUR-LIGS26-BDEC",
      "marketTitle": "Will Bryson DeChambeau win...",
      "expiry": "2026-03-29T00:00:00.000Z",
      "price": 0.505
    },
    {
      "mint": "yBpk1db1mzWmWKvYDwctVwhDzFawfUSS3NVg2W3vp",
      "symbol": "NO",
      "side": "NO",
      "marketId": "KXLIVTOUR-LIGS26-BDEC",
      ...
    }
  ]
}
```

**問題点:**
- **同じ `marketId` に対して複数の `mint`（トークンアドレス）が返される**
- 例: `KXLIVTOUR-LIGS26-BDEC` → **4つのmint** (YES×2, NO×2)
- これは **DFlow API側の仕様** → バックエンドでフィルタリングすべきか、フロントエンドで処理すべきか

---

### B. 「All」タブでの重複表示の原因

**現在の実装 (`useManualDashboard.ts` L121-131):**

```typescript
// カテゴリフィルタ (Allタブ内での絞り込み)
if (activeTab === 'all' && tokenFilter !== 'all') {
  if (tokenFilter === 'crypto')
    baseList = baseList.filter((t) => !t.source || t.source === 'jupiter');
  else if (tokenFilter === 'stock') 
    baseList = baseList.filter((t) => t.source === 'stock');
  else if (tokenFilter === 'commodity')
    baseList = baseList.filter((t) => t.source === 'commodity');
  else if (tokenFilter === 'prediction')
    baseList = baseList.filter((t) => t.source === 'dflow'); // ★ 問題箇所
}
```

**問題:**
- `tokenFilter === 'prediction'` の時、**全ての `source === 'dflow'` トークンを表示**
- Yes/No両方、さらに重複mintも全部表示される

**対比: Predictionタブでは問題なし (`groupedPredictions` L143-169):**

```typescript
const groupedPredictions = useMemo(() => {
  if (activeTab !== 'prediction') return [];

  const sourceList = allTokens.filter((t) => t.source === 'dflow');
  const groups: Record<string, any> = {};

  sourceList.forEach((token) => {
    const meta = token.predictionMeta;
    if (!meta) return;

    if (!groups[meta.marketId]) {
      groups[meta.marketId] = {
        marketId: meta.marketId,
        marketQuestion: meta.marketQuestion,
        // ...
      };
    }

    if (meta.side === 'YES') groups[meta.marketId].yesToken = token;
    if (meta.side === 'NO') groups[meta.marketId].noToken = token;
  });

  return Object.values(groups);
}, [allTokens, searchQuery, activeTab]);
```

**Predictionタブでは:**
- ✅ `marketId` でグループ化
- ✅ Yes/Noを1つのマーケットオブジェクトにまとめる
- ✅ 重複排除できている

---

### C. PR #82 の修正内容（commit 003f063）

**実装された重複排除ロジック:**

```typescript
// L268-288
const uniqueMap = new Map<string, JupiterToken>();
const seenSymbols = new Set<string>();

// 1. Popular symbols優先
POPULAR_SYMBOLS.forEach((sym) => {
  const t = list.find((x) => x.symbol === sym);
  if (t) {
    uniqueMap.set(t.address, t);
    seenSymbols.add(t.symbol.toUpperCase());
  }
});

// 2. Prediction/Stock/Commodity tokens追加
[...predictionTokens, ...stockTokens, ...commodityTokens].forEach((t) => {
  const upperSym = t.symbol.toUpperCase();
  if (seenSymbols.has(upperSym)) {
    console.warn(`[Duplicate] Skipping ${t.symbol} from ${t.source}, already exists`);
    return;
  }
  uniqueMap.set(t.address, t);
  seenSymbols.add(upperSym);
});
```

**問題:**
- **シンボル重複排除は `"YES"` と `"NO"` を区別しない**
- Predictionトークンは全て `symbol: "YES"` または `symbol: "NO"`
- → **同じシンボル名でも異なる `marketId` は区別されない**
- → **最初の1つだけ残り、他は全てスキップされる可能性**

**DFlow API レスポンスでの symbol:**
```json
{
  "symbol": "YES",  // ← 全てのYESトークンが同じシンボル
  "name": "YES: Will Bryson DeChambeau win...",
  "marketId": "KXLIVTOUR-LIGS26-BDEC"  // ← これで区別すべき
}
```

しかし、`dflow.ts` L83-98 では:
```typescript
return {
  address: t.mint,
  symbol: `${t.marketId}-${t.side}`,  // ← "KXLIVTOUR-LIGS26-BDEC-YES"
  name: `${t.eventTitle} — ${t.side}`,
  logoURI: t.image,
  tags: ['prediction', t.side.toLowerCase()],
  source: 'dflow',
  price: t.price,
  predictionMeta: {
    marketId: t.marketId,
    side: t.side,
    // ...
  },
};
```

**実際のシンボル:** `"KXLIVTOUR-LIGS26-BDEC-YES"`  
→ **マーケットごとに一意** ✅

**なぜPR #82で解決しなかったか:**
- API側で同じ `marketId` + 同じ `side` の**重複mint**が返されている
- 例: `KXLIVTOUR-LIGS26-BDEC-YES` が2つ存在
- PR #82はシンボルベースで排除するが、**同じシンボルの重複mintは1つだけ残す**
- → 残った1つが表示される（これは正しい）
- しかし、**「All」タブで `tokenFilter === 'prediction'` の時、Yes/No両方が全て表示される**

---

## 💡 修正設計

### 推奨: **Option 1 - Frontend修正のみ**

**理由:**
1. **Backend（DFlow API）は全データを返すべき** → データの完全性
2. **フィルタリングはFrontendで行うのが適切** → UI要件に応じた表示制御
3. **Predictionタブの実装と統一できる** → コード一貫性

**修正箇所:** `useManualDashboard.ts` L121-131

**修正案:**

```typescript
// カテゴリフィルタ (Allタブ内での絞り込み)
if (activeTab === 'all' && tokenFilter !== 'all') {
  if (tokenFilter === 'crypto')
    baseList = baseList.filter((t) => !t.source || t.source === 'jupiter');
  else if (tokenFilter === 'stock') 
    baseList = baseList.filter((t) => t.source === 'stock');
  else if (tokenFilter === 'commodity')
    baseList = baseList.filter((t) => t.source === 'commodity');
  else if (tokenFilter === 'prediction') {
    // ★ 修正: マーケットごとに1つだけ表示（YES側を優先）
    const predictionTokens = baseList.filter((t) => t.source === 'dflow');
    const seenMarkets = new Set<string>();
    baseList = predictionTokens.filter((t) => {
      const marketId = t.predictionMeta?.marketId;
      if (!marketId) return false;
      if (seenMarkets.has(marketId)) return false;
      seenMarkets.add(marketId);
      return true;
    });
    
    // オプション: YES側を優先的に表示
    // const grouped = new Map<string, JupiterToken>();
    // predictionTokens.forEach((t) => {
    //   const marketId = t.predictionMeta?.marketId;
    //   if (!marketId) return;
    //   if (!grouped.has(marketId) || t.predictionMeta?.side === 'YES') {
    //     grouped.set(marketId, t);
    //   }
    // });
    // baseList = Array.from(grouped.values());
  }
}
```

**効果:**
- ✅ 同じマーケットのYes/Noが重複表示されない
- ✅ マーケットごとに1つだけ表示（YES側を優先）
- ✅ 他のトークン（Stock, Commodity）もまんべんなく表示される

---

### Option 2 - Backend最小限修正（非推奨）

**修正箇所:** `dflow.ts` L67-103 `fetchPredictionTokens()`

**修正案:**

```typescript
export async function fetchPredictionTokens(): Promise<JupiterToken[]> {
  try {
    const res = await fetch(`${AXIS_API_BASE}/api/dflow/markets`);
    if (!res.ok) throw new Error(`DFlow API error: ${res.status}`);

    const data = (await res.json()) as { tokens: DFlowApiToken[] };
    const apiTokens = data.tokens || [];

    if (apiTokens.length === 0) return [];

    // ★ 追加: マーケットごとに重複排除（YES側を優先）
    const seenMarkets = new Map<string, DFlowApiToken>();
    apiTokens.forEach((t) => {
      const key = t.marketId;
      if (!seenMarkets.has(key) || t.side === 'YES') {
        seenMarkets.set(key, t);
      }
    });

    return Array.from(seenMarkets.values()).map((t): JupiterToken => {
      return {
        address: t.mint,
        chainId: CHAIN_ID,
        decimals: 6,
        name: `${t.eventTitle} — ${t.side}`,
        symbol: `${t.marketId}-${t.side}`,
        logoURI: t.image,
        tags: ['prediction', t.side.toLowerCase()],
        isVerified: false,
        source: 'dflow',
        isMock: false,
        price: t.price,
        predictionMeta: {
          eventId: t.eventId,
          eventTitle: t.eventTitle,
          marketId: t.marketId,
          marketQuestion: t.marketTitle,
          side: t.side,
          expiry: t.expiry,
        },
      };
    });
  } catch (e) {
    console.warn('[dFlow] fetchPredictionTokens failed:', e);
    return [];
  }
}
```

**デメリット:**
- ❌ バックエンドがUI要件に依存する（本来は全データを返すべき）
- ❌ Predictionタブで Yes/No 両方表示したい場合に対応できない
- ❌ 将来的な拡張性が低い

---

### Option 3 - Frontend + Backend両方修正（過剰）

両方修正するのは冗長。Option 1で十分。

---

## 📊 DFlow API接続状況の詳細

### ✅ 接続状態: **正常動作中**

**確認事項:**
1. **API URL**: `https://axis-api.yusukekikuta-05.workers.dev/api/dflow/markets`
2. **レスポンス**: 200 OK
3. **データ構造**: 正しく `{ tokens: [...] }` 形式で返却
4. **トークン数**: 約800+トークン（LIV Golf, Fed Rate Hike, NHL, WTI Oil, Coach of the Year等）
5. **価格データ**: ✅ 含まれている (`price: 0.505`)
6. **画像URL**: ✅ Kalshi CDNから取得

**サンプルマーケット:**
```json
{
  "marketId": "KXLIVTOUR-LIGS26-BDEC",
  "marketTitle": "Will Bryson DeChambeau win the LIV Golf Singapore?",
  "eventTitle": "LIV Golf Singapore Champion?",
  "expiry": "2026-03-29T00:00:00.000Z",
  "YES": {
    "mint": "E7YDoq4vX6Stxq9PvPcrnBqV9DsGRoiHBL77W6R7UMxQ",
    "price": 0.505
  },
  "NO": {
    "mint": "yBpk1db1mzWmWKvYDwctVwhDzFawfUSS3NVg2W3vp",
    "price": 0.495
  }
}
```

**重複パターン:**
- 同じ `marketId` に対して **複数のmintアドレス**が存在
- 例: `KXLIVTOUR-LIGS26-BDEC` → **YES×2, NO×2** (計4mint)
- → これが重複表示の直接原因

---

## 🎯 最終推奨事項

### ✅ 推奨: **Option 1 - Frontend修正のみ**

**修正ファイル:**
`axis-agent/src/hooks/useManualDashboard.ts` (L121-131)

**修正内容:**
「All」タブで `tokenFilter === 'prediction'` の時、マーケットごとに1つだけ表示する重複排除ロジックを追加。

**修正コード:**
```typescript
else if (tokenFilter === 'prediction') {
  // マーケットごとに1つだけ表示（YES側を優先）
  const predictionTokens = baseList.filter((t) => t.source === 'dflow');
  const grouped = new Map<string, JupiterToken>();
  
  predictionTokens.forEach((t) => {
    const marketId = t.predictionMeta?.marketId;
    if (!marketId) return;
    
    // 既存のトークンがない、またはYES側の場合は更新
    if (!grouped.has(marketId) || t.predictionMeta?.side === 'YES') {
      grouped.set(marketId, t);
    }
  });
  
  baseList = Array.from(grouped.values());
}
```

**メリット:**
- ✅ **最小限の修正** (10行程度)
- ✅ **バックエンド変更不要**
- ✅ **Predictionタブとの一貫性**
- ✅ **将来的な拡張性** (Yes/No両方表示したい場合も対応可能)

**実装時間:** 5-10分

---

## 📝 Engineer Aへの指示

### タスク: 「All」タブPredictionフィルター重複排除

**ファイル:** `axis-agent/src/hooks/useManualDashboard.ts`

**修正箇所:** L121-131 (カテゴリフィルタ処理)

**修正内容:**
```typescript
// Before (L128-129)
else if (tokenFilter === 'prediction')
  baseList = baseList.filter((t) => t.source === 'dflow');

// After
else if (tokenFilter === 'prediction') {
  // マーケットごとに1つだけ表示（YES側を優先）
  const predictionTokens = baseList.filter((t) => t.source === 'dflow');
  const grouped = new Map<string, JupiterToken>();
  
  predictionTokens.forEach((t) => {
    const marketId = t.predictionMeta?.marketId;
    if (!marketId) return;
    
    // 既存のトークンがない、またはYES側の場合は更新
    if (!grouped.has(marketId) || t.predictionMeta?.side === 'YES') {
      grouped.set(marketId, t);
    }
  });
  
  baseList = Array.from(grouped.values());
}
```

**テスト手順:**
1. Builder画面で「All」タブを開く
2. 右上のフィルターで「Prediction」を選択
3. **期待結果**: 同じマーケットのYes/Noトークンが重複せず、1つだけ表示される
4. **確認**: 他のトークン（Stock, Commodity）もまんべんなく表示される

**推定時間:** 10分

---

## 🔍 追加調査が必要な項目

### 1. DFlow API側での重複mint発生原因

**質問:** なぜ同じ `marketId` + `side` で複数のmintが存在するのか？

**可能性:**
- Kalshi APIが複数のオーダーブックを返している
- Axis API側で重複データを返している
- 一時的なデータ同期の問題

**推奨:** Axis API側で重複排除を検討（長期的改善）

### 2. Yes/No表示の優先順位

**現在の実装:** YES側を優先

**検討事項:**
- ユーザーはYes/Noどちらを見たいか？
- 価格が高い方を表示すべきか？
- 確率が50%に近い方を表示すべきか？

**推奨:** Museとのディスカッション後に決定

### 3. Predictionマーケット表示の改善

**フィードバック:** "ちょっと修正が必要"

**具体的な改善点が不明**  
→ Museに確認が必要

**推測される改善候補:**
- マーケット画像の表示サイズ
- 価格表示のフォーマット
- ソート順（volume順、expiry順等）

---

## ✅ まとめ

| 項目 | 状態 | 対応 |
|------|------|------|
| DFlow API接続 | ✅ 正常動作中 | 問題なし |
| データ取得 | ✅ 正常 | 価格・画像含む |
| 「All」タブ重複 | ❌ 問題あり | **Option 1で修正** |
| Predictionタブ | ✅ 正常 | 問題なし |
| Backend修正 | ❌ 不要 | Frontend修正で解決 |

**次のステップ:**
1. Engineer AにFrontend修正を依頼（10分作業）
2. Museに「Predictionマーケット表示の改善」の具体的要件を確認
3. テスト → デプロイ

---

**調査完了時刻**: 2026-03-13 15:45 JST  
**所要時間**: 14分
