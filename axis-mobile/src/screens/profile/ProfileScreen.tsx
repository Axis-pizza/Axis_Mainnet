import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, FlatList, ActivityIndicator,
  Animated, StyleSheet, Platform, Modal, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Eye, EyeOff, Wallet, ArrowUpRight, ArrowDownRight, TrendingUp,
  Star, LayoutGrid, Trophy, Edit, User, QrCode, CheckCircle,
  Sparkles, Coins, LogOut, Copy, Share2, X,
} from 'lucide-react-native';

import { api } from '../../services/api';
import { TokenImage } from '../../components/common/TokenImage';
import { InviteModal } from '../../components/common/InviteModal';
import { ProfileEditModal } from '../../components/common/ProfileEditModal';
import { useToast } from '../../components/common/context/ToastContext';
import { useWallet } from '../../context/WalletContext';
import { colors, gold, sand, serifFont } from '../../config/theme';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Strategy {
  id: string;
  name: string;
  ticker: string | null;
  type: string;
  tokens: any[];
  tvl: number;
  status: string;
  createdAt: number;
}

type MainTab = 'portfolio' | 'leaderboard';
type PortfolioSubTab = 'created' | 'invested' | 'watchlist';
type LeaderboardSubTab = 'points' | 'created';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatCurrency = (val: number, mode: 'USD' | 'USDC') => {
  const n = val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return mode === 'USDC' ? `${n} USDC` : `$${n}`;
};
const formatAddress = (addr: string) =>
  addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : '????...????';

const getJSTDate = (): string => {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  return jst.toISOString().split('T')[0];
};
const isToday = (unixTs: number): boolean => {
  if (!unixTs) return false;
  const JST_OFFSET = 9 * 3600;
  const now = Math.floor(Date.now() / 1000);
  return Math.floor((now + JST_OFFSET) / 86400) === Math.floor((unixTs + JST_OFFSET) / 86400);
};

// ─── TierBadge (inline) ───────────────────────────────────────────────────────

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Novice:    { bg: 'rgba(120,113,108,0.15)', text: '#a8a29e', border: 'rgba(120,113,108,0.3)' },
  Strategist:{ bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
  Tactician: { bg: 'rgba(139,92,246,0.15)',  text: '#a78bfa', border: 'rgba(139,92,246,0.3)' },
  Commander: { bg: 'rgba(199,125,54,0.15)',  text: gold[400], border: 'rgba(199,125,54,0.3)' },
  Legend:    { bg: 'rgba(212,175,55,0.15)',  text: '#D4AF37', border: 'rgba(212,175,55,0.5)' },
};

const TierBadge = memo(({ tier }: { tier: string }) => {
  const c = TIER_COLORS[tier] ?? TIER_COLORS['Novice'];
  return (
    <View style={{
      paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
      backgroundColor: c.bg, borderWidth: 1, borderColor: c.border,
      alignSelf: 'flex-start',
    }}>
      <Text style={{ color: c.text, fontSize: 10, fontWeight: 'bold' }}>{tier}</Text>
    </View>
  );
});

// ─── FilterChip ───────────────────────────────────────────────────────────────

const FilterChip = memo(({ label, active, onPress, icon }: {
  label: string; active: boolean; onPress: () => void; icon?: React.ReactNode;
}) => (
  <Pressable
    onPress={onPress}
    style={[
      styles.filterChip,
      active && styles.filterChipActive,
    ]}
  >
    {icon && <View style={{ marginRight: 4 }}>{icon}</View>}
    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
  </Pressable>
));

// ─── EmptyState ──────────────────────────────────────────────────────────────

const EmptyState = memo(({ icon: Icon, title, sub }: { icon: any; title: string; sub: string }) => (
  <View style={styles.emptyState}>
    <Icon size={40} color={colors.borderSubtle} />
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptySub}>{sub}</Text>
  </View>
));

// ─── StrategyCard ─────────────────────────────────────────────────────────────

const StrategyCard = memo(({ strategy, onSelect }: {
  strategy: Strategy;
  onSelect?: (s: any) => void;
}) => {
  const tokens = Array.isArray(strategy.tokens) ? strategy.tokens : [];
  const displayTokens = tokens.slice(0, 5);
  const extraCount = tokens.length - 5;
  const tvlUSD = strategy.tvl || 0;

  return (
    <Pressable
      onPress={() => onSelect?.(strategy)}
      style={({ pressed }) => [styles.strategyCard, pressed && { opacity: 0.8 }]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.strategyName} numberOfLines={1}>{strategy.name}</Text>
          <Text style={styles.strategyTicker}>{strategy.ticker || strategy.type || ''}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.strategyTvl}>{tvlUSD > 0 ? `$${tvlUSD.toFixed(2)}` : '-'}</Text>
          <Text style={styles.strategyTicker}>TVL</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        {displayTokens.map((t: any, i: number) => (
          <View key={i} style={[styles.tokenWrap, { marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }]}>
            <TokenImage src={t.logoURI} style={styles.tokenImg} />
          </View>
        ))}
        {extraCount > 0 && (
          <View style={[styles.tokenWrap, styles.tokenExtra, { marginLeft: -8, zIndex: 0 }]}>
            <Text style={styles.tokenExtraText}>+{extraCount}</Text>
          </View>
        )}
      </View>

      <View style={styles.cardFooterRow}>
        <View style={styles.activeBadge}>
          <Text style={styles.activeText}>ACTIVE</Text>
        </View>
        <Text style={styles.dateText}>{new Date(strategy.createdAt * 1000).toLocaleDateString()}</Text>
      </View>
    </Pressable>
  );
});

