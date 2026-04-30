# Prediction Market UI - Implementation Guide

## Overview
This guide documents the complete UI/UX redesign for prediction market token discovery and selection, implemented in three phases.

---

## Phase 1: Basic UI Improvements ✅
**Completed**: Initial card design, probability visualization, one-click add, sorting, and category inference.

### Components
- **PredictionMarketCard**: Enhanced card with category icons, volume display, probability bar, and one-click add button
- **ProbabilityBar**: Visual YES/NO probability bar with 24h trend indicators

### Features
- Category inference from market questions (Politics, Sports, Crypto, etc.)
- Visual probability bars (YES: green, NO: red)
- One-click [+ Add] button
- Extended sorting options (Close Race, Ending Soon, Recently Added)

---

## Phase 2: Filter Functionality ✅
**Completed**: Advanced filtering and responsive design.

### New Components

#### 1. ProbabilitySlider
Range slider for filtering markets by probability.

```tsx
import { ProbabilitySlider } from '@/components/discover';

const [range, setRange] = useState<[number, number]>([0, 100]);

<ProbabilitySlider value={range} onChange={setRange} />
```

**Features**:
- Range: 0-100%
- Preset buttons: All, Close (45-55%), Likely (>70%), Unlikely (<30%)
- Real-time filtering

#### 2. DateFilter
Dropdown for filtering by end date.

```tsx
import { DateFilter, DateFilterValue } from '@/components/discover';

const [dateFilter, setDateFilter] = useState<DateFilterValue>('any-time');

<DateFilter value={dateFilter} onChange={setDateFilter} />
```

**Options**:
- any-time
- next-24h
- this-week
- this-month
- custom (reserved for future)

#### 3. SortDropdown
UI component for sorting markets.

```tsx
import { SortDropdown, SortOption } from '@/components/discover';

const [sort, setSort] = useState<SortOption>('volume');

<SortDropdown value={sort} onChange={setSort} />
```

**Options**:
- volume (High → Low)
- close-race (45-55%)
- ending-soon
- recently-added

### Responsive Design
Optimized layouts for:
- **Mobile** (<768px): Compact, stacked filters
- **Tablet** (768-1024px): 2-column grid
- **Desktop** (>1024px): 3-4 column grid

---

## Phase 3: Discovery Features ✅
**Completed**: Search suggestions, bulk selection, and category filtering.

### New Components

#### 1. SearchBarWithSuggest
Enhanced search bar with trending markets and recent history.

```tsx
import { SearchBarWithSuggest } from '@/components/discover';

const [query, setQuery] = useState('');

<SearchBarWithSuggest
  value={query}
  onChange={setQuery}
  trendingMarkets={topMarkets}
  allMarkets={markets}
  onSelectMarket={(group) => {
    // Handle market selection
  }}
/>
```

**Features**:
- Trending markets (top 5 by volume)
- Recent search history (localStorage, max 5)
- Keyboard navigation (↑↓ arrow keys, Enter to select)
- Search result count display

#### 2. BulkSelectMode
Bulk selection interface for adding multiple markets at once.

```tsx
import { BulkSelectMode } from '@/components/discover';

const [bulkMode, setBulkMode] = useState(false);

{bulkMode && (
  <BulkSelectMode
    markets={filteredMarkets}
    onAddBulk={(selections) => {
      selections.forEach(({ group, side }) => {
        addMarketToETF(group, side);
      });
      setBulkMode(false);
    }}
    onCancel={() => setBulkMode(false)}
    alreadySelected={selectedTokenIds}
  />
)}
```

**Features**:
- Select All / Deselect All
- Individual checkboxes per market
- Counter: "3 Selected"
- [Add to ETF] batch button

#### 3. CategoryFilter
Multi-select filter for market categories.

```tsx
import { CategoryFilter, Category } from '@/components/discover';

const [categories, setCategories] = useState<Set<Category>>(
  new Set(['politics', 'sports', 'crypto'])
);

<CategoryFilter
  selected={categories}
  onChange={setCategories}
  counts={{
    politics: 15,
    sports: 23,
    crypto: 12,
    entertainment: 8,
    'world-events': 10,
    other: 5,
  }}
/>
```

**Categories**:
- 🏛️ Politics
- ⚽ Sports
- ₿ Crypto
- 🎬 Entertainment
- 🌍 World Events
- 📌 Other

**Features**:
- Checkbox multi-select
- Count display (e.g., "Sports (23)")
- Select All / Deselect All button

