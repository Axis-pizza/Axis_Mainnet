/**
 * Discover Components - Phase 2 & Phase 3
 * 
 * Phase 2: Filters and Sort
 * - ProbabilitySlider: Range slider for filtering by probability (0-100%)
 * - DateFilter: Dropdown for filtering by end date
 * - SortDropdown: Dropdown for sorting markets
 * 
 * Phase 3: Discovery Features
 * - SearchBarWithSuggest: Search bar with trending and recent history suggestions
 * - BulkSelectMode: Bulk selection interface for adding multiple markets
 * - CategoryFilter: Multi-select filter for market categories
 */

export { ProbabilitySlider } from './ProbabilitySlider';
export { DateFilter } from './DateFilter';
export type { DateFilterValue } from './DateFilter';
export { SortDropdown } from './SortDropdown';
export type { SortOption } from './SortDropdown';
export { SearchBarWithSuggest } from './SearchBarWithSuggest';
export { BulkSelectMode } from './BulkSelectMode';
export { CategoryFilter } from './CategoryFilter';
export type { Category } from './CategoryFilter';
export { PredictionMarketCard } from './PredictionMarketCard';
export type { PredictionGroup, PredictionMarketCardProps } from './PredictionMarketCard';
export { ProbabilityBar } from './ProbabilityBar';