// ─── Leaderboard Podium ──────────────────────────────────────────────────────

const GoldCard = memo(({ user, leaderboardTab }: { user: any; leaderboardTab: LeaderboardSubTab }) => (
  <LinearGradient
    colors={user.isMe ? ['rgba(212,175,55,0.1)', '#140E08'] : ['#140E08', '#0B0704']}
    style={[styles.goldCard, { borderColor: user.isMe ? 'rgba(212,175,55,0.5)' : 'rgba(212,175,55,0.2)' }]}
  >
    <Text style={styles.goldRankText}>#1</Text>
    <View style={styles.goldAvatar}>
      {user.avatar_url ? (
        <Image
          source={{ uri: api.getProxyUrl(user.avatar_url) }}
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <Text style={styles.avatarInitial}>{user.username?.charAt(0)?.toUpperCase() || '?'}</Text>
      )}
    </View>
    <Text style={styles.goldUsername} numberOfLines={1}>{user.username || 'Anonymous'}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {leaderboardTab === 'created' ? (
        <>
          <Trophy size={16} color="#D4AF37" />
          <Text style={styles.goldScore}>{(user.value || user.total_xp || 0).toLocaleString()} ETFs</Text>
        </>
      ) : (
        <>
          <Star size={16} color="#D4AF37" fill="#D4AF37" />
          <Text style={styles.goldScore}>{(user.value || user.total_xp || 0).toLocaleString()}</Text>
        </>
      )}
    </View>
  </LinearGradient>
));

const SilverBronzeCard = memo(({ user, rank, leaderboardTab }: {
  user: any; rank: number; leaderboardTab: LeaderboardSubTab;
}) => {
  const isSilver = rank === 2;
  const borderColor = isSilver ? '#C0C0C0' : '#CD7F32';
  const textColor = isSilver ? '#C0C0C0' : '#CD7F32';
  const gradientColors = isSilver
    ? (['#FFFFFF', '#C0C0C0', '#707070'] as [string, string, string])
    : (['#FFDAB9', '#CD7F32', '#8B4513'] as [string, string, string]);

  return (
    <View style={[
      styles.sbCard,
      { borderColor: user.isMe ? borderColor : 'rgba(255,255,255,0.05)' },
      user.isMe && { backgroundColor: `${borderColor}1A` },
    ]}>
      <Text style={{ position: 'absolute', top: 10, left: 12, fontSize: 18, fontWeight: '900', fontStyle: 'italic', color: borderColor }}>
        #{rank}
      </Text>
      <View style={[styles.sbAvatar, { borderColor }]}>
        {user.avatar_url ? (
          <Image source={{ uri: api.getProxyUrl(user.avatar_url) }} style={{ width: '100%', height: '100%' }} />
        ) : (
          <Text style={[styles.avatarInitial, { fontSize: 18 }]}>{user.username?.charAt(0)?.toUpperCase() || '?'}</Text>
        )}
      </View>
      <Text style={styles.sbUsername} numberOfLines={1}>{user.username || 'Anonymous'}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {leaderboardTab === 'created' ? (
          <>
            <Trophy size={13} color={textColor} />
            <Text style={[styles.sbScore, { color: textColor }]}>{(user.value || user.total_xp || 0).toLocaleString()} ETFs</Text>
          </>
        ) : (
          <>
            <Star size={13} color={textColor} fill={textColor} />
            <Text style={[styles.sbScore, { color: textColor }]}>{(user.value || user.total_xp || 0).toLocaleString()}</Text>
          </>
        )}
      </View>
    </View>
  );
});

const RankedRow = memo(({ user, leaderboardTab, myPubkey }: {
  user: any; leaderboardTab: LeaderboardSubTab; myPubkey: string;
}) => {
  const isMe = user.isMe || user.pubkey === myPubkey || user.wallet_address === myPubkey;
  return (
    <View style={[styles.rankedRow, isMe && styles.rankedRowMe]}>
      <View style={styles.rankedAvatar}>
        {user.avatar_url ? (
          <Image source={{ uri: api.getProxyUrl(user.avatar_url) }} style={{ width: '100%', height: '100%' }} />
        ) : (
          <Text style={[styles.avatarInitial, { fontSize: 12 }]}>{user.username?.charAt(0)?.toUpperCase() || '?'}</Text>
        )}
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ fontSize: 10, color: colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 2 }}>
          #{user.rank}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.rankedUsername, isMe && { color: gold[400] }]} numberOfLines={1}>
            {user.username || formatAddress(user.pubkey || user.wallet_address || '')}
          </Text>
          {isMe && (
            <View style={{ backgroundColor: 'rgba(199,125,54,0.2)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 }}>
              <Text style={{ fontSize: 8, color: gold[400], fontWeight: 'bold' }}>YOU</Text>
            </View>
          )}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {leaderboardTab === 'created' ? (
          <>
            <Trophy size={13} color={colors.textSecondary} />
            <Text style={styles.rankedScore}>{(user.value || user.total_xp || 0).toLocaleString()} ETFs</Text>
          </>
        ) : (
          <>
            <Star size={13} color={colors.textSecondary} />
            <Text style={styles.rankedScore}>{(user.value || user.total_xp || 0).toLocaleString()}</Text>
          </>
        )}
      </View>
    </View>
  );
});

