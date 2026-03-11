/**
 * ManualBuilder — Full port of axis-agent MobileBuilder
 * Token selection with rich weight controls, tabs, portfolio preview
 */
import React, { useState, useCallback, useRef, memo, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  Modal,
  Image,
  ActivityIndicator,
  ScrollView,
  Platform,
  StyleSheet,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Search,
  ArrowLeft,
  ChevronRight,
  Check,
  AlertCircle,
  Percent,
  X,
  Sparkles,
  Plus,
  ClipboardPaste,
  Minus,
  Copy,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useManualDashboard } from '../../hooks/useManualDashboard';
import { WeightControl } from '../../components/create/manual/WeightControl';
import { TabSelector } from '../../components/create/manual/TabSelector';
import { formatCompactUSD, abbreviateAddress } from '../../utils/formatNumber';
import { colors, gold } from '../../config/theme';
import type { JupiterToken } from '../../services/jupiter';
import type { AssetItem } from '../../components/create/manual/types';

interface TokenAlloc {
  symbol: string;
  address: string;
  weight: number;
  logoURI?: string;
}

interface Props {
  onComplete: (tokens: TokenAlloc[]) => void;
  onBack?: () => void;
}

// ─── Token Image ──────────────────────────────────────────────────────────────
const TokenImg = ({ uri, size = 36 }: { uri?: string; size?: number }) => {
  const [err, setErr] = useState(false);
  if (uri && !err) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
      }}
    />
  );
};

