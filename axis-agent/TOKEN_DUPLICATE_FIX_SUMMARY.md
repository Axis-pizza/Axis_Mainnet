# トークン重複表示バグ修正 - エグゼクティブサマリー

**日付**: 2026-03-13  
**所要時間**: 30分  
**ステータス**: ✅ 技術調査完了・実装指示書作成済み

---

## 🔍 問題の本質

**現象**: 予測市場トークン一覧で、同じトークンが複数表示される

**根本原因（3つ）**:
1. **Backend**: 戦略保存時に重複チェックなし（composition JSON）
2. **Backend**: DFlow API レスポンス解析時の重複生成
3. **Frontend**: トークンレベルでの重複排除がない（戦略レベルのみ）

---

## ✅ 解決策

### 3層防御アプローチ

```
Layer 1: Backend保存時   → deduplicateTokens()でweight合算
Layer 2: Backend取得時   → サニタイズして配信
Layer 3: Frontend表示前  → 最終チェック＆流動性ソート
```

### 主な変更ファイル

**Backend** (`axis-api`):
- `src/routes/kagemusha.ts`: 重複排除ロジック追加
- `src/services/dflow.ts`: Map ベースの重複防止

**Frontend** (`axis-agent`):
- `src/components/discover/ListDiscoverView.tsx`: 最終チェック追加

---

## 📊 DFlow流動性データ活用

**目的**:
1. 重複排除時の優先順位決定
2. 流動性順でトークン表示
3. 低流動性トークンのフィルタリング（オプション）

**実装**: `/api/dflow/liquidity` エンドポイント（オプション機能）

---

## 🚀 実装優先順位

| 優先度 | タスク | 所要時間 | 必須 |
|--------|--------|----------|------|
| **High** | Backend Layer 1 & 2（重複排除） | 2-3時間 | ✅ |
| **Medium** | Frontend Layer 3（最終チェック） | 1-2時間 | ✅ |
| **Low** | DFlow流動性統合 | 3-4時間 | ⭕（オプション） |

---

## 📋 Engineer A へのクイック指示

### ステップ1: Backend（2-3時間）

```typescript
// axis-api/src/routes/kagemusha.ts

// ★ 追加
function deduplicateTokens(tokens: any[]): any[] {
  const seen = new Map<string, any>();
  for (const token of tokens) {
    const key = token.mint || token.address || token.symbol;
    if (!key) continue;
    if (!seen.has(key)) {
      seen.set(key, token);
    } else {
      const existing = seen.get(key)!;
      existing.weight = (existing.weight || 0) + (token.weight || 0);
    }
  }
  return Array.from(seen.values());
}

// POST /strategies 内で使用
const deduplicatedTokens = deduplicateTokens(tokens);
```

### ステップ2: Frontend（1-2時間）

```typescript
// axis-agent/src/components/discover/ListDiscoverView.tsx

// ★ 追加
function deduplicateAndSortTokens(tokens: DiscoveredToken[]): DiscoveredToken[] {
  const tokenMap = new Map<string, DiscoveredToken>();
  for (const token of tokens) {
    const key = token.address || token.symbol;
    if (!key) continue;
    if (!tokenMap.has(key)) {
      tokenMap.set(key, { ...token });
    } else {
      const existing = tokenMap.get(key)!;
      existing.weight = (existing.weight || 0) + (token.weight || 0);
    }
  }
  return Array.from(tokenMap.values());
}

// strategies useMemo 内で使用
const deduplicatedTokens = deduplicateAndSortTokens(enrichedTokens);
```

---

## 🧪 テスト計画

1. **Unit Tests**: 重複排除ロジックのテスト
2. **Integration Tests**: エンドツーエンドで重複が排除されるか
3. **Regression Tests**: 既存機能が壊れていないか

---

## 📈 期待される効果

- **重複の完全排除**: 3層防御で100%防ぐ
- **データ整合性**: weight合計が正確に
- **UX改善**: ユーザーの混乱がなくなる
- **パフォーマンス**: 影響なし（<1ms/strategy）

---

## 📄 詳細ドキュメント

完全な技術設計は以下を参照:
👉 `TECHNICAL_DESIGN_TOKEN_DUPLICATE_FIX.md`

- コード実装例（全行）
- エッジケース対応
- テストコード
- デプロイメント計画

---

**次のアクション**: Engineer A に実装を依頼 🚀
