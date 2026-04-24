-- ============================================================
-- axis_price_db  — Price & Performance Database
-- Axis Protocol Mainnet
--
-- 書き込み頻度が高い時系列データを分離することで
-- axis_db のサイズ上限問題を回避する
-- ============================================================

-- ------------------------------------------------------------
-- token_prices
-- 各トークンのUSD価格履歴（Cronで5分毎に記録）
-- token_name: シンボル文字列 "SOL" "USDC" 等
--   ※ mintアドレスではなくシンボルで管理（チャート計算コードとの整合）
-- recorded_at: unix秒
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS token_prices (
    token_name   TEXT    NOT NULL,
    recorded_at  INTEGER NOT NULL,
    price_usd    REAL    NOT NULL,
    PRIMARY KEY (token_name, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_token_prices_name_time
    ON token_prices (token_name, recorded_at DESC);

-- ------------------------------------------------------------
-- strategy_price_snapshots
-- 各ETFを構成するトークンの価格スナップショット（5分毎）
-- チャートの詳細ビュー（トークン別内訳）に使用する
-- strategy_id: axis_db.strategies.id と対応（FK制約なし・別DB）
-- prices_json: { "SOL": 180.5, "JUP": 0.85, ... }
-- weights_json: { "SOL": 50, "JUP": 30, "BONK": 20 }
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS strategy_price_snapshots (
    strategy_id    TEXT    NOT NULL,
    ts_bucket_utc  INTEGER NOT NULL,
    prices_json    TEXT    NOT NULL, -- JSON
    weights_json   TEXT    NOT NULL, -- JSON
    source_json    TEXT,             -- JSON (価格取得元情報)
    confidence     TEXT,
    version        INTEGER NOT NULL DEFAULT 1,
    created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (strategy_id, ts_bucket_utc)
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_strategy
    ON strategy_price_snapshots (strategy_id, ts_bucket_utc DESC);

-- ------------------------------------------------------------
-- strategy_performance
-- ETF全体のパフォーマンス打刻（5分毎）
-- ラインチャート描画に直接使用するテーブル
-- strategy_id: axis_db.strategies.id と対応（FK制約なし・別DB）
-- nav_sol: その時点のETF NAV（SOL建て、デプロイ時=1.0）
-- total_tvl_sol: Vault内の総預入SOL
-- roi_pct: deploymentbaselineからの騰落率 (%)
-- drawdown_pct: 過去最高NAVからの最大下落率 (%)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS strategy_performance (
    strategy_id    TEXT    NOT NULL,
    ts_bucket_utc  INTEGER NOT NULL,
    nav_sol        REAL    NOT NULL,
    total_tvl_sol  REAL    NOT NULL DEFAULT 0,
    roi_pct        REAL    NOT NULL DEFAULT 0,
    drawdown_pct   REAL    NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (strategy_id, ts_bucket_utc)
);

CREATE INDEX IF NOT EXISTS idx_performance_strategy
    ON strategy_performance (strategy_id, ts_bucket_utc DESC);
