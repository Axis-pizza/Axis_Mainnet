import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Clock, TrendingUp, X } from 'lucide-react';
import type { PredictionGroup } from '../create/manual/PredictionEventCard';
import styles from './SearchBarWithSuggest.module.css';

interface SearchBarWithSuggestProps {
  value: string;
  onChange: (value: string) => void;
  onSelectMarket?: (group: PredictionGroup) => void;
  trendingMarkets?: PredictionGroup[];
  allMarkets?: PredictionGroup[];
}

const RECENT_HISTORY_KEY = 'axis_recent_prediction_searches';
const MAX_RECENT = 5;

export const SearchBarWithSuggest: React.FC<SearchBarWithSuggestProps> = ({
  value,
  onChange,
  onSelectMarket,
  trendingMarkets = [],
  allMarkets = [],
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [recentHistory, setRecentHistory] = useState<PredictionGroup[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestRef = useRef<HTMLDivElement>(null);

  // Load recent history from LocalStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_HISTORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setRecentHistory(parsed.slice(0, MAX_RECENT));
      }
    } catch (e) {
      console.error('Failed to load recent history', e);
    }
  }, []);

  // Save to recent history
  const saveToHistory = useCallback((group: PredictionGroup) => {
    try {
      const stored = localStorage.getItem(RECENT_HISTORY_KEY);
      let history: PredictionGroup[] = stored ? JSON.parse(stored) : [];
      
      // Remove duplicates
      history = history.filter(h => h.marketId !== group.marketId);
      
      // Add to front
      history.unshift(group);
      
      // Limit to MAX_RECENT
      history = history.slice(0, MAX_RECENT);
      
      localStorage.setItem(RECENT_HISTORY_KEY, JSON.stringify(history));
      setRecentHistory(history);
    } catch (e) {
      console.error('Failed to save to history', e);
    }
  }, []);

  const clearHistory = useCallback(() => {
    try {
      localStorage.removeItem(RECENT_HISTORY_KEY);
      setRecentHistory([]);
    } catch (e) {
      console.error('Failed to clear history', e);
    }
  }, []);

  // Filter results based on search query
  const searchResults = value.trim()
    ? allMarkets.filter(m =>
        (m.marketQuestion || m.eventTitle || '').toLowerCase().includes(value.toLowerCase())
      ).slice(0, 5)
    : [];

  const showSuggestions = isFocused && (value.trim() || trendingMarkets.length > 0 || recentHistory.length > 0);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showSuggestions) return;

      const totalItems = value.trim()
        ? searchResults.length
        : trendingMarkets.length + recentHistory.length;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < totalItems - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        
        if (value.trim()) {
          const selected = searchResults[selectedIndex];
          if (selected) {
            handleSelectMarket(selected);
          }
        } else {
          const allSuggestions = [...trendingMarkets, ...recentHistory];
          const selected = allSuggestions[selectedIndex];
          if (selected) {
            handleSelectMarket(selected);
          }
        }
      } else if (e.key === 'Escape') {
        setIsFocused(false);
        inputRef.current?.blur();
      }
    },
    [showSuggestions, value, searchResults, trendingMarkets, recentHistory, selectedIndex]
  );

  const handleSelectMarket = useCallback(
    (group: PredictionGroup) => {
      saveToHistory(group);
      onChange(group.marketQuestion || group.eventTitle || '');
      setIsFocused(false);
      if (onSelectMarket) {
        onSelectMarket(group);
      }
    },
    [saveToHistory, onChange, onSelectMarket]
  );

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestRef.current &&
        !suggestRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.searchBox}>
        <Search className={styles.searchIcon} size={18} />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search markets..."
          className={styles.input}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className={styles.clearButton}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {showSuggestions && (
        <div ref={suggestRef} className={styles.suggestions}>
          {value.trim() ? (
            <>
              {searchResults.length > 0 ? (
                <>
                  <div className={styles.resultCount}>
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{value}"
                  </div>
                  {searchResults.map((group, idx) => (
                    <button
                      key={group.marketId}
                      className={`${styles.suggestion} ${selectedIndex === idx ? styles.selected : ''}`}
                      onClick={() => handleSelectMarket(group)}
                    >
                      <div className={styles.suggestionNumber}>{idx + 1}.</div>
                      <div className={styles.suggestionText}>{group.marketQuestion || group.eventTitle}</div>
                    </button>
                  ))}
                </>
              ) : (
                <div className={styles.noResults}>No results found</div>
              )}
            </>
          ) : (
            <>
              {trendingMarkets.length > 0 && (
                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <TrendingUp size={14} />
                    <span>Trending</span>
                  </div>
                  {trendingMarkets.slice(0, 5).map((group, idx) => (
                    <button
                      key={group.marketId}
                      className={`${styles.suggestion} ${selectedIndex === idx ? styles.selected : ''}`}
                      onClick={() => handleSelectMarket(group)}
                    >
                      <div className={styles.suggestionText}>{group.marketQuestion || group.eventTitle}</div>
                    </button>
                  ))}
                </div>
              )}

              {recentHistory.length > 0 && (
                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <Clock size={14} />
                    <span>Recent</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        clearHistory();
                      }}
                      className={styles.clearHistory}
                    >
                      Clear
                    </button>
                  </div>
                  {recentHistory.map((group, idx) => {
                    const adjustedIdx = idx + trendingMarkets.length;
                    return (
                      <button
                        key={group.marketId}
                        className={`${styles.suggestion} ${selectedIndex === adjustedIdx ? styles.selected : ''}`}
                        onClick={() => handleSelectMarket(group)}
                      >
                        <div className={styles.suggestionText}>{group.marketQuestion || group.eventTitle}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
