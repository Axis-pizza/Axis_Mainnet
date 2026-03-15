# ビルドエラー調査レポート

**日時**: 2026-03-13 16:57 JST  
**対象PR**: #84 (feat/engineer-a-prediction-market-complete)  
**担当**: Alex (Subagent)

---

## 🎯 問題の要約

Museから「まだビルドエラーが起きている」との報告を受け、調査・修正を実施。
**ローカルビルドは完全に成功**しているが、**Cloudflare CI（Pages & Workers）が失敗**している。

---

## ✅ 実施した対応

### 1. ローカルビルド検証
```bash
cd axis-agent
npm run build    # ✅ 成功
pnpm build       # ✅ 成功
npx tsc --noEmit # ✅ 型エラーなし
```

**結果**: すべて成功。ビルド成果物（`dist/`）正常生成。

---

### 2. ESLintチェック
```bash
npm run lint
```

**結果**: 208エラー、8警告  
**重要**: `npm run build`にはlintが含まれていないため、**ビルドブロッカーではない**

**主なエラー内容**:
- `@typescript-eslint/no-explicit-any`: `any`型の多用
- `@typescript-eslint/no-unused-vars`: 未使用変数
- `react-hooks/*`: Reactフックのルール違反（`Math.random()`をレンダー中に呼び出し等）
- `no-empty`: 空のcatch/tryブロック

---

### 3. PR #84 のCI状態確認
```bash
gh pr checks 84
```

**結果**:
- ❌ Cloudflare Pages: **FAILURE**
- ❌ Workers Builds: axis-mvp: **FAILURE**

---

### 4. 修正実施

#### 4.1 Node.jsバージョン指定
Cloudflare PagesはNode.js v25をサポートしていない可能性があるため、`.nvmrc`を追加:

```
# /.nvmrc
20

# /axis-agent/.nvmrc
20
```

**コミット**: `32eef26`

---

#### 4.2 モノレポ対応
ルート`package.json`に`axis-agent`のビルドスクリプトが存在しなかった。
Cloudflareがルートディレクトリで`pnpm build`を実行するため、スクリプトを追加:

```json
{
  "scripts": {
    "dev:agent": "pnpm --filter axis-agent dev",
    "build:agent": "pnpm --filter axis-agent build",
    "build": "pnpm --filter axis-agent build"
  }
}
```

**テスト**:
```bash
cd /Users/yusukekikuta/.openclaw/workspace/Axis_MVP
pnpm build  # ✅ 成功
```

**コミット**: `7961a95`

---

#### 4.3 出力ディレクトリの修正
Cloudflareが`dist`ディレクトリを探しているが、実際は`axis-agent/dist`にある。
ビルドスクリプトを修正して成果物をコピー:

```json
{
  "scripts": {
    "build:agent": "pnpm --filter axis-agent build && cp -r axis-agent/dist dist",
    "build": "pnpm --filter axis-agent build && cp -r axis-agent/dist dist"
  }
}
```

**テスト**:
```bash
rm -rf dist
pnpm build
ls -la dist  # ✅ index.html, assets/ 等が存在
```

**コミット**: `c6dafcb`

---

## ❌ 依然として失敗している問題

### Cloudflare Pages & Workers が失敗し続けている

**最新のCI状態**:
```
Cloudflare Pages         fail    https://dash.cloudflare.com/.../01d8605f-e2d3-427f-bcf3-83b695cf0b8f
Workers Builds: axis-mvp fail    https://dash.cloudflare.com/.../c6909f5f-ee7b-4252-868e-839eaac49e4f
```

**ローカルでは成功しているのに、Cloudflareで失敗している**ため、以下の可能性が高い:

---

## 🔍 推測される原因

### 1. Cloudflareのビルドコマンド設定が間違っている
**確認方法**:  
Cloudflare Pagesダッシュボード → Settings → Builds & deployments

**期待値**:
- **ビルドコマンド**: `pnpm build`
- **出力ディレクトリ**: `dist`
- **ルートディレクトリ**: `/` または空

---

### 2. 環境変数の不足
Viteビルドに必要な環境変数が設定されていない可能性。

**確認方法**:  
Cloudflare Pages → Settings → Environment variables

**確認すべき変数**:
- `VITE_*` で始まる変数
- `NODE_VERSION`: `20` (`.nvmrc`で指定済み)
- その他プロジェクト固有の変数

---

### 3. Cloudflare Workers (axis-api) の問題
`axis-api`のビルドも失敗している。

**確認ポイント**:
- `axis-api/package.json`には`build`スクリプトが存在しない（`deploy`のみ）
- Cloudflare Workers は別のビルドプロセスを使用している可能性

---

### 4. メモリ不足 / タイムアウト
大きなバンドル（2.3MB）を生成しているため、Cloudflareの制限に引っかかっている可能性。

**対処法**:
- コード分割（dynamic import）
- チャンクサイズの最適化

---

## 📋 次にすべきこと（優先順位順）

### 🔴 最優先: Cloudflareダッシュボードでビルドログを確認

**Cloudflare Pages ログ**:  
https://dash.cloudflare.com/?to=/d637410df2e8f923e3fe6b63955a283b/pages/view/axis-mvp/01d8605f-e2d3-427f-bcf3-83b695cf0b8f

**確認すべき情報**:
1. 実際に実行されているビルドコマンド
2. エラーメッセージの内容
3. 環境変数の設定状態
4. Node.jsバージョン

---

### 🟡 中優先: Cloudflare Pages 設定の確認・修正

**Settings → Builds & deployments**:
- **Framework preset**: `Vite` または `None`
- **Build command**: `pnpm build`
- **Build output directory**: `dist`
- **Root directory**: `/` または空
- **Node version**: `20` (または環境変数 `NODE_VERSION=20`)

---

### 🟢 低優先: ESLintエラーの修正

208個のエラーがあるが、ビルドブロッカーではない。
余裕があれば修正するが、デプロイには影響しない。

**修正すべきファイル（エラー数順）**:
1. `src/components/discover/ListDiscoverView.tsx` (28エラー)
2. `src/components/create/CreateLanding.tsx` (14エラー)
3. `src/components/discover/SwipeDiscoverView.tsx` (26エラー)

---

## 📊 コミット履歴

| コミット | メッセージ | 変更内容 |
|---------|-----------|---------|
| `32eef26` | `chore: add .nvmrc to specify Node.js v20 for Cloudflare Pages` | Node.jsバージョン指定 |
| `7961a95` | `fix: add build scripts for axis-agent in root package.json` | モノレポ対応 |
| `c6dafcb` | `fix: copy build output to root dist directory for Cloudflare Pages` | 出力ディレクトリ修正 |

---

## 🎓 学んだこと

1. **モノレポでのCloudflare Pages対応**: ルートディレクトリでビルドコマンドが実行されるため、`package.json`にスクリプトが必要
2. **出力ディレクトリの重要性**: Cloudflareが期待するディレクトリ構造に合わせる必要がある
3. **ローカル成功 ≠ CI成功**: 環境変数、Node.jsバージョン、ビルドコマンドの違いに注意

---

## ✨ まとめ

**ローカルビルドは完全に成功**しており、コード自体に問題はない。  
**Cloudflareの設定またはビルド環境**に問題があると推測される。

**次のステップ**: Museに**Cloudflareダッシュボード**でビルドログを確認してもらう。

---

**報告者**: Alex  
**報告日時**: 2026-03-13 17:00 JST
