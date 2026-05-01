/**
 * Kagemusha Routes - Full Version
 * Includes: AI Analysis, Token Fetching, Strategy List (GET), and Hybrid Deploy (POST)
 */

import { Hono } from 'hono';
import { Bindings } from '../config/env';
import { StrategyGenerator } from '../services/strategy';
import { PriceService } from '../services/price';
import { JitoBundleService } from '../services/blockchain';
import {
    Keypair, Connection, Transaction, PublicKey,
    ComputeBudgetProgram
} from '@solana/web3.js';
import {
    getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction 
} from '@solana/spl-token';
import bs58 from 'bs58';

const app = new Hono<{ Bindings: Bindings }>();
const priceService = new PriceService();

// ★★★ あなたのAxis ETF Token (在庫) ★★★
const MASTER_MINT_ADDRESS = new PublicKey("2JiisncKr8DhvA68MpszFDjGAVu2oFtqJJC837LLiKdT");

// 優先手数料
const PRIORITY_FEE = 500000;

// Helper to create Jito service
const createJitoService = (env: Bindings) => {
  return new JitoBundleService('devnet', 'tokyo', env.SOLANA_RPC_URL);
};

// -----------------------------------------------------------
// 🧠 AI Analysis & Token Data (復活)
// -----------------------------------------------------------

