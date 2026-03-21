import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FAVORITES_KEY = 'axis_favorite_tokens';
const HISTORY_KEY = 'axis_search_history';
const VERIFIED_KEY = 'axis_verified_only';
const MAX_FAVORITES = 50;
const MAX_HISTORY = 10;

export interface SearchHistoryItem {
  address: string;
  symbol: string;
  logoURI: string;
}

export function useTokenPreferences() {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(false);

  // Load from AsyncStorage on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [favRaw, histRaw, verifiedRaw] = await Promise.all([
          AsyncStorage.getItem(FAVORITES_KEY),
          AsyncStorage.getItem(HISTORY_KEY),
          AsyncStorage.getItem(VERIFIED_KEY),
        ]);
        if (favRaw) setFavorites(new Set(JSON.parse(favRaw) as string[]));
        if (histRaw) setSearchHistory(JSON.parse(histRaw) as SearchHistoryItem[]);
        if (verifiedRaw) setVerifiedOnly(verifiedRaw === 'true');
      } catch {}
    };
    load();
  }, []);

  // Persist favorites
  useEffect(() => {
    AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites))).catch(() => {});
  }, [favorites]);

  // Persist history
  useEffect(() => {
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(searchHistory)).catch(() => {});
  }, [searchHistory]);

  // Persist verified toggle
  useEffect(() => {
    AsyncStorage.setItem(VERIFIED_KEY, String(verifiedOnly)).catch(() => {});
  }, [verifiedOnly]);

  const toggleFavorite = useCallback((address: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(address)) {
        next.delete(address);
      } else if (next.size < MAX_FAVORITES) {
        next.add(address);
      }
      return next;
    });
  }, []);

  const isFavorite = useCallback((address: string) => favorites.has(address), [favorites]);

  const addToSearchHistory = useCallback((item: SearchHistoryItem) => {
    setSearchHistory((prev) => {
      const filtered = prev.filter((h) => h.address !== item.address);
      return [item, ...filtered].slice(0, MAX_HISTORY);
    });
  }, []);

  const clearSearchHistory = useCallback(() => {
    setSearchHistory([]);
  }, []);

  return {
    favorites,
    toggleFavorite,
    isFavorite,
    searchHistory,
    addToSearchHistory,
    clearSearchHistory,
    verifiedOnly,
    setVerifiedOnly,
  };
}

export type TokenPreferences = ReturnType<typeof useTokenPreferences>;
