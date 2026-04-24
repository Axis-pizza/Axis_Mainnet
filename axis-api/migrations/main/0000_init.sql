-- ============================================================
-- axis_db  — Main Database
-- Axis Protocol Mainnet
-- ============================================================

-- ------------------------------------------------------------
-- users
-- ウォレット認証・プロフィール・XP残高を管理する中心テーブル
-- wallet_address: Solana公開鍵（ログイン識別子）
-- invite_code: このユーザーが他者に配布できる招待コード
-- invite_code_used: 登録時に使用した招待コード
-- total_xp / rank_tier: XPゲームループ
-- last_checkin: デイリーチェックイン最終実施日時 (unix秒)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                  TEXT    PRIMARY KEY,
    wallet_address      TEXT    NOT NULL UNIQUE,
    email               TEXT    UNIQUE,
    name                TEXT,
    bio                 TEXT,
    avatar_url          TEXT,
    twitter_id          TEXT,
    google_id           TEXT,
    invite_code         TEXT    UNIQUE,
    invite_code_used    TEXT,
    badges              TEXT,
    total_xp            INTEGER NOT NULL DEFAULT 0,
    rank_tier           TEXT    NOT NULL DEFAULT 'Novice',
    pnl_percent         REAL    NOT NULL DEFAULT 0,
    last_checkin        INTEGER NOT NULL DEFAULT 0,
    last_faucet_at      INTEGER,
    total_invested_usd  REAL    NOT NULL DEFAULT 0,
    last_snapshot_at    INTEGER,
    otp_code            TEXT,
    otp_expires         INTEGER,
    created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_users_wallet ON users (wallet_address);

-- ------------------------------------------------------------
-- strategies
-- ユーザーが作成したETFバスケット本体
-- composition: JSON配列 [{ symbol, weight, mint, logoURI }]
-- vault_address: on-chain PDA（デプロイ時にFEから受け取る）
--   ※ adminPubkeyを入れないこと（旧devnetのバグ）
-- total_deposited: Vault内の累計預入SOL残高
-- tvl: 現在のTVL (SOL建て)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS strategies (
    id               TEXT    PRIMARY KEY,
    owner_pubkey     TEXT    NOT NULL REFERENCES users (wallet_address),
    name             TEXT    NOT NULL,
    ticker           TEXT    NOT NULL,
    type             TEXT    NOT NULL DEFAULT 'BALANCED',
    description      TEXT,
    composition      TEXT    NOT NULL, -- JSON
    config           TEXT,             -- JSON (将来の拡張用)
    vault_address    TEXT,             -- on-chain PDA
    mint_address     TEXT,             -- ETFトークンのSPL mint
    total_deposited  REAL    NOT NULL DEFAULT 0,
    tvl              REAL    NOT NULL DEFAULT 0,
    roi              REAL    NOT NULL DEFAULT 0,
    status           TEXT    NOT NULL DEFAULT 'active',
    is_public        INTEGER NOT NULL DEFAULT 1,
    created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_strategies_owner ON strategies (owner_pubkey);
CREATE INDEX IF NOT EXISTS idx_strategies_public ON strategies (is_public, created_at DESC);

-- ------------------------------------------------------------
-- invites
-- ユーザーが発行する招待コード管理
-- creator_id: 招待コードを発行したユーザーのid
-- used_by_user_id: 使用したユーザーのid (NULLなら未使用)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invites (
    code             TEXT    PRIMARY KEY,
    creator_id       TEXT    NOT NULL REFERENCES users (id),
    used_by_user_id  TEXT    REFERENCES users (id),
    created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ------------------------------------------------------------
-- watchlist
-- ユーザーがブックマークしている戦略
-- UNIQUE制約でユーザーごとに重複登録を防ぐ
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watchlist (
    id           TEXT    PRIMARY KEY,
    user_id      TEXT    NOT NULL REFERENCES users (id),
    strategy_id  TEXT    NOT NULL REFERENCES strategies (id),
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (user_id, strategy_id)
);

-- ------------------------------------------------------------
-- xp_ledger
-- XPの増減履歴（監査ログ）
-- action_type: 'DEPOSIT' | 'WITHDRAW' | 'CHECKIN' | 'REFERRAL_BONUS'
--              | 'HOLDING_REWARD' | 'TVL_MILESTONE' 等
-- related_id: 関連するstrategy_idやtx_signature等
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS xp_ledger (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_pubkey  TEXT    NOT NULL,
    amount       REAL    NOT NULL,
    action_type  TEXT    NOT NULL,
    description  TEXT,
    related_id   TEXT,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_xp_ledger_user ON xp_ledger (user_pubkey, created_at DESC);

-- ------------------------------------------------------------
-- xp_rates
-- 戦略ごとのXP付与レート設定
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS xp_rates (
    strategy_id  TEXT    PRIMARY KEY REFERENCES strategies (id),
    base_rate    REAL    NOT NULL DEFAULT 1.0,
    is_active    INTEGER NOT NULL DEFAULT 1
);

-- ------------------------------------------------------------
-- xp_snapshots
-- Cronで定期的に記録するユーザーごとの預入残高スナップショット
-- XP付与計算の入力として使用する
-- amount_sol: 対象戦略への預入SOL
-- capped_sol: 上限キャップ適用後の値
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS xp_snapshots (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_pubkey  TEXT    NOT NULL,
    strategy_id  TEXT    NOT NULL,
    amount_sol   REAL    NOT NULL DEFAULT 0,
    capped_sol   REAL    NOT NULL DEFAULT 0,
    snapshot_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    is_processed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_xp_snapshots_user ON xp_snapshots (user_pubkey, snapshot_at DESC);

-- ------------------------------------------------------------
-- strategy_deployment_baseline
-- ETFデプロイ時点のNAV基準値（パフォーマンス計算の原点）
-- baseline_nav: デプロイ時の初期NAV (SOL建て)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS strategy_deployment_baseline (
    strategy_id             TEXT    PRIMARY KEY REFERENCES strategies (id),
    baseline_ts_bucket_utc  INTEGER NOT NULL,
    baseline_nav            REAL    NOT NULL DEFAULT 1.0,
    baseline_confidence     TEXT,
    created_at              INTEGER NOT NULL DEFAULT (unixepoch())
);
