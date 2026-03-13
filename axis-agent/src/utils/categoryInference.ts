/**
 * categoryInference.ts
 * Frontend-based category inference for prediction market tokens
 * Uses simple keyword matching to categorize markets
 * Expected accuracy: 50-70% (initial implementation)
 */

export type PredictionCategory = 
  | 'Politics'
  | 'Sports'
  | 'Crypto'
  | 'Entertainment'
  | 'World Events'
  | 'Other';

/**
 * Infer category from market title/question using keyword matching
 */
export function inferCategory(title: string): PredictionCategory {
  const lower = title.toLowerCase();
  
  // Politics
  if (/election|president|biden|trump|politics|vote|congress|senate|governor|democrat|republican|parliamentary|minister/i.test(lower)) {
    return 'Politics';
  }
  
  // Sports
  if (/nba|lakers|nfl|soccer|football|sports|basketball|tennis|golf|baseball|cricket|rugby|championship|playoffs|super bowl|world cup|olympics/i.test(lower)) {
    return 'Sports';
  }
  
  // Crypto
  if (/bitcoin|btc|eth|ethereum|crypto|solana|sol|token|defi|nft|blockchain|web3|dao|airdrop/i.test(lower)) {
    return 'Crypto';
  }
  
  // Entertainment
  if (/movie|oscar|grammy|emmy|entertainment|film|album|box office|celebrity|music|actor|singer|award/i.test(lower)) {
    return 'Entertainment';
  }
  
  // World Events
  if (/war|climate|economy|world|global|gdp|inflation|recession|market crash|pandemic|disaster|treaty|conflict/i.test(lower)) {
    return 'World Events';
  }
  
  return 'Other';
}

/**
 * Get emoji icon for a category
 */
export function getCategoryIcon(category: PredictionCategory): string {
  const icons: Record<PredictionCategory, string> = {
    'Politics': '🗳️',
    'Sports': '🏀',
    'Crypto': '💰',
    'Entertainment': '🎬',
    'World Events': '🌍',
    'Other': '📊',
  };
  return icons[category];
}

/**
 * Get color for a category (CSS variable)
 */
export function getCategoryColor(category: PredictionCategory): string {
  const colors: Record<PredictionCategory, string> = {
    'Politics': 'var(--category-politics, #6366F1)',
    'Sports': 'var(--category-sports, #F59E0B)',
    'Crypto': 'var(--category-crypto, #8B5CF6)',
    'Entertainment': 'var(--category-entertainment, #EC4899)',
    'World Events': 'var(--category-world, #14B8A6)',
    'Other': 'var(--gray-600, #4B5563)',
  };
  return colors[category];
}
