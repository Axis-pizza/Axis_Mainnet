# Engineer A - 実装タスク

**優先度:** 🔴 High  
**推定時間:** 10分  
**難易度:** Easy

---

## 📋 タスク概要

「All」タブで「Prediction」フィルターを選択した時、同じマーケットのYes/Noトークンが重複表示される問題を修正する。

---

## 🎯 修正内容

**ファイル:** `axis-agent/src/hooks/useManualDashboard.ts`

**修正箇所:** L128-129

### Before:
```typescript
else if (tokenFilter === 'prediction')
  baseList = baseList.filter((t) => t.source === 'dflow');
```

### After:
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

---

## 🧪 テスト手順

1. **開発環境起動:**
   ```bash
   cd axis-agent
   npm run dev
   ```

2. **Builder画面を開く:**
   - `/create/manual` にアクセス

3. **「All」タブをクリック:**
   - 左側のタブから「All」を選択

4. **「Prediction」フィルターを適用:**
   - 右上のフィルタードロップダウンから「Prediction」を選択

5. **期待結果を確認:**
   - ✅ 同じマーケットのYes/Noトークンが**1つだけ**表示される
   - ✅ Yes側が優先的に表示される
   - ✅ 他のトークン（Stock, Commodity, Crypto）もまんべんなく表示される
   - ✅ スクロールして十分な数のトークンが表示される

6. **「Prediction」タブも確認:**
   - 念のため「Prediction」タブに切り替え
   - ✅ マーケットがグループ化されて表示される（既存の動作）
   - ✅ Yes/No両方の情報が表示される

---

## 🐛 想定される問題と対処法

### 問題1: `predictionMeta` が undefined
**原因:** 古いデータ構造のトークンが混在している  
**対処法:** `if (!marketId) return;` で早期リターンしているので問題なし

### 問題2: Yes側が表示されない
**原因:** API側でNo側しか返されていない  
**対処法:** 条件を `!grouped.has(marketId)` に変更（どちらか1つを表示）

```typescript
// より安全なロジック
if (!grouped.has(marketId)) {
  grouped.set(marketId, t);
} else if (t.predictionMeta?.side === 'YES') {
  grouped.set(marketId, t);
}
```

### 問題3: パフォーマンス低下
**原因:** 大量のトークンがある場合、Map操作が重い  
**対処法:** 現在のデータ量（~800トークン）では問題なし。将来的にはuseMemoで最適化可能。

---

## 📝 コミットメッセージ例

```
fix: deduplicate prediction tokens in All tab filter

- Add market-based deduplication when tokenFilter === 'prediction'
- Prioritize YES side for display
- Maintain consistent UX with Prediction tab grouping logic

Fixes issue where same market Yes/No tokens appeared multiple times
```

---

## 🔍 参考情報

### 関連ファイル:
- `axis-agent/src/hooks/useManualDashboard.ts` (修正対象)
- `axis-agent/src/services/dflow.ts` (DFlow API接続)
- `axis-agent/src/components/create/manual/types.ts` (型定義)

### 関連PR:
- PR #82: シンボルベースの重複排除実装（commit 003f063）

### DFlow API:
- Endpoint: `https://axis-api.yusukekikuta-05.workers.dev/api/dflow/markets`
- レスポンス: `{ tokens: [{ mint, symbol, side, marketId, ... }] }`

---

## ✅ 完了確認

- [ ] コード修正完了
- [ ] ローカルテスト完了（上記手順1-6）
- [ ] コミット & Push
- [ ] PR作成（Optional: 直接mainにpushでもOK）
- [ ] Museに報告

---

## 🆘 困ったら

**質問先:** CTO (Alex)  
**参考資料:** `/Users/yusukekikuta/.openclaw/workspace/Axis_MVP/axis-agent/CTO-INVESTIGATION-REPORT.md`

**よくある質問:**

**Q: なぜBackend（dflow.ts）を修正しないのか？**  
A: バックエンドは全データを返すべき。フィルタリングはフロントエンドで行うのが適切。

**Q: Yes/No どちらを優先すべきか？**  
A: 現時点ではYes側を優先。将来的にMuseの要望で変更可能。

**Q: Predictionタブの動作は変わらないか？**  
A: 変わらない。Predictionタブは `groupedPredictions` という別のロジックを使用。

---

**タスク発行日時:** 2026-03-13 15:45 JST  
**発行者:** CTO (Alex)
