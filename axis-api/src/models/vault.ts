import { drizzle } from "drizzle-orm/d1";
import { desc } from "drizzle-orm";
import { vaultsTable } from "../db/schema";

// Re-export for drizzle-kit (schema: 'src/models' configuration)
export { vaultsTable };

export interface Vault {
  id: string;
  name: string;
  symbol: string;
  description: string;
  creator: string;
  strategy_type: string;
  management_fee: number;
  min_liquidity: number;
  composition: any; // Stored as string in DB, parsed to object
  image_url?: string;
  created_at?: string;
}

export async function getAllVaults(db: D1Database): Promise<Vault[]> {
  const drizzledb = drizzle(db);
  const results = await drizzledb.select().from(vaultsTable).orderBy(desc(vaultsTable.created_at));

  return results.map((v: any) => ({
    ...v,
    composition: v.composition ? JSON.parse(v.composition) : []
  })) as Vault[];
}

export async function createVault(db: D1Database, vault: Omit<Vault, 'created_at'>): Promise<void> {
  const drizzledb = drizzle(db);
  await drizzledb.insert(vaultsTable).values({
    id: vault.id,
    name: vault.name,
    symbol: vault.symbol,
    description: vault.description,
    creator: vault.creator,
    strategy_type: vault.strategy_type,
    management_fee: vault.management_fee,
    min_liquidity: vault.min_liquidity,
    composition: JSON.stringify(vault.composition),
    image_url: vault.image_url || null,
  });
}
