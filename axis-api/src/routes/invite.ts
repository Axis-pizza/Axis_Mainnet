import { Hono } from 'hono';
import { Bindings } from '../config/env';

const app = new Hono<{ Bindings: Bindings }>();

// ─── POST /invite/verify ──────────────────────────────────────────────────────
// Body: { wallet?: string, code?: string }
//
// wallet → whitelist テーブルを照合し { allowed, tier? } を返す
// code   → invite_codes テーブルを照合し { valid, reason? } を返す
// ─────────────────────────────────────────────────────────────────────────────
app.post('/verify', async (c) => {
  try {
    const body = await c.req.json<{ wallet?: string; code?: string }>();
    const db = c.env.DB_INVITE;

    // ── Wallet whitelist check ────────────────────────────────────────────
    if (body.wallet) {
      const row = await db
        .prepare('SELECT tier FROM whitelist WHERE wallet = ?')
        .bind(body.wallet.trim())
        .first<{ tier: string }>();

      if (row) {
        return c.json({ allowed: true, tier: row.tier as 'A' | 'B' });
      }
      return c.json({ allowed: false });
    }

    // ── Invite code check ─────────────────────────────────────────────────
    if (body.code) {
      const code = body.code.trim().toUpperCase();

      const row = await db
        .prepare(`
          SELECT code, used_at, expires_at
          FROM invite_codes
          WHERE code = ?
        `)
        .bind(code)
        .first<{ code: string; used_at: number | null; expires_at: number | null }>();

      if (!row) {
        return c.json({ valid: false, reason: 'Code not found' });
      }
      if (row.used_at !== null) {
        return c.json({ valid: false, reason: 'Code already used' });
      }
      if (row.expires_at !== null && row.expires_at <= Math.floor(Date.now() / 1000)) {
        return c.json({ valid: false, reason: 'Code expired' });
      }

      return c.json({ valid: true });
    }

    return c.json({ error: 'Provide wallet or code' }, 400);
  } catch (e: any) {
    console.error('[invite/verify]', e);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ─── POST /invite/use ─────────────────────────────────────────────────────────
// Body: { code: string, wallet: string }
//
// 同じバリデーションを再実行してから used_at / used_by_wallet をセット
// ─────────────────────────────────────────────────────────────────────────────
app.post('/use', async (c) => {
  try {
    const body = await c.req.json<{ code: string; wallet: string }>();

    if (!body.code || !body.wallet) {
      return c.json({ error: 'code and wallet are required' }, 400);
    }

    const code   = body.code.trim().toUpperCase();
    const wallet = body.wallet.trim();
    const db     = c.env.DB_INVITE;

    const row = await db
      .prepare(`
        SELECT code, used_at, expires_at
        FROM invite_codes
        WHERE code = ?
      `)
      .bind(code)
      .first<{ code: string; used_at: number | null; expires_at: number | null }>();

    if (!row) {
      return c.json({ success: false, reason: 'Code not found' });
    }
    if (row.used_at !== null) {
      return c.json({ success: false, reason: 'Code already used' });
    }
    if (row.expires_at !== null && row.expires_at <= Math.floor(Date.now() / 1000)) {
      return c.json({ success: false, reason: 'Code expired' });
    }

    await db
      .prepare(`
        UPDATE invite_codes
        SET used_at = unixepoch(), used_by_wallet = ?
        WHERE code = ?
      `)
      .bind(wallet, code)
      .run();

    return c.json({ success: true });
  } catch (e: any) {
    console.error('[invite/use]', e);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;