// ─── Token Detail Modal ────────────────────────────────────────────────────────
const TokenDetailModal = memo(
  ({
    token,
    isSelected,
    onAdd,
    onClose,
  }: {
    token: JupiterToken;
    isSelected: boolean;
    onAdd: () => void;
    onClose: () => void;
  }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = useCallback(async () => {
      await Clipboard.setStringAsync(token.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }, [token.address]);

    const stats = [
      { label: 'Market Cap', value: formatCompactUSD(token.marketCap) },
      { label: '24h Volume', value: formatCompactUSD(token.dailyVolume) },
      ...(token.price != null
        ? [
            {
              label: 'Price',
              value: `$${
                token.price < 0.01
                  ? token.price.toFixed(6)
                  : token.price.toLocaleString()
              }`,
            },
          ]
        : []),
    ];

    return (
      <Modal
        visible
        transparent
        animationType="slide"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <View style={styles.modalSheet}>
            {/* drag handle */}
            <View style={styles.dragHandle} />

            {/* header */}
            <View style={styles.detailHeader}>
              <TokenImg uri={token.logoURI} size={56} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.detailSymbol}>{token.symbol}</Text>
                  {token.isVerified && (
                    <View style={styles.verifiedBadge}>
                      <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                  )}
                  {token.tags?.includes('meme') && (
                    <Sparkles size={13} color="#f472b6" />
                  )}
                </View>
                <Text style={styles.detailName} numberOfLines={1}>
                  {token.name}
                </Text>
              </View>
              {isSelected && (
                <View style={styles.addedBadge}>
                  <Check size={12} color={gold[400]} />
                  <Text style={[styles.addedBadgeText, { color: gold[400] }]}>Added</Text>
                </View>
              )}
            </View>

            {/* CA row */}
            <Pressable style={styles.caRow} onPress={handleCopy}>
              <View style={{ flex: 1 }}>
                <Text style={styles.caLabel}>Contract Address</Text>
                <Text style={styles.caAddress} numberOfLines={1}>
                  {token.address}
                </Text>
              </View>
              {copied ? (
                <Check size={14} color="#4ade80" />
              ) : (
                <Copy size={14} color="rgba(255,255,255,0.25)" />
              )}
            </Pressable>

            {/* stats grid */}
            <View style={styles.statsGrid}>
              {stats.map(({ label, value }) => (
                <View key={label} style={styles.statCell}>
                  <Text style={styles.statLabel}>{label}</Text>
                  <Text style={styles.statValue}>{value ?? '—'}</Text>
                </View>
              ))}
            </View>

            {/* add button */}
            {!isSelected && (
              <Pressable
                onPress={() => {
                  onAdd();
                  onClose();
                }}
                style={{ borderRadius: 16, overflow: 'hidden', marginTop: 8 }}
              >
                <LinearGradient
                  colors={['#6B4420', '#B8863F', '#E8C890']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.addButton}
                >
                  <Text style={styles.addButtonText}>Add to ETF</Text>
                </LinearGradient>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>
    );
  }
);

// ─── Token List Item ───────────────────────────────────────────────────────────
const TokenListItem = memo(
  function TokenListItem({
    token,
    isSelected,
    onAdd,
    onDetail,
  }: {
    token: JupiterToken;
    isSelected: boolean;
    onAdd: () => void;
    onDetail: () => void;
  }) {
    return (
      <Pressable
        onPress={onDetail}
        style={[
          styles.tokenRow,
          isSelected && styles.tokenRowSelected,
        ]}
      >
        {/* logo + verified */}
        <View style={{ position: 'relative' }}>
          <TokenImg uri={token.logoURI} size={36} />
          {token.isVerified && (
            <View style={styles.verifiedDot}>
              <Check size={8} color="#fff" />
            </View>
          )}
        </View>

        {/* name */}
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text
              style={[
                styles.tokenSymbol,
                isSelected && { color: gold[400] },
              ]}
            >
              {token.symbol}
            </Text>
            {token.tags?.includes('meme') && (
              <Sparkles size={9} color="#f472b6" />
            )}
          </View>
          <Text style={styles.tokenName} numberOfLines={1}>
            {token.name}
          </Text>
        </View>

        {/* MC */}
        <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
          <Text style={styles.mcLabel}>MC</Text>
          <Text style={styles.mcValue}>{formatCompactUSD(token.marketCap)}</Text>
        </View>

        {/* add/check */}
        <View
          style={[
            styles.addIcon,
            isSelected && { backgroundColor: gold[400] },
          ]}
        >
          {isSelected ? (
            <Check size={13} color="#000" />
          ) : (
            <Plus size={13} color="rgba(255,255,255,0.4)" />
          )}
        </View>
      </Pressable>
    );
  },
  (prev, next) =>
    prev.token.address === next.token.address && prev.isSelected === next.isSelected
);

// ─── Asset Card ────────────────────────────────────────────────────────────────
const AssetCard = memo(
  ({
    item,
    totalWeight,
    onUpdateWeight,
    onRemove,
  }: {
    item: AssetItem;
    totalWeight: number;
    onUpdateWeight: (address: string, val: number) => void;
    onRemove: (address: string) => void;
  }) => (
    <View style={styles.assetCard}>
      <View style={styles.assetCardBg} />
      <View style={{ padding: 20 }}>
        {/* token header */}
        <View style={styles.assetHeader}>
          <TokenImg uri={item.token.logoURI} size={56} />
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={styles.assetSymbol}>{item.token.symbol}</Text>
            <Text style={styles.assetName} numberOfLines={1}>
              {item.token.name}
            </Text>
          </View>
          <Pressable
            onPress={() => onRemove(item.token.address)}
            hitSlop={8}
            style={styles.removeBtn}
          >
            <X size={22} color="rgba(255,255,255,0.35)" />
          </Pressable>
        </View>

        {/* weight control */}
        <WeightControl
          value={item.weight}
          onChange={(val) => onUpdateWeight(item.token.address, val)}
          totalWeight={totalWeight}
        />
      </View>
    </View>
  )
);

// ─── ManualBuilder ─────────────────────────────────────────────────────────────
export function ManualBuilder({ onComplete, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [selectedDetailToken, setSelectedDetailToken] = useState<JupiterToken | null>(null);

  const dashboard = useManualDashboard({
    onDeploySuccess: () => {},
    initialConfig: undefined,
    initialTokens: undefined,
  });

  const {
    portfolio,
    searchQuery,
    setSearchQuery,
    isLoading,
    isSearching,
    totalWeight,
    selectedIds,
    isValidAllocation,
    sortedVisibleTokens,
    removeToken,
    updateWeight,
    distributeEvenly,
    triggerHaptic,
    activeTab,
    setActiveTab,
    addTokenDirect,
  } = dashboard;

  // Open selector automatically when empty
  useEffect(() => {
    if (portfolio.length === 0 && !isSelectorOpen) setIsSelectorOpen(true);
  }, []);

  const handleNextStep = useCallback(() => {
    triggerHaptic();
    onComplete(
      portfolio.map((p) => ({
        symbol: p.token.symbol,
        address: p.token.address,
        weight: p.weight,
        logoURI: p.token.logoURI,
      }))
    );
  }, [portfolio, onComplete, triggerHaptic]);

  const handleTokenSelect = useCallback(
    (token: JupiterToken) => {
      addTokenDirect(token);
      triggerHaptic();
    },
    [addTokenDirect, triggerHaptic]
  );

  const handlePasteCA = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text && text.trim().length >= 32) setSearchQuery(text.trim());
    } catch {
      /* clipboard denied */
    }
  }, [setSearchQuery]);

  const renderToken = useCallback(
    ({ item }: { item: JupiterToken }) => {
      const isSelected = selectedIds.has(item.address);
      return (
        <TokenListItem
          token={item}
          isSelected={isSelected}
          onAdd={() => handleTokenSelect(item)}
          onDetail={() => setSelectedDetailToken(item)}
        />
      );
    },
    [selectedIds, handleTokenSelect]
  );

  return (
    <View style={[styles.container, { backgroundColor: '#030303' }]}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8 },
        ]}
      >
        <Pressable onPress={onBack} hitSlop={8} style={styles.headerBtn}>
          <ArrowLeft size={20} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => setIsSelectorOpen(true)}
          style={[styles.headerBtn, { backgroundColor: `${gold[400]}22` }]}
        >
          <Plus size={20} color={gold[400]} />
        </Pressable>
      </View>

      {/* ── Scrollable portfolio ────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats header */}
        <View style={styles.statsHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <View
              style={[
                styles.weightGauge,
                totalWeight === 100
                  ? styles.gaugeComplete
                  : totalWeight > 100
                  ? styles.gaugeOver
                  : styles.gaugePending,
              ]}
            >
              <Text
                style={[
                  styles.weightNumber,
                  {
                    color:
                      totalWeight === 100
                        ? '#4ade80'
                        : totalWeight > 100
                        ? '#f87171'
                        : gold[400],
                  },
                ]}
              >
                {totalWeight}
              </Text>
              <Text style={styles.weightPct}>%</Text>
            </View>
            <View>
              <Text style={styles.allocationLabel}>Allocation</Text>
              {totalWeight === 100 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Check size={14} color="#4ade80" />
                  <Text style={{ color: '#4ade80', fontSize: 13 }}>Ready</Text>
                </View>
              ) : totalWeight > 100 ? (
                <Text style={{ color: '#f87171', fontSize: 13, marginTop: 2 }}>Over limit</Text>
              ) : (
                <Text style={{ color: `${gold[400]}99`, fontSize: 13, marginTop: 2 }}>
                  {100 - totalWeight}% remaining
                </Text>
              )}
            </View>
          </View>

          <View style={{ alignItems: 'flex-end', gap: 8 }}>
            {portfolio.length >= 2 && (
              <Pressable onPress={distributeEvenly} style={styles.equalBtn}>
                <Percent size={12} color="rgba(255,255,255,0.7)" />
                <Text style={styles.equalBtnText}>Equal</Text>
              </Pressable>
            )}
            <Text style={styles.assetCount}>
              {portfolio.length} Asset{portfolio.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {/* Over-limit warning */}
        {totalWeight > 100 && (
          <View style={styles.errorBanner}>
            <AlertCircle size={16} color="#f87171" />
            <Text style={styles.errorBannerText}>Allocation exceeds 100%</Text>
          </View>
        )}

        {/* Portfolio list */}
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          {portfolio.map((item) => (
            <AssetCard
              key={item.token.address}
              item={item}
              totalWeight={totalWeight}
              onUpdateWeight={updateWeight}
              onRemove={removeToken}
            />
          ))}
        </View>

        {/* Empty add button */}
        <Pressable
          onPress={() => setIsSelectorOpen(true)}
          style={styles.addAssetBtn}
        >
          <View style={styles.addAssetIcon}>
            <Plus size={24} color="rgba(255,255,255,0.3)" />
          </View>
          <Text style={styles.addAssetText}>Tap to add asset</Text>
        </Pressable>
      </ScrollView>

      {/* ── Next Step FAB ───────────────────────────────────────────── */}
      {isValidAllocation && !isSelectorOpen && (
        <View
          style={[
            styles.fabContainer,
            { paddingBottom: insets.bottom + 16 },
          ]}
        >
          <Pressable onPress={handleNextStep} style={{ borderRadius: 999, overflow: 'hidden' }}>
            <LinearGradient
              colors={['#6B4420', '#B8863F', '#E8C890']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.nextBtn}
            >
              <Text style={styles.nextBtnText}>Next Step</Text>
              <ChevronRight size={20} color="#000" />
            </LinearGradient>
          </Pressable>
        </View>
      )}

      {/* ── Token Selector Modal ─────────────────────────────────────── */}
      <Modal
        visible={isSelectorOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsSelectorOpen(false)}
        statusBarTranslucent
      >
        <View style={[styles.selectorContainer, { paddingTop: insets.top }]}>
          <Pressable
            style={styles.selectorBackdrop}
            onPress={() => setIsSelectorOpen(false)}
          />

          <View style={styles.selectorSheet}>
            {/* Search bar */}
            <View style={styles.selectorHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <View style={styles.searchBox}>
                  <Search size={18} color="rgba(255,255,255,0.3)" />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search name or address"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    autoFocus={Platform.OS !== 'web'}
                    style={styles.searchInput}
                  />
                  {searchQuery ? (
                    <Pressable
                      onPress={() => setSearchQuery('')}
                      hitSlop={8}
                      style={styles.searchClearBtn}
                    >
                      <X size={14} color="rgba(255,255,255,0.5)" />
                    </Pressable>
                  ) : (
                    <Pressable onPress={handlePasteCA} hitSlop={8} style={styles.pasteBtn}>
                      <ClipboardPaste size={14} color="rgba(255,255,255,0.4)" />
                    </Pressable>
                  )}
                </View>
                <Pressable
                  onPress={() => setIsSelectorOpen(false)}
                  style={styles.selectorCloseBtn}
                >
                  <X size={20} color="rgba(255,255,255,0.7)" />
                </Pressable>
              </View>

              <TabSelector activeTab={activeTab} setActiveTab={setActiveTab} />
            </View>

            {/* Token list */}
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={gold[400]} />
                <Text style={styles.loadingText}>Loading tokens...</Text>
              </View>
            ) : isSearching ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={gold[400]} />
              </View>
            ) : sortedVisibleTokens.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Search size={32} color="rgba(255,255,255,0.2)" />
                <Text style={styles.emptyText}>No tokens found</Text>
              </View>
            ) : (
              <FlatList
                data={sortedVisibleTokens}
                keyExtractor={(item) => item.address}
                renderItem={renderToken}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 4, paddingBottom: insets.bottom + 20 }}
                keyboardShouldPersistTaps="handled"
                removeClippedSubviews
                maxToRenderPerBatch={20}
                windowSize={10}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── Token Detail Modal ───────────────────────────────────────── */}
      {selectedDetailToken && (
        <TokenDetailModal
          token={selectedDetailToken}
          isSelected={selectedIds.has(selectedDetailToken.address)}
          onAdd={() => handleTokenSelect(selectedDetailToken)}
          onClose={() => setSelectedDetailToken(null)}
        />
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(3,3,3,0.95)',
    zIndex: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  weightGauge: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gaugeComplete: {
    backgroundColor: 'rgba(74,222,128,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.3)',
  },
  gaugeOver: {
    backgroundColor: 'rgba(248,113,113,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.3)',
  },
  gaugePending: {
    backgroundColor: 'rgba(199,125,54,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(199,125,54,0.2)',
  },
  weightNumber: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  weightPct: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginTop: -2,
  },
  allocationLabel: {
    fontSize: 10,
    color: 'rgba(199,125,54,0.7)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  equalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  equalBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.7)',
  },
  assetCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  errorBannerText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '500',
  },
  // Asset card
  assetCard: {
    position: 'relative',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(199,125,54,0.15)',
  },
  assetCardBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111',
    opacity: 0.97,
  },
  assetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  assetSymbol: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  assetName: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    marginTop: 2,
  },
  removeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  // Add asset empty button
  addAssetBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.01)',
  },
  addAssetIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAssetText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    fontWeight: '500',
  },
  // Next step FAB
  fabContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 999,
    gap: 6,
  },
  nextBtnText: {
    color: '#000',
    fontSize: 17,
    fontWeight: 'bold',
  },
  // Token selector modal
  selectorContainer: {
    flex: 1,
  },
  selectorBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  selectorSheet: {
    flex: 1,
    backgroundColor: '#121212',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: 60,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  selectorHeader: {
    backgroundColor: '#121212',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    padding: 0,
  },
  searchClearBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  pasteBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  selectorCloseBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 13,
  },
  // Token list item
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 4,
    marginVertical: 2,
    borderRadius: 14,
    minHeight: 58,
    backgroundColor: '#181818',
  },
  tokenRowSelected: {
    backgroundColor: 'rgba(107,55,22,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(199,125,54,0.3)',
  },
  verifiedDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#181818',
  },
  tokenSymbol: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  tokenName: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    marginTop: 1,
  },
  mcLabel: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  mcValue: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  addIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Token detail modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  detailSymbol: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },
  detailName: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    marginTop: 2,
  },
  verifiedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(74,222,128,0.15)',
  },
  verifiedText: {
    color: '#4ade80',
    fontSize: 10,
    fontWeight: 'bold',
  },
  addedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: `${gold[400]}22`,
  },
  addedBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  caRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  caLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  caAddress: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  statCell: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 12,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  addButton: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '900',
  },
});