app.post('/analyze', async (c) => {
  try {
    const { directive, tags, customInput } = await c.req.json();
    if (!directive) return c.json({ success: false, error: 'Directive required' }, 400);

    const generator = new StrategyGenerator(c.env);
    const strategies = await generator.generateStrategies(directive, tags || [], customInput);

    return c.json({ success: true, strategies });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

let tokenCache: any[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 60 * 1000;

app.get('/tokens', async (c) => {
  try {
    const now = Date.now();
    if (tokenCache.length > 0 && (now - lastFetchTime < CACHE_DURATION)) {
      return c.json({ success: true, tokens: tokenCache, source: 'cache' });
    }

    const response = await fetch(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=solana-ecosystem&order=market_cap_desc&per_page=50&page=1&sparkline=false',
      { headers: { 'User-Agent': 'Axis-App/1.0' } }
    );

    if (!response.ok) throw new Error('CoinGecko API Error');
    const data: any[] = await response.json();

    const formattedTokens = data.map((t: any) => ({
      symbol: t.symbol.toUpperCase(),
      name: t.name,
      address: t.id,
      price: t.current_price,
      change24h: t.price_change_percentage_24h,
      logoURI: t.image,
      marketCap: t.market_cap
    }));

    tokenCache = formattedTokens;
    lastFetchTime = now;

    return c.json({ success: true, tokens: formattedTokens, source: 'api' });
  } catch (error: any) {
    if (tokenCache.length > 0) return c.json({ success: true, tokens: tokenCache, source: 'stale' });
    return c.json({ success: true, tokens: [] });
  }
});

app.get('/tokens/search', async (c) => {
  const query = c.req.query('q') || '';
  const limit = parseInt(c.req.query('limit') || '20');
  const tokens = await priceService.searchTokens(query, limit);
  return c.json({ success: true, tokens });
});

app.get('/tokens/:address/history', async (c) => {
  try {
    const address = c.req.param('address');
    const interval = (c.req.query('interval') as '1h' | '1d' | '1w') || '1d';
    const history = await priceService.getPriceHistory(address, interval);
    if (!history) return c.json({ success: false, error: 'History not available' }, 404);
    return c.json({ success: true, history });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// -----------------------------------------------------------
// 🚀 Strategy Management (Read) - (復活)
// -----------------------------------------------------------

/**
 * GET /strategies/id/:strategyId - Get a single strategy by UUID
 */
app.get('/strategies/id/:strategyId', async (c) => {
  try {
    const strategyId = c.req.param('strategyId');
    const s = await c.env.axis_main_db.prepare(
      `SELECT * FROM strategies WHERE id = ? LIMIT 1`
    ).bind(strategyId).first();

    if (!s) {
      return c.json({ success: false, error: 'Strategy not found' }, 404);
    }

    const strategy = {
      id: s.id,
      ownerPubkey: s.owner_pubkey,
      name: s.name,
      ticker: s.ticker,
      type: s.type,
      tokens: s.composition ? JSON.parse(s.composition as string) : (s.config ? JSON.parse(s.config as string) : []),
      config: s.config ? JSON.parse(s.config as string) : {},
      description: s.description || '',
      tvl: s.tvl || s.total_deposited || 0,
      totalDeposited: s.total_deposited || 0,
      status: s.status,
      mintAddress: s.mint_address,
      vaultAddress: s.vault_address,
      createdAt: s.created_at,
    };

    return c.json({ success: true, strategy });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

/**
 * GET /strategies/:pubkey - Get user's strategies
 */
app.get('/strategies/:pubkey', async (c) => {
  try {
    const pubkey = c.req.param('pubkey');
    const { results } = await c.env.axis_main_db.prepare(
      `SELECT * FROM strategies WHERE owner_pubkey = ? ORDER BY created_at DESC`
    ).bind(pubkey).all();

    const strategies = results.map((s: any) => ({
      id: s.id,
      ownerPubkey: s.owner_pubkey,
      name: s.name,
      ticker: s.ticker,
      type: s.type,
      tokens: s.composition ? JSON.parse(s.composition) : (s.config ? JSON.parse(s.config) : []),
      config: s.config ? JSON.parse(s.config) : {},
      description: s.description || '',
      tvl: s.tvl || s.total_deposited || 0,
      totalDeposited: s.total_deposited || 0,
      status: s.status,
      mintAddress: s.mint_address,
      vaultAddress: s.vault_address,
      createdAt: s.created_at,
    }));

    return c.json({ success: true, strategies });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

/**
 * POST /strategies - Create or update a strategy
 */
app.post('/strategies', async (c) => {
  try {
    const body = await c.req.json();
    const { owner_pubkey, name, ticker, description, type, tokens, address, config } = body;

    if (!owner_pubkey || !name) {
      return c.json({ success: false, error: 'owner_pubkey and name are required' }, 400);
    }

    await ensureUserExists(c.env.axis_main_db, owner_pubkey);

    const now = Math.floor(Date.now() / 1000);

    const existing = await c.env.axis_main_db.prepare(
      "SELECT id FROM strategies WHERE owner_pubkey = ? AND name = ?"
    ).bind(owner_pubkey, name).first();

    if (existing) {
      await c.env.axis_main_db.prepare(
        `UPDATE strategies SET ticker = ?, description = ?, composition = ?, config = ? WHERE id = ?`
      ).bind(
        ticker || '', description || '',
        JSON.stringify(tokens || []), JSON.stringify(config || {}),
        existing.id
      ).run();
      return c.json({ success: true, strategyId: existing.id, updated: true });
    }

    const id = crypto.randomUUID();
    await c.env.axis_main_db.prepare(`
      INSERT INTO strategies (
        id, owner_pubkey, name, ticker, description, type,
        composition, config, status, created_at, tvl, total_deposited, roi
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 0, 0, 0)
    `).bind(
      id, owner_pubkey, name, ticker || '', description || '', type || 'MANUAL',
      JSON.stringify(tokens || []), JSON.stringify(config || {}), now
    ).run();

    return c.json({ success: true, strategyId: id });
  } catch (e: any) {
    console.error('[CreateStrategy] Error:', e);
    return c.json({ success: false, error: e.message }, 500);
  }
});

/**
 * GET /discover - Public strategies
 */
app.get('/discover', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const { results } = await c.env.axis_main_db.prepare(
      `SELECT * FROM strategies
        WHERE status = 'active'
        ORDER BY tvl DESC, total_deposited DESC, created_at DESC
        LIMIT ? OFFSET ?`
    ).bind(limit, offset).all();

    const strategies = results.map((s: any) => ({
      id: s.id,
      ownerPubkey: s.owner_pubkey,
      name: s.name,
      ticker: s.ticker,
      tokens: s.composition ? JSON.parse(s.composition) : (s.config ? JSON.parse(s.config) : []),
      config: s.config ? JSON.parse(s.config) : {},
      tvl: s.tvl || s.total_deposited || 0,
      mintAddress: s.mint_address,
      vaultAddress: s.vault_address,
      createdAt: s.created_at,
    }));

    return c.json({ success: true, strategies });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// -----------------------------------------------------------
// 🚀 Strategy Deployment (Hybrid CEX Model)
// -----------------------------------------------------------

app.post('/deploy', async (c) => {
  try {
    const body = await c.req.json();

    // フロントエンドから送られてきた情報
    const { signature } = body;
    const { ownerPubkey, name, ticker, description, type, tokens, config, tvl, address, protocol } = body.metadata || body;
    const depositAmountSOL = tvl || 0;
    const now = Math.floor(Date.now() / 1000);
    const id = body.strategyId || crypto.randomUUID();

    if (!ownerPubkey) {
      return c.json({ success: false, error: 'ownerPubkey is required' }, 400);
    }
    await ensureUserExists(c.env.axis_main_db, ownerPubkey);

    // 1. 環境設定
    if (!c.env.SERVER_PRIVATE_KEY) throw new Error("Missing SERVER_PRIVATE_KEY");
    // Helius RPC
    const rpcUrl = c.env.HELIUS_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const adminWallet = Keypair.fromSecretKey(bs58.decode(c.env.SERVER_PRIVATE_KEY));
    const adminPubkeyStr = adminWallet.publicKey.toString();

    let transferTxId = "";

    // 2. トークン配給ロジック (Admin在庫 -> User)
    if (depositAmountSOL > 0 && ownerPubkey) {
        try {
            const userPubkey = new PublicKey(ownerPubkey);
            const RATE = 1000;
            const amount = BigInt(Math.floor(depositAmountSOL * RATE * 1_000_000_000)); // 9 decimals

            const adminATA = await getAssociatedTokenAddress(MASTER_MINT_ADDRESS, adminWallet.publicKey);
            const userATA = await getAssociatedTokenAddress(MASTER_MINT_ADDRESS, userPubkey);

            const tx = new Transaction();
            tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE }));

            const info = await connection.getAccountInfo(userATA);
            if (!info) {
                tx.add(createAssociatedTokenAccountInstruction(
                    adminWallet.publicKey, userATA, userPubkey, MASTER_MINT_ADDRESS
                ));
            }

            tx.add(createTransferInstruction(
                adminATA, userATA, adminWallet.publicKey, amount
            ));

            const latest = await connection.getLatestBlockhash('confirmed');
            tx.recentBlockhash = latest.blockhash;
            tx.feePayer = adminWallet.publicKey;
            tx.sign(adminWallet);

            // シミュレーションをスキップして即座に投げる
            transferTxId = await connection.sendRawTransaction(tx.serialize(), {
                skipPreflight: true,
                maxRetries: 5
            });

        } catch (e: any) {
            console.error("⚠️ Token Transfer Failed (Non-critical for DB):", e);
        }
    }

    // 3. DB保存
    // PFMM (pfda-amm-3) deploys send the pool PDA as `address`; persist that as
    // vault_address so /discover and Buy/Sell can read it back. Legacy hybrid
    // deploys without `address` fall back to the admin pubkey for compatibility.
    const vaultAddress = address || adminPubkeyStr;
    const mergedConfig = protocol ? { ...(config || {}), protocol } : (config || {});
    await c.env.axis_main_db.prepare(`
        INSERT INTO strategies (
          id, owner_pubkey, name, ticker, description, type,
          composition, config, status, created_at,
          tvl, total_deposited, roi,
          mint_address, vault_address
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, 0, ?, ?)
    `).bind(
        id, ownerPubkey, name, ticker, description || '', type || 'MANUAL',
        JSON.stringify(tokens), JSON.stringify(mergedConfig),
        now, depositAmountSOL, depositAmountSOL,
        MASTER_MINT_ADDRESS.toString(),
        vaultAddress
    ).run();

    // XP付与 (Phase 2: 50 XP per deploy)
    await addXP(c.env.axis_main_db, ownerPubkey, 50, 'STRATEGY_DEPLOY', 'Deployed Strategy');

    return c.json({
        success: true,
        strategyId: id,
        mintAddress: MASTER_MINT_ADDRESS.toString(),
        transferTxId,
        message: `Strategy Deployed! Sent ${depositAmountSOL * 1000} AXIS tokens.` 
    });

  } catch (error: any) {
    console.error('[Deploy] Error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// -----------------------------------------------------------
// 💰 Swap / Invest (USDC -> AXIS)
// -----------------------------------------------------------
app.post('/trade', async (c) => {
  try {
      const body = await c.req.json();
      const { userPubkey, amount, mode, signature, txSig, strategyId } = body;
      // mode: 'BUY' (user deposited SOL into the ETF) or 'SELL' (user withdrew SOL).
      //
      // NOTE: This endpoint NO LONGER moves funds. All on-chain settlement is done
      // by the client (axis-vault / PFMM flows). This handler is bookkeeping only:
      //   - update strategies.tvl
      //   - run TVL milestone XP bonus
      //   - update users.total_invested_usd + investments rows so the profile's
      //     "Invested" tab reflects v1.1 axis-vault and PFMM activity.
      // The previous implementation also minted a placeholder AXIS token on BUY
      // and sent SOL from the admin treasury on SELL. Both were kagemusha-mock
      // leftovers that polluted user wallets / drained admin funds; removed.

      const parsedAmount = Number(amount) || 0;

      if (!mode || (mode !== 'BUY' && mode !== 'SELL')) {
          return c.json({ success: false, error: "mode must be 'BUY' or 'SELL'" }, 400);
      }
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
          return c.json({ success: false, error: 'amount must be a positive number' }, 400);
      }

      // 1) strategies.tvl update (signed by mode) + TVL milestone bonus on BUY
      if (strategyId) {
          const change = mode === 'BUY' ? parsedAmount : -parsedAmount;

          // TVL更新前の値を取得（マイルストーン判定用）
          const stratBefore = await c.env.axis_main_db.prepare(
            "SELECT tvl, owner_pubkey FROM strategies WHERE id = ?"
          ).bind(strategyId).first();

          await c.env.axis_main_db.prepare(
            "UPDATE strategies SET tvl = tvl + ? WHERE id = ?"
          ).bind(change, strategyId).run();

          // TVL $10k マイルストーンボーナス（BUYで閾値を超えた場合のみ、一度だけ）
          const TVL_MILESTONE = 10000;
          if (mode === 'BUY' && stratBefore) {
            const tvlBefore = (stratBefore.tvl as number) || 0;
            const tvlAfter = tvlBefore + parsedAmount;
            const ownerPubkey = stratBefore.owner_pubkey as string;

            if (tvlBefore < TVL_MILESTONE && tvlAfter >= TVL_MILESTONE && ownerPubkey) {
              // 二重付与チェック: このstrategyIdで既にTVL_MILESTONEを付与済みでないか
              const alreadyAwarded = await c.env.axis_main_db.prepare(
                "SELECT id FROM xp_ledger WHERE related_id = ? AND action_type = 'TVL_MILESTONE' LIMIT 1"
              ).bind(strategyId).first();

              if (!alreadyAwarded) {
                await c.env.axis_main_db.prepare(
                  "INSERT INTO xp_ledger (user_pubkey, amount, action_type, description, related_id) VALUES (?, ?, 'TVL_MILESTONE', ?, ?)"
                ).bind(ownerPubkey, 500, `TVL $10k Milestone: ${strategyId}`, strategyId).run();
                await c.env.axis_main_db.prepare(
                  "UPDATE users SET total_xp = total_xp + 500 WHERE wallet_address = ?"
                ).bind(ownerPubkey).run();
              }
            }
          }
      }

      // 2) Per-user investment tracking (mirrors POST /user/stats pattern).
      //    Skip if either userPubkey or strategyId is missing — legacy callers
      //    don't always include strategyId, and we can't attribute without one.
      // FIXME: amount is SOL not USD; needs spot-price conversion. Tracked separately.
      if (userPubkey && strategyId) {
          const user = await c.env.axis_main_db.prepare(
            'SELECT id FROM users WHERE wallet_address = ?'
          ).bind(userPubkey).first();

          if (user) {
              if (mode === 'BUY') {
                  await c.env.axis_main_db.prepare(
                    `UPDATE users SET total_invested_usd = total_invested_usd + ? WHERE wallet_address = ?`
                  ).bind(parsedAmount, userPubkey).run();

                  const invId = crypto.randomUUID();
                  await c.env.axis_main_db.prepare(`
                    INSERT INTO investments (id, user_id, strategy_id, amount_usd)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(user_id, strategy_id) DO UPDATE SET amount_usd = amount_usd + ?
                  `).bind(invId, user.id, strategyId, parsedAmount, parsedAmount).run();
              } else {
                  // SELL: subtract, clamp at 0 so a partial withdraw past basis
                  // doesn't roll into negative on either the user total or the
                  // per-strategy row.
                  await c.env.axis_main_db.prepare(
                    `UPDATE users SET total_invested_usd = MAX(0, total_invested_usd - ?) WHERE wallet_address = ?`
                  ).bind(parsedAmount, userPubkey).run();

                  const invId = crypto.randomUUID();
                  await c.env.axis_main_db.prepare(`
                    INSERT INTO investments (id, user_id, strategy_id, amount_usd)
                    VALUES (?, ?, ?, 0)
                    ON CONFLICT(user_id, strategy_id) DO UPDATE SET amount_usd = MAX(0, amount_usd - ?)
                  `).bind(invId, user.id, strategyId, parsedAmount).run();
              }
          }
      }

      // No on-chain admin tx anymore — echo the client-supplied signature/txSig if present.
      return c.json({ success: true, txSig: signature ?? txSig ?? null });

  } catch (e: any) {
      console.error("Trade Error:", e);
      return c.json({ success: false, error: e.message }, 500);
  }
});


// /strategies/:id/chart は app.ts で getLineChartData として登録済み

// GET /strategies/:id/performance - ETFパフォーマンスサマリー
app.get('/strategies/:id/performance', async (c) => {
  try {
    const id = c.req.param('id');

    // 現在の最新パフォーマンス
    const current = await c.env.axis_price_db.prepare(
      `SELECT nav_sol, roi_pct, ts_bucket_utc FROM strategy_performance WHERE strategy_id = ? ORDER BY ts_bucket_utc DESC LIMIT 1`
    ).bind(id).first();

    // 24時間前以前の最新パフォーマンス
    const ago24h = await c.env.axis_price_db.prepare(
      `SELECT nav_sol FROM strategy_performance WHERE strategy_id = ? AND ts_bucket_utc <= (unixepoch() - 86400) ORDER BY ts_bucket_utc DESC LIMIT 1`
    ).bind(id).first();

    // 7日前以前の最新パフォーマンス
    const ago7d = await c.env.axis_price_db.prepare(
      `SELECT nav_sol FROM strategy_performance WHERE strategy_id = ? AND ts_bucket_utc <= (unixepoch() - 604800) ORDER BY ts_bucket_utc DESC LIMIT 1`
    ).bind(id).first();

    // ETF作成時の基準NAV (正規化の分母)
    const baseline = await c.env.axis_main_db.prepare(
      `SELECT baseline_nav FROM strategy_deployment_baseline WHERE strategy_id = ?`
    ).bind(id).first();

    // スナップショット未蓄積
    if (!current) {
      return c.json({ success: true, current_price: null, change_24h: null, change_7d: null, change_since_inception: null, confidence: 'NO_DATA', last_updated: null });
    }
    // baselineなし or ゼロ → ゼロ除算回避
    else if (!baseline || baseline.baseline_nav === 0) {
      return c.json({ success: true, current_price: null, change_24h: null, change_7d: null, change_since_inception: null, confidence: 'FAIL', last_updated: null });
    } else {

      // normalized = (nav_sol / baseline_nav) * 100
      const currentNormalized = (current.nav_sol as number / baseline.baseline_nav as number) * 100;
      const normalized24h = ago24h ? (ago24h.nav_sol as number / baseline.baseline_nav as number) * 100 : null;
      const normalized7d  = ago7d  ? (ago7d.nav_sol  as number / baseline.baseline_nav as number) * 100 : null;

      // change% = ((current - past) / past) * 100
      const change_24h = normalized24h !== null ? ((currentNormalized - normalized24h) / normalized24h) * 100 : null;
      const change_7d  = normalized7d  !== null ? ((currentNormalized - normalized7d)  / normalized7d)  * 100 : null;
      // inception変動 = currentNormalized - 100 (baseline開始時が100のため)
      const change_since_inception = currentNormalized - 100;
      // 24h・7d両方揃っていればOK、片方欠けていればPARTIAL
      const confidence = ago24h && ago7d ? 'OK' : 'PARTIAL';

      return c.json({
        success: true,
        current_price: currentNormalized,
        change_24h,
        change_7d,
        change_since_inception,
        confidence,
        last_updated: current.ts_bucket_utc
      });
    }

  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})


app.get('/prepare-deployment', async (c) => {
  const jitoService = createJitoService(c.env);
  const tipAccount = await jitoService.getRandomTipAccount();
  return c.json({ success: true, tipAccount });
});

app.post('/art/generate', async (c) => {
  try {
    const { tokens, strategyType, walletAddress } = await c.req.json();

    if (!tokens || !Array.isArray(tokens)) {
      return c.json({ success: false, error: 'tokens array required' }, 400);
    }

    return c.json({
      success: true,
      imageUrl: '/ETFtoken.png',
      message: 'Art generation placeholder'
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// GET /strategies/:id/transactions
// DBキャッシュ優先、なければHelius RPC から取得
app.get('/strategies/:id/transactions', async (c) => {
  try {
    const strategyId = c.req.param('id');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 50);

    const record = await c.env.axis_main_db.prepare(
      'SELECT vault_address FROM strategies WHERE id = ? LIMIT 1'
    ).bind(strategyId).first() as { vault_address: string } | null;

    if (!record) {
      return c.json({ success: false, message: 'Strategy not found' }, 404);
    }

    // DBキャッシュを先に確認（ローカル開発・高速レスポンス用）
    try {
      const { results: cached } = await c.env.axis_price_db.prepare(
        `SELECT signature, type, account, amount_sol, block_time
         FROM strategy_transactions
         WHERE strategy_id = ?
         ORDER BY block_time DESC
         LIMIT ?`
      ).bind(strategyId, limit).all();

      if (cached.length > 0) {
        return c.json({
          success: true,
          data: (cached as any[]).map(r => ({
            signature: r.signature,
            type: r.type,
            account: r.account,
            amountSol: r.amount_sol,
            blockTime: r.block_time,
          })),
        });
      }
    } catch {
      // テーブルが存在しない場合はスルーしてHeliusへ
    }

    // DBにデータがなければHelius RPC から取得
    if (!record.vault_address) return c.json({ success: true, data: [] });

    const rpcUrl = c.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const vaultPubkey = new PublicKey(record.vault_address);

    const signatures = await connection.getSignaturesForAddress(vaultPubkey, { limit });
    if (!signatures.length) return c.json({ success: true, data: [] });

    const txs = await connection.getParsedTransactions(
      signatures.map(s => s.signature),
      { maxSupportedTransactionVersion: 0 }
    );

    const results: any[] = [];
    for (let i = 0; i < signatures.length; i++) {
      const sig = signatures[i];
      const tx = txs[i];
      if (!tx || tx.meta?.err) continue;

      const instructions = tx.transaction.message.instructions as any[];
      for (const ix of instructions) {
        if (ix.program === 'system' && ix.parsed?.type === 'transfer' && ix.parsed?.info) {
          const { source, destination, lamports } = ix.parsed.info;
          const amountSol = lamports / 1e9;
          const isDeposit = destination === record.vault_address;
          results.push({
            signature: sig.signature,
            type: isDeposit ? 'deposit' : 'withdraw',
            account: isDeposit ? source : destination,
            amountSol,
            blockTime: sig.blockTime ?? 0,
          });
        }
      }
    }

    return c.json({ success: true, data: results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// strategies.owner_pubkey has a FK to users.wallet_address. Phantom-direct
// connects skip /register, so the row may not exist yet — create a minimal one
// before any strategies INSERT to keep the FK satisfied.
async function ensureUserExists(db: D1Database, walletAddress: string) {
  const existing = await db.prepare(
    `SELECT 1 FROM users WHERE wallet_address = ?`
  ).bind(walletAddress).first();
  if (existing) return;
  const id = crypto.randomUUID();
  const inviteCode = `AXIS-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  await db.prepare(
    `INSERT OR IGNORE INTO users (id, wallet_address, invite_code, total_xp, rank_tier, last_checkin)
     VALUES (?, ?, ?, 0, 'Novice', 0)`
  ).bind(id, walletAddress, inviteCode).run();
}

// Helper function for XP
async function addXP(db: D1Database, pubkey: string, amount: number, actionType: string, description: string) {
  try {
    await db.prepare(
      `INSERT INTO xp_ledger (user_pubkey, amount, action_type, description) VALUES (?, ?, ?, ?)`
    ).bind(pubkey, amount, actionType, description).run();
    await db.prepare(
      `UPDATE users SET total_xp = total_xp + ? WHERE wallet_address = ?`
    ).bind(Math.floor(amount), pubkey).run();
  } catch(e) { /* ignore */ }
}

export default app;