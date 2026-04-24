-- ============================================================
-- strategy_transactions
-- Deposit / Withdraw 履歴テーブル
--
-- データソース: Helius Enhanced Webhook（本番）
--              ローカル開発時は手動INSERT
--
-- strategy_id: axis_main_db.strategies.id と対応（FK制約なし・別DB）
-- signature:   Solana トランザクション署名（一意）
-- type:        'deposit' | 'withdraw'
-- account:     送信元（deposit時）または送信先（withdraw時）のウォレットアドレス
-- amount_sol:  SOL 量（lamports ではなく SOL 単位）
-- block_time:  ブロック確認時刻（unix秒）
-- ============================================================
CREATE TABLE IF NOT EXISTS strategy_transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id  TEXT    NOT NULL,
    signature    TEXT    NOT NULL UNIQUE,
    type         TEXT    NOT NULL CHECK(type IN ('deposit', 'withdraw')),
    account      TEXT    NOT NULL,
    amount_sol   REAL    NOT NULL,
    block_time   INTEGER NOT NULL,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_stx_strategy_time
    ON strategy_transactions (strategy_id, block_time DESC);