// ─── Main ProfileScreen ───────────────────────────────────────────────────────

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { publicKey, connected, connect, disconnect } = useWallet();
  const { showToast } = useToast();

  // UI State
  const [mainTab, setMainTab] = useState<MainTab>('portfolio');
  const [portfolioSubTab, setPortfolioSubTab] = useState<PortfolioSubTab>('created');
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardSubTab>('points');
  const [currencyMode, setCurrencyMode] = useState<'USD' | 'USDC'>('USD');
  const [isHidden, setIsHidden] = useState(false);

  // Action state
  const [checkedIn, setCheckedIn] = useState(false);
  const [faucetClaimed, setFaucetClaimed] = useState(false);
  const [xpFlash, setXpFlash] = useState(false);
  const [earnedXp, setEarnedXp] = useState(10);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  // Data state
  const [isLoading, setIsLoading] = useState(false);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [myStrategies, setMyStrategies] = useState<Strategy[]>([]);
  const [investedStrategies, setInvestedStrategies] = useState<Strategy[]>([]);
  const [watchlist, setWatchlist] = useState<Strategy[]>([]);
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [usdcBalance, setUsdcBalance] = useState(0);

  // Animations
  const xpFlashAnim = useRef(new Animated.Value(0)).current;
  const xpFlashY = useRef(new Animated.Value(4)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // ── JST date helpers ────────────────────────────────────────────────────────

  const loadCheckinState = useCallback(async () => {
    if (!publicKey) return;
    const today = getJSTDate();
    const stored = await AsyncStorage.getItem(`axis_checkin_${publicKey.toBase58()}_${today}`);
    setCheckedIn(!!stored);
  }, [publicKey]);

  useEffect(() => {
    loadCheckinState();
  }, [loadCheckinState]);

  // ── Load Profile ─────────────────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    if (!publicKey) return;
    setIsLoading(true);
    try {
      const pubkeyStr = publicKey.toBase58();
      const [userRes, stratsRes, watchlistRes, investedRes] = await Promise.all([
        api.getUser(pubkeyStr),
        api.getUserStrategies(pubkeyStr),
        api.getUserWatchlist(pubkeyStr),
        api.getInvestedStrategies(pubkeyStr),
      ]);

      if (userRes.success && userRes.user) {
        const u = userRes.user;
        setUserProfile({
          username: u.username || 'Anonymous',
          referralCode: u.referralCode || `AXIS-${pubkeyStr.slice(0, 4).toUpperCase()}`,
          totalPoints: u.total_xp || 0,
          rankTier: u.rank_tier || 'Novice',
          pnlPercent: Number(u.pnl_percent) || 0,
          referralCount: u.referralCount || 0,
          is_vip: u.is_vip || false,
          bio: u.bio || '',
          avatar_url: u.avatar_url || u.pfpUrl || '',
        });

        if (isToday(u.last_checkin)) {
          setCheckedIn(true);
          const today = getJSTDate();
          await AsyncStorage.setItem(`axis_checkin_${pubkeyStr}_${today}`, 'true');
        }
        if (isToday(u.last_faucet_at)) {
          setFaucetClaimed(true);
        }
      }

      if (stratsRes.success && stratsRes.strategies) {
        const seen = new Map<string, boolean>();
        const unique = (stratsRes.strategies as Strategy[])
          .filter((s: Strategy) => (seen.has(s.id) ? false : (seen.set(s.id, true), true)))
          .sort((a: Strategy, b: Strategy) => b.createdAt - a.createdAt);
        setMyStrategies(unique);
      } else if (Array.isArray(stratsRes)) {
        setMyStrategies(stratsRes);
      }

      if (watchlistRes.success && watchlistRes.strategies) {
        setWatchlist(watchlistRes.strategies);
      }
      if (investedRes.success && investedRes.strategies) {
        setInvestedStrategies(investedRes.strategies);
      } else if (Array.isArray(investedRes)) {
        setInvestedStrategies(investedRes);
      }
    } catch (e) {
      console.error('loadProfile error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    if (publicKey) loadProfile();
  }, [publicKey, loadProfile]);

  // ── Load Leaderboard ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (mainTab !== 'leaderboard') return;
    const load = async () => {
      setLeaderboardData([]);
      setIsLeaderboardLoading(true);
      try {
        if (leaderboardTab === 'created') {
          const PAGE = 200;
          const MAX_PAGES = 10;
          const all: any[] = [];
          for (let page = 0; page < MAX_PAGES; page++) {
            const res = await api.discoverStrategies(PAGE, page * PAGE);
            const items: any[] = res.strategies || res || [];
            all.push(...items);
            if (items.length < PAGE) break;
          }
          const countMap: Record<string, { count: number; pfpUrl?: string | null }> = {};
          for (const s of all) {
            const pk = s.ownerPubkey || s.owner_pubkey;
            if (!pk) continue;
            if (!countMap[pk]) countMap[pk] = { count: 0, pfpUrl: s.creatorPfpUrl ?? null };
            countMap[pk].count++;
          }
          const sorted = Object.entries(countMap)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 20);
          const userInfos = await Promise.all(sorted.map(([pk]) => api.getUser(pk).catch(() => null)));
          setLeaderboardData(sorted.map(([pk, data], i) => {
            const u = userInfos[i]?.user;
            return {
              pubkey: pk,
              username: u?.username || formatAddress(pk),
              avatar_url: u?.avatar_url || u?.pfpUrl || data.pfpUrl || null,
              value: data.count,
              rank: i + 1,
              isMe: pk === publicKey?.toBase58(),
            };
          }));
        } else {
          const res = await api.getLeaderboard('points');
          if (res.success && res.leaderboard) {
            setLeaderboardData(res.leaderboard.map((u: any, i: number) => ({
              ...u,
              rank: i + 1,
              isMe: u.pubkey === publicKey?.toBase58() || u.wallet_address === publicKey?.toBase58(),
            })));
          } else if (Array.isArray(res)) {
            setLeaderboardData(res.map((u: any, i: number) => ({
              ...u,
              rank: i + 1,
              isMe: u.pubkey === publicKey?.toBase58() || u.wallet_address === publicKey?.toBase58(),
            })));
          }
        }
      } catch (e) {
        console.error('loadLeaderboard error:', e);
      } finally {
        setIsLeaderboardLoading(false);
      }
    };
    load();
  }, [mainTab, leaderboardTab, publicKey]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleCheckIn = async () => {
    if (!publicKey || checkedIn || checkInLoading) return;
    setCheckInLoading(true);
    try {
      const res = await api.dailyCheckIn(publicKey.toBase58());
      if (res.success) {
        const earned: number = res.earnedPoints ?? 10;
        setEarnedXp(earned);
        setUserProfile((prev: any) => prev ? { ...prev, totalPoints: (prev.totalPoints || 0) + earned } : prev);
        setXpFlash(true);
        // animate XP flash
        xpFlashAnim.setValue(0);
        xpFlashY.setValue(4);
        Animated.parallel([
          Animated.timing(xpFlashAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(xpFlashY, { toValue: -24, duration: 900, useNativeDriver: true }),
        ]).start(() => {
          Animated.timing(xpFlashAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
            setXpFlash(false);
          });
        });
        setCheckedIn(true);
        const today = getJSTDate();
        await AsyncStorage.setItem(`axis_checkin_${publicKey.toBase58()}_${today}`, 'true');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast(res.isVip ? `⭐ +${earned} XP Claimed! (VIP Bonus)` : `✅ +${earned} XP Claimed!`, 'success');
        loadProfile();
      } else {
        const msg = (res.error || res.message || '').toLowerCase();
        if (msg.includes('already') || msg.includes('today')) {
          setCheckedIn(true);
          const today = getJSTDate();
          await AsyncStorage.setItem(`axis_checkin_${publicKey.toBase58()}_${today}`, 'true');
          showToast("Already checked in today. Come back tomorrow!", 'info');
        } else {
          showToast('Check-in failed. Please try again later.', 'error');
        }
      }
    } catch {
      showToast('Network error. Check your connection and try again.', 'error');
    }
    setCheckInLoading(false);
  };

  const handleFaucet = async () => {
    if (!publicKey || faucetClaimed || faucetLoading) return;
    setFaucetLoading(true);
    try {
      const result = await api.requestFaucet(publicKey.toBase58());
      if (result.success) {
        setFaucetClaimed(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast('💰 1,000 USDC received! Check your wallet.', 'success');
      } else {
        const msg = (result.error || result.message || '').toLowerCase();
        if (msg.includes('already') || msg.includes('claimed')) {
          setFaucetClaimed(true);
          showToast('Already claimed today. Resets at midnight (JST).', 'info');
        } else {
          showToast('Faucet unavailable. Please try again later.', 'error');
        }
      }
    } catch {
      showToast('Network error. Check your connection and try again.', 'error');
    } finally {
      setFaucetLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setIsDisconnecting(true);
      disconnect();
      showToast('Wallet disconnected', 'info');
    } catch {
      showToast('Failed to disconnect wallet', 'error');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleStrategySelect = (strategy: any) => {
    navigation.navigate('StrategyDetail', { strategy });
  };

  // ── Derived values ───────────────────────────────────────────────────────────

  const investedAmountUSD = myStrategies.reduce((sum, s) => sum + (s.tvl || 0), 0);
  const totalNetWorthUSD = usdcBalance + investedAmountUSD;
  const pnlVal = userProfile?.pnlPercent || 0;
  const isPos = pnlVal >= 0;

  // ── Not connected ────────────────────────────────────────────────────────────

  if (!connected) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <Animated.View style={[styles.iconCircle, { opacity: new Animated.Value(1) }]}>
          <Wallet size={32} color={colors.textMuted} />
        </Animated.View>
        <Text style={styles.notConnectedTitle}>Connect Wallet</Text>
        <Text style={styles.notConnectedSub}>
          Access your portfolio, track referrals, and climb the leaderboard.
        </Text>
        <Pressable
          onPress={connect}
          style={({ pressed }) => [styles.connectBtn, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient
            colors={['#6B4420', '#B8863F', '#E8C890']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ paddingHorizontal: 32, paddingVertical: 13, borderRadius: 12 }}
          >
            <Text style={{ color: '#140D07', fontWeight: 'bold', fontSize: 15 }}>Connect Wallet</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  // ── Portfolio content ────────────────────────────────────────────────────────

  const portfolioData = portfolioSubTab === 'created'
    ? myStrategies
    : portfolioSubTab === 'invested'
      ? investedStrategies
      : watchlist;

  const portfolioEmpty = portfolioSubTab === 'created'
    ? { icon: LayoutGrid, title: 'No strategies yet', sub: 'Create your first index fund.' }
    : portfolioSubTab === 'invested'
      ? { icon: TrendingUp, title: 'No investments', sub: 'Explore strategies to grow wealth.' }
      : { icon: Star, title: 'Watchlist empty', sub: 'Star strategies to track them.' };

  // ── Render ────────────────────────────────────────────────────────────────────

  const pubkeyStr = publicKey?.toBase58() || '';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 16 }}
      >
        {/* ── Hero Card ─────────────────────────────────────────────── */}
        <View style={styles.heroCard}>
          <LinearGradient
            colors={['#221509', '#0B0704']}
            start={{ x: 0.7, y: 0.2 }}
            end={{ x: 0, y: 1 }}
            style={styles.heroGradient}
          >
            {/* Top row: Avatar + Info + Edit */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
              {/* Avatar */}
              <Pressable onPress={() => setIsEditOpen(true)} style={{ position: 'relative' }}>
                <View style={styles.avatarRing}>
                  <View style={styles.avatarInner}>
                    {userProfile?.avatar_url ? (
                      <Image
                        source={{ uri: api.getProxyUrl(userProfile.avatar_url) }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    ) : (
                      <User size={32} color="rgba(242,224,200,0.2)" />
                    )}
                  </View>
                </View>
                <LinearGradient
                  colors={['#6B4420', '#B8863F', '#E8C890']}
                  style={styles.editBadge}
                >
                  <Edit size={10} color="#140D07" />
                </LinearGradient>
              </Pressable>

              {/* Info */}
              <View style={{ flex: 1, paddingTop: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={styles.heroUsername} numberOfLines={1}>
                    {userProfile?.username || formatAddress(pubkeyStr)}
                  </Text>
                  {userProfile?.is_vip && (
                    <View style={styles.vipBadge}><Text style={styles.vipText}>VIP</Text></View>
                  )}
                </View>

                {/* XP with flash animation */}
                <View style={{ position: 'relative', marginTop: 2 }}>
                  <Text style={[styles.heroXp, xpFlash && { color: '#4ade80' }]}>
                    XP: {(userProfile?.totalPoints || 0).toLocaleString()}
                  </Text>
                  {xpFlash && (
                    <Animated.Text style={[styles.xpFlashText, {
                      opacity: xpFlashAnim,
                      transform: [{ translateY: xpFlashY }],
                    }]}>
                      +{earnedXp} XP
                    </Animated.Text>
                  )}
                </View>

                <View style={{ marginTop: 6 }}>
                  <TierBadge tier={userProfile?.rankTier || 'Novice'} />
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                  <Wallet size={11} color="rgba(242,224,200,0.3)" />
                  <Text style={styles.heroAddress}>{formatAddress(pubkeyStr)}</Text>
                </View>
              </View>
            </View>

            {/* Bio */}
            <View style={{ marginTop: 12 }}>
              {userProfile?.bio ? (
                <Text style={styles.biText}>{userProfile.bio}</Text>
              ) : (
                <Pressable onPress={() => setIsEditOpen(true)}>
                  <Text style={styles.bioPlaceholder}>+ Add Bio</Text>
                </Pressable>
              )}
            </View>

            {/* Net Worth */}
            <View style={styles.netWorthRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.netWorthLabel}>NET WORTH</Text>
                <Text style={styles.netWorthValue}>
                  {isHidden ? '••••••' : formatCurrency(totalNetWorthUSD, currencyMode)}
                </Text>
                {pnlVal !== 0 && (
                  <View style={[styles.pnlBadge, isPos ? styles.pnlPos : styles.pnlNeg]}>
                    {isPos
                      ? <ArrowUpRight size={11} color="#4ade80" />
                      : <ArrowDownRight size={11} color="#f87171" />
                    }
                    <Text style={[styles.pnlText, { color: isPos ? '#4ade80' : '#f87171' }]}>
                      {isHidden ? '••••' : `${isPos ? '+' : ''}${pnlVal.toFixed(2)}%`}
                    </Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable onPress={() => setCurrencyMode(m => m === 'USD' ? 'USDC' : 'USD')} style={styles.currBtn}>
                  <Text style={styles.currBtnText}>{currencyMode}</Text>
                </Pressable>
                <Pressable onPress={() => setIsHidden(h => !h)}>
                  {isHidden
                    ? <EyeOff size={16} color={colors.textMuted} />
                    : <Eye size={16} color={colors.textMuted} />
                  }
                </Pressable>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* ── Action Buttons ────────────────────────────────────────── */}
        <View style={{ gap: 10, marginBottom: 24 }}>
          {/* Daily Check-in */}
          <Pressable
            onPress={handleCheckIn}
            disabled={checkInLoading || checkedIn}
            style={[
              styles.checkInBtn,
              checkedIn
                ? { backgroundColor: 'rgba(6,78,59,0.5)', borderColor: 'rgba(52,211,153,0.3)' }
                : { backgroundColor: gold[400] },
            ]}
          >
            {checkInLoading
              ? <ActivityIndicator size="small" color={checkedIn ? '#34d399' : '#140D07'} />
              : <CheckCircle size={18} color={checkedIn ? '#34d399' : '#140D07'} />
            }
            <Text style={[styles.checkInText, { color: checkedIn ? '#34d399' : '#140D07' }]}>
              {checkedIn ? "Today's Check-in Done" : 'Daily Check-in'}
            </Text>
            {!checkedIn && (
              <View style={{ backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ fontSize: 11, color: '#140D07', fontWeight: 'bold' }}>+{earnedXp} XP</Text>
              </View>
            )}
          </Pressable>

          {/* Faucet + Invite row */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={handleFaucet}
              disabled={faucetLoading || faucetClaimed}
              style={[
                styles.faucetBtn,
                faucetClaimed && { backgroundColor: 'rgba(6,78,59,0.5)', borderColor: 'rgba(52,211,153,0.3)' },
              ]}
            >
              {faucetClaimed
                ? <CheckCircle size={16} color="#34d399" />
                : faucetLoading
                  ? <ActivityIndicator size="small" color={gold[400]} />
                  : <Coins size={16} color={gold[400]} />
              }
              <Text style={[styles.faucetText, { color: faucetClaimed ? '#34d399' : gold[400] }]}>
                {faucetClaimed ? 'Claimed Today' : faucetLoading ? 'Processing...' : 'Get Demo USDC'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setIsInviteOpen(true)}
              style={styles.inviteBtn}
            >
              <QrCode size={16} color={colors.textMuted} />
              <Text style={styles.inviteBtnText}>Invite & Earn</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Main Tabs ─────────────────────────────────────────────── */}
        <View style={styles.mainTabRow}>
          {(['portfolio', 'leaderboard'] as MainTab[]).map(tab => (
            <Pressable
              key={tab}
              onPress={() => setMainTab(tab)}
              style={[styles.mainTab, mainTab === tab && styles.mainTabActive]}
            >
              <Text style={[styles.mainTabText, mainTab === tab && styles.mainTabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Portfolio ─────────────────────────────────────────────── */}
        {mainTab === 'portfolio' && (
          <View>
            {/* Sub-tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
              <FilterChip
                label={`Created (${myStrategies.length})`}
                active={portfolioSubTab === 'created'}
                onPress={() => setPortfolioSubTab('created')}
              />
              <FilterChip
                label={`Invested (${investedStrategies.length})`}
                active={portfolioSubTab === 'invested'}
                onPress={() => setPortfolioSubTab('invested')}
              />
              <FilterChip
                label={`Watchlist (${watchlist.length})`}
                active={portfolioSubTab === 'watchlist'}
                onPress={() => setPortfolioSubTab('watchlist')}
                icon={<Star size={12} color={portfolioSubTab === 'watchlist' ? '#140D07' : colors.textMuted} />}
              />
            </ScrollView>

            {isLoading ? (
              <View style={{ paddingVertical: 48, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={gold[400]} />
              </View>
            ) : portfolioData.length > 0 ? (
              <View style={{ gap: 12 }}>
                {portfolioData.map(s => (
                  <StrategyCard key={s.id} strategy={s} onSelect={handleStrategySelect} />
                ))}
              </View>
            ) : (
              <EmptyState icon={portfolioEmpty.icon} title={portfolioEmpty.title} sub={portfolioEmpty.sub} />
            )}
          </View>
        )}

        {/* ── Leaderboard ───────────────────────────────────────────── */}
        {mainTab === 'leaderboard' && (
          <View>
            {/* Sub-tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
              <FilterChip
                label="Points"
                active={leaderboardTab === 'points'}
                onPress={() => setLeaderboardTab('points')}
                icon={<Star size={12} color={leaderboardTab === 'points' ? '#140D07' : colors.textMuted} />}
              />
              <FilterChip
                label="ETFs Created"
                active={leaderboardTab === 'created'}
                onPress={() => setLeaderboardTab('created')}
                icon={<Trophy size={12} color={leaderboardTab === 'created' ? '#140D07' : colors.textMuted} />}
              />
            </ScrollView>

            {isLeaderboardLoading ? (
              <View style={{ paddingVertical: 60, alignItems: 'center', gap: 12 }}>
                <ActivityIndicator size="large" color={gold[400]} />
                <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                  LOADING...
                </Text>
              </View>
            ) : leaderboardData.length === 0 ? (
              <View style={{ paddingVertical: 60, alignItems: 'center' }}>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>No ranking data available.</Text>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {/* Gold #1 */}
                {leaderboardData[0] && (
                  <GoldCard user={leaderboardData[0]} leaderboardTab={leaderboardTab} />
                )}

                {/* Silver #2 + Bronze #3 */}
                {(leaderboardData[1] || leaderboardData[2]) && (
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {leaderboardData[1] && (
                      <View style={{ flex: 1 }}>
                        <SilverBronzeCard user={leaderboardData[1]} rank={2} leaderboardTab={leaderboardTab} />
                      </View>
                    )}
                    {leaderboardData[2] && (
                      <View style={{ flex: 1 }}>
                        <SilverBronzeCard user={leaderboardData[2]} rank={3} leaderboardTab={leaderboardTab} />
                      </View>
                    )}
                  </View>
                )}

                {/* 4th and beyond */}
                {leaderboardData.slice(3).map(user => (
                  <RankedRow
                    key={user.pubkey || user.wallet_address}
                    user={user}
                    leaderboardTab={leaderboardTab}
                    myPubkey={pubkeyStr}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Disconnect ────────────────────────────────────────────── */}
        <View style={{ marginTop: 32 }}>
          <Pressable
            onPress={handleDisconnect}
            disabled={isDisconnecting}
            style={({ pressed }) => [styles.disconnectBtn, pressed && { backgroundColor: 'rgba(239,68,68,0.05)' }]}
          >
            {isDisconnecting
              ? <ActivityIndicator size="small" color="rgba(239,68,68,0.8)" />
              : <LogOut size={16} color="rgba(239,68,68,0.8)" />
            }
            <Text style={styles.disconnectText}>
              {isDisconnecting ? 'Disconnecting...' : 'Disconnect Wallet'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* ── Modals ───────────────────────────────────────────────────── */}
      {publicKey && (
        <ProfileEditModal
          visible={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          currentProfile={{
            pubkey: pubkeyStr,
            username: userProfile?.username,
            bio: userProfile?.bio,
            avatar_url: userProfile?.avatar_url,
          }}
          onUpdate={loadProfile}
        />
      )}

      {publicKey && (
        <InviteModal
          visible={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
          pubkey={pubkeyStr}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090705' },

  // Not connected
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#100d0a', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(199,125,54,0.15)', marginBottom: 24,
  },
  notConnectedTitle: { fontSize: 22, fontWeight: 'bold', color: colors.text, fontFamily: serifFont, marginBottom: 8 },
  notConnectedSub: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginBottom: 32, paddingHorizontal: 32 },
  connectBtn: { borderRadius: 12, overflow: 'hidden' },

  // Hero card
  heroCard: {
    borderRadius: 24, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(199,125,54,0.15)',
    marginBottom: 20, marginTop: 8,
  },
  heroGradient: { padding: 20 },

  avatarRing: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 2, borderColor: 'rgba(184,134,63,0.3)',
    padding: 3,
  },
  avatarInner: {
    flex: 1, borderRadius: 36,
    backgroundColor: '#140E08', overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
  },
  editBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 22, height: 22, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center',
  },

  heroUsername: { fontSize: 17, fontWeight: 'bold', color: colors.text, flex: 1 },
  vipBadge: {
    backgroundColor: gold[400], paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  vipText: { fontSize: 9, fontWeight: 'bold', color: '#140D07' },
  heroXp: { fontSize: 13, fontWeight: 'bold', fontFamily: serifFont, color: gold[400] },
  xpFlashText: {
    position: 'absolute', left: '100%', marginLeft: 8, top: -2,
    color: '#4ade80', fontSize: 12, fontWeight: 'bold',
  },
  heroAddress: { fontSize: 11, fontFamily: mono, color: 'rgba(242,224,200,0.35)', letterSpacing: 0.5 },
  biText: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  bioPlaceholder: { fontSize: 12, color: 'rgba(122,90,48,0.5)' },

  netWorthRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 16, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: 'rgba(199,125,54,0.1)',
  },
  netWorthLabel: { fontSize: 10, color: 'rgba(242,224,200,0.4)', fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 4 },
  netWorthValue: { fontSize: 26, fontWeight: 'bold', color: colors.text, fontFamily: serifFont },
  pnlBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginTop: 6, borderWidth: 1,
  },
  pnlPos: { backgroundColor: 'rgba(74,222,128,0.1)', borderColor: 'rgba(74,222,128,0.2)' },
  pnlNeg: { backgroundColor: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.2)' },
  pnlText: { fontSize: 12, fontWeight: 'bold', marginLeft: 3, fontFamily: mono },
  currBtn: {
    backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1, borderColor: 'rgba(199,125,54,0.15)',
  },
  currBtnText: { fontSize: 10, fontWeight: 'bold', color: 'rgba(242,224,200,0.7)' },

  // Action buttons
  checkInBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: 'transparent',
  },
  checkInText: { fontSize: 14, fontWeight: 'bold' },
  faucetBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 14,
    backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: 'rgba(199,125,54,0.3)',
  },
  faucetText: { fontSize: 12, fontWeight: 'bold' },
  inviteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 14,
    backgroundColor: '#140E08', borderWidth: 1, borderColor: 'rgba(199,125,54,0.15)',
  },
  inviteBtnText: { fontSize: 12, fontWeight: 'bold', color: colors.text },

  // Main tabs
  mainTabRow: {
    flexDirection: 'row', borderBottomWidth: 1,
    borderBottomColor: 'rgba(199,125,54,0.15)', marginBottom: 16,
  },
  mainTab: { flex: 1, paddingBottom: 12, alignItems: 'center' },
  mainTabActive: { borderBottomWidth: 2, borderBottomColor: gold[400] },
  mainTabText: { fontSize: 14, fontWeight: 'bold', color: colors.textMuted },
  mainTabTextActive: { color: colors.text },

  // Filter chip
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#140E08', borderWidth: 1, borderColor: 'rgba(199,125,54,0.08)',
  },
  filterChipActive: {
    backgroundColor: gold[400], borderColor: gold[400],
  },
  filterChipText: { fontSize: 12, fontWeight: 'bold', color: 'rgba(242,224,200,0.5)' },
  filterChipTextActive: { color: '#140D07' },

  // Strategy card
  strategyCard: {
    backgroundColor: '#140E08', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(199,125,54,0.08)',
  },
  strategyName: { fontSize: 15, fontWeight: 'bold', color: colors.text, marginBottom: 2 },
  strategyTicker: { fontSize: 10, color: colors.textMuted },
  strategyTvl: { fontSize: 14, fontWeight: 'bold', color: gold[400], fontFamily: mono },
  tokenWrap: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: '#140E08', overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tokenImg: { width: '100%', height: '100%' },
  tokenExtra: { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(199,125,54,0.1)' },
  tokenExtraText: { fontSize: 8, fontWeight: 'bold', color: colors.textSecondary },
  cardFooterRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(199,125,54,0.08)',
  },
  activeBadge: { backgroundColor: 'rgba(16,185,129,0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  activeText: { color: '#10b981', fontSize: 10, fontWeight: 'bold' },
  dateText: { color: colors.textMuted, fontSize: 10 },

  // Leaderboard: Gold
  goldCard: {
    borderRadius: 20, borderWidth: 1, padding: 24,
    alignItems: 'center', overflow: 'hidden', position: 'relative',
  },
  goldRankText: {
    position: 'absolute', top: 16, left: 20,
    fontSize: 24, fontWeight: '900', fontStyle: 'italic', color: '#D4AF37',
  },
  goldAvatar: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2, borderColor: '#D4AF37',
    overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#D4AF37', shadowRadius: 20, shadowOpacity: 0.4, elevation: 8,
  },
  goldUsername: { fontSize: 18, fontWeight: 'bold', color: colors.text, marginBottom: 4, maxWidth: 200 },
  goldScore: { fontSize: 15, fontWeight: 'bold', color: '#D4AF37' },

  // Silver/Bronze
  sbCard: {
    borderRadius: 16, borderWidth: 1, padding: 20,
    alignItems: 'center', backgroundColor: '#140E08', position: 'relative',
  },
  sbAvatar: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 1.5,
    overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 8, marginTop: 8,
  },
  sbUsername: { fontSize: 13, fontWeight: 'bold', color: colors.text, marginBottom: 4, width: '100%', textAlign: 'center' },
  sbScore: { fontSize: 13, fontWeight: 'bold' },

  // Ranked rows
  rankedRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 16,
    backgroundColor: '#140E08', borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)',
  },
  rankedRowMe: { backgroundColor: 'rgba(199,125,54,0.1)', borderColor: 'rgba(199,125,54,0.3)' },
  rankedAvatar: {
    width: 40, height: 40, borderRadius: 20,
    overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  avatarInitial: { fontWeight: 'bold', color: 'rgba(255,255,255,0.5)' },
  rankedUsername: { fontSize: 14, fontWeight: 'bold', color: 'rgba(242,224,200,0.9)' },
  rankedScore: { fontSize: 13, fontWeight: 'bold', color: 'rgba(242,224,200,0.7)', fontFamily: mono },

  // Empty
  emptyState: {
    alignItems: 'center', paddingVertical: 48,
    borderWidth: 1, borderColor: 'rgba(199,125,54,0.08)',
    borderStyle: 'dashed', borderRadius: 16,
  },
  emptyTitle: { color: 'rgba(242,224,200,0.4)', fontSize: 13, fontWeight: 'bold', marginTop: 12 },
  emptySub: { color: colors.textMuted, fontSize: 12, marginTop: 4 },

  // Disconnect
  disconnectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 10,
  },
  disconnectText: { color: 'rgba(239,68,68,0.8)', fontSize: 14, fontWeight: 'bold' },
});
