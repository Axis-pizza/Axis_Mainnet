import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
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
  const [result] = await drizzledb.select().from(invitesTable).where(eq(invitesTable.code, code)).limit(1);

  if (result && result.used_by_user_id == null) {
    return result as unknown as Invite;
  }
  return null;
}

export async function findInvitesByCreator(db: D1Database, creatorId: string): Promise<Invite[]> {
  const drizzledb = drizzle(db);
  const results = await drizzledb.select().from(invitesTable).where(eq(invitesTable.creator_id, creatorId));
  return results as unknown as Invite[];
}

export async function markInviteUsed(db: D1Database, code: string, userId: string): Promise<void> {
  if (!code || ADMIN_CODES.includes(code.toUpperCase())) return;
  const drizzledb = drizzle(db);
  await drizzledb.update(invitesTable)
    .set({ used_by_user_id: userId })
    .where(eq(invitesTable.code, code));
}

// ★警告が出ていた関数を明示的にエクスポート
export async function createInvites(db: D1Database, userId: string, count: number = 5): Promise<void> {
  const drizzledb = drizzle(db);
  const values = Array.from({ length: count }, () => ({
    code: generateInviteCode(),
    creator_id: userId,
    created_at: Math.floor(Date.now() / 1000),
  }));
  await drizzledb.insert(invitesTable).values(values);
}

export async function createOneInvite(db: D1Database, creatorId: string, _email?: string): Promise<string> {
  const code = generateInviteCode();
  const drizzledb = drizzle(db);
  await drizzledb.insert(invitesTable).values({
    code,
    creator_id: creatorId ?? 'system',
    created_at: Math.floor(Date.now() / 1000),
  });
  return code;
}