---

## Integration Example

Here's how all components work together in Builder.tsx:

```tsx
import {
  ProbabilitySlider,
  DateFilter,
  SortDropdown,
  SearchBarWithSuggest,
  BulkSelectMode,
  CategoryFilter,
} from '@/components/discover';

function PredictionMarketBuilder() {
  // Phase 2: Filters
  const [probabilityRange, setProbabilityRange] = useState<[number, number]>([0, 100]);
  const [dateFilter, setDateFilter] = useState<DateFilterValue>('any-time');
  const [sortOption, setSortOption] = useState<SortOption>('volume');
  
  // Phase 3: Discovery
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<Category>>(
    new Set(['politics', 'sports', 'crypto', 'entertainment', 'world-events', 'other'])
  );
  const [bulkMode, setBulkMode] = useState(false);
  
  // Apply filters
  const filteredMarkets = markets
    .filter(m => {
      const yesPrice = m.yesToken?.price ?? 0.5;
      return yesPrice * 100 >= probabilityRange[0] && yesPrice * 100 <= probabilityRange[1];
    })
    .filter(m => {
      const category = inferCategory(m.question);
      return selectedCategories.has(category);
    })
    .filter(m => {
      // Date filter logic
      if (dateFilter === 'any-time') return true;
      // ... implement date filtering
    })
    .sort((a, b) => {
      // Sort logic based on sortOption
    });

  return (
    <div>
      <SearchBarWithSuggest
        value={searchQuery}
        onChange={setSearchQuery}
        trendingMarkets={getTrendingMarkets()}
        allMarkets={markets}
      />
      
      <div className="filters">
        <SortDropdown value={sortOption} onChange={setSortOption} />
        <DateFilter value={dateFilter} onChange={setDateFilter} />
        <ProbabilitySlider value={probabilityRange} onChange={setProbabilityRange} />
        <CategoryFilter selected={selectedCategories} onChange={setSelectedCategories} />
      </div>
      
      <button onClick={() => setBulkMode(!bulkMode)}>
        {bulkMode ? 'Exit Bulk Mode' : 'Bulk Select'}
      </button>
      
      {bulkMode ? (
        <BulkSelectMode
          markets={filteredMarkets}
          onAddBulk={handleBulkAdd}
          onCancel={() => setBulkMode(false)}
          alreadySelected={selectedIds}
        />
      ) : (
        <div className="market-grid">
          {filteredMarkets.map(group => (
            <PredictionMarketCard
              key={group.marketId}
              group={group}
              onAddClick={handleAddMarket}
              selectedSide={getSelectedSide(group)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Technical Stack

- **React + TypeScript**: Type-safe component development
- **CSS Modules**: Scoped styling with responsive design
- **rc-slider**: Probability range slider
- **sonner**: Toast notifications (from Phase 1)
- **LocalStorage**: Recent search history persistence

---

## Testing Checklist

- [x] PredictionMarketCard displays correctly
- [x] Probability bar shows YES/NO with correct colors
- [x] One-click add button works
- [x] Probability slider filters markets
- [x] Date filter dropdown works
- [x] Sort dropdown changes order
- [x] Search suggestions appear on focus
- [x] Recent history persists across sessions
- [x] Bulk select mode allows multiple selections
- [x] Category filter toggles work
- [x] Responsive design on mobile/tablet/desktop

---

## Performance Considerations

1. **Virtualization**: Use `@tanstack/react-virtual` for large market lists
2. **Memoization**: Wrap expensive filter/sort operations with `useMemo`
3. **Debouncing**: Debounce search input for better performance
4. **Lazy Loading**: Load market data incrementally if needed

---

## Future Enhancements (Optional)

1. **Custom Date Range**: Implement date picker for custom range filtering
2. **Advanced Search**: Add filters for specific tokens, volume thresholds
3. **Saved Filters**: Allow users to save filter presets
4. **Market Analytics**: Show trending categories, popular markets
5. **Notifications**: Alert users when markets matching criteria become available

---

## Maintenance Notes

- Update `categoryInference.ts` when adding new market types
- Monitor LocalStorage usage (currently < 1KB per user)
- Keep filter state in URL params for shareable links (future)
- Review and update trending markets algorithm periodically

---

## Credits

**Engineer A** - Complete UI/UX implementation (Phase 1-3)  
**Implementation Time**: 8-10 hours  
**Branch**: `feat/engineer-a-prediction-market-ui-phase1`  
**PR**: #83
