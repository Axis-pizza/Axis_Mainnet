import { drizzle } from "drizzle-orm/d1";
import { eq, sql, SQL } from "drizzle-orm";
import { usersTable } from "../db/schema";

// Re-export for drizzle-kit (schema: 'src/models' configuration)
export { usersTable };

export interface User {
  id: string;
  twitter_id?: string;
  email?: string;
  wallet_address?: string;
  name?: string;
  bio?: string;
  avatar_url?: string;
  invite_code: string;
  referred_by?: string;
  badges?: string;
  otp_code?: string;
  otp_expires?: number;
  invite_code_used?: string;
  is_existing?: boolean;
  total_xp?: number;
  rank_tier?: string;
  last_checkin?: number;
  last_faucet_at?: number;
  pnl_percent?: number;
  total_invested_usd?: number;
  last_snapshot_at?: number;
}

// --- Read Functions ---

export async function findUserByTwitterId(db: D1Database, twitterId: string): Promise<User | null> {
  const drizzledb = drizzle(db);
  const [result] = await drizzledb.select().from(usersTable).where(eq(usersTable.twitter_id, twitterId ?? null)).limit(1);
  return (result as unknown as User) ?? null;
}

export async function findUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const drizzledb = drizzle(db);
  const [result] = await drizzledb.select().from(usersTable).where(eq(usersTable.email, email ?? null)).limit(1);
  return (result as unknown as User) ?? null;
}

export async function findUserByWallet(db: D1Database, wallet: string): Promise<User | null> {
  const drizzledb = drizzle(db);
  const [result] = await drizzledb.select().from(usersTable).where(eq(usersTable.wallet_address, wallet ?? null)).limit(1);
  return (result as unknown as User) ?? null;
}

// --- Twitter Functions ---

export async function linkTwitterToUser(
  db: D1Database, wallet: string, twitterId: string, avatarUrl: string
): Promise<void> {
  const drizzledb = drizzle(db);
  await drizzledb.update(usersTable)
    .set({ twitter_id: twitterId, avatar_url: avatarUrl })
    .where(eq(usersTable.wallet_address, wallet));
}

export async function createTwitterUser(
  db: D1Database, id: string, twitterId: string, name: string, avatarUrl: string, inviteCode: string
): Promise<void> {
  const drizzledb = drizzle(db);
  await drizzledb.insert(usersTable).values({
    id,
    twitter_id: twitterId,
    name,
    avatar_url: avatarUrl,
    invite_code: inviteCode,
  } as any);
}

// --- Create Functions ---

export async function createRegisteredUser(
    db: D1Database,
    id: string,
    email: string | null,
    wallet: string,
    inviteCode: string,
    inviteCodeUsed: string | null,
    avatarUrl?: string,
    name?: string,
    _bio?: string // スキーマ未定義のため未使用
): Promise<void> {
  const drizzledb = drizzle(db);
  await drizzledb.insert(usersTable).values({
    id: id ?? null,
    email: email ?? null,
    wallet_address: wallet ?? null,
    invite_code: inviteCode ?? null,
    invite_code_used: inviteCodeUsed ?? null,
    avatar_url: avatarUrl ?? null,
    name: name ?? null,
  } as any);
}

export async function createOtpUser(db: D1Database, id: string, email: string, code: string, expires: number): Promise<void> {
  const drizzledb = drizzle(db);
  await drizzledb.insert(usersTable).values({
    id: id ?? null,
    email: email ?? null,
    otp_code: code ?? null,
    otp_expires: expires ?? null,
  } as any);
}

// --- Update Functions ---

export async function updateUser(db: D1Database, wallet: string, updates: { name?: string, bio?: string, avatar_url?: string, badges?: string }): Promise<void> {
  const drizzledb = drizzle(db);
  const chunks: SQL[] = [];

  if (updates.name !== undefined) chunks.push(sql`name = ${updates.name ?? null}`);
  if (updates.bio !== undefined) chunks.push(sql`bio = ${updates.bio ?? null}`);
  if (updates.avatar_url !== undefined) chunks.push(sql`avatar_url = ${updates.avatar_url ?? null}`);
  if (updates.badges !== undefined) chunks.push(sql`badges = ${updates.badges ?? null}`);

  if (chunks.length === 0) return;

  await drizzledb.run(sql`UPDATE users SET ${sql.join(chunks, sql`, `)} WHERE wallet_address = ${wallet}`);
}

export async function updateUserXp(db: D1Database, wallet: string, xp: number, lastCheckin: number): Promise<void> {
  const drizzledb = drizzle(db);
  await drizzledb.run(sql`UPDATE users SET total_xp = ${xp}, last_checkin = ${lastCheckin} WHERE wallet_address = ${wallet}`);
}

// ★前回不足していた関数を追加
export async function updateUserWalletAndInvite(db: D1Database, email: string, wallet: string | null, inviteCode: string): Promise<void> {
  const drizzledb = drizzle(db);
  await drizzledb.update(usersTable)
    .set({
      otp_code: null,
      wallet_address: wallet ?? null,
      invite_code_used: inviteCode ?? null,
    } as any)
    .where(eq(usersTable.email, email ?? null));
}

export async function updateUserOtp(db: D1Database, email: string, code: string, expires: number): Promise<void> {
  const drizzledb = drizzle(db);
  await drizzledb.update(usersTable)
    .set({ otp_code: code ?? null, otp_expires: expires ?? null })
    .where(eq(usersTable.email, email ?? null));
}

export async function updateUserStats(db: D1Database, wallet: string, pnl: number, invested: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000); // Unix Timestamp

  // ランク判定ロジック (簡易版)
  let rank = 'Novice';
  if (invested > 10000) rank = 'Whale';
  else if (pnl > 50) rank = 'Alpha';
  else if (invested > 1000) rank = 'Degen';

  const drizzledb = drizzle(db);
  await drizzledb.run(sql`UPDATE users SET pnl_percent = ${pnl}, total_invested_usd = ${invested}, rank_tier = ${rank}, last_snapshot_at = ${now} WHERE wallet_address = ${wallet}`);
}
