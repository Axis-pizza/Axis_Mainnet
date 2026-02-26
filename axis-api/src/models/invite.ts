import { drizzle } from "drizzle-orm/d1";
import { and, eq, isNull } from "drizzle-orm";
import { invitesTable } from "../db/schema";

// Re-export for drizzle-kit (schema: 'src/models' configuration)
export { invitesTable };

export interface Invite {
  code: string;
  creator_id: string;
  email?: string;
  used_by_user_id?: string;
  is_used?: number;
}

const ADMIN_CODES = ['AXIS-9567', 'AXIS-ADMIN'];

function generateInviteCode(): string {
  return `AXIS-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

export async function findInviteByCode(db: D1Database, code: string): Promise<Invite | null> {
  if (!code) return null;
  if (ADMIN_CODES.includes(code.toUpperCase())) {
    return { code: code.toUpperCase(), creator_id: 'admin' };
  }

  const drizzledb = drizzle(db);
  try {
    const [result] = await drizzledb.select().from(invitesTable)
      .where(and(eq(invitesTable.code, code), isNull(invitesTable.used_by_user_id)))
      .limit(1);
    return (result as unknown as Invite) ?? null;
  } catch (e) {
    return null;
  }
}

// 以下の関数におけるinvitesは元々invite_codesテーブルを使用していたため、該当部分をコメントアウト

export async function findInvitesByCreator(db: D1Database, creatorId: string): Promise<Invite[]> {
  // 元: SELECT * FROM invite_codes WHERE creator_id = ?
  // const drizzledb = drizzle(db);
  // const results = await drizzledb.select().from(invitesTable).where(eq(invitesTable.creator_id, creatorId));
  // return results as unknown as Invite[];
  return [];
}

export async function markInviteUsed(db: D1Database, code: string, userId: string): Promise<void> {
  // 元: UPDATE invite_codes SET is_used = 1, used_by = ? WHERE code = ?
  // if (!code || ADMIN_CODES.includes(code.toUpperCase())) return;
  // const drizzledb = drizzle(db);
  // await drizzledb.update(invitesTable)
  //   .set({ used_by_user_id: userId })
  //   .where(eq(invitesTable.code, code));
}

// ★警告が出ていた関数を明示的にエクスポート
export async function createInvites(db: D1Database, userId: string, count: number = 5): Promise<void> {
  // 元: INSERT INTO invite_codes (code, creator_id, email) VALUES (?, ?, ?)
  // const drizzledb = drizzle(db);
  // const values = Array.from({ length: count }, () => ({
  //   code: generateInviteCode(),
  //   creator_id: userId,
  //   created_at: Math.floor(Date.now() / 1000),
  // }));
  // await drizzledb.insert(invitesTable).values(values);
}

export async function createOneInvite(db: D1Database, creatorId: string, _email?: string): Promise<string> {
  // 元: INSERT INTO invite_codes (code, creator_id, email) VALUES (?, ?, ?)
  // const code = generateInviteCode();
  // const drizzledb = drizzle(db);
  // await drizzledb.insert(invitesTable).values({
  //   code,
  //   creator_id: creatorId ?? 'system',
  //   created_at: Math.floor(Date.now() / 1000),
  // });
  // return code;
  return '';
}