# Axis Mobile MVP — Seeker Implementation Plan

## Current State

The `axis-mobile/` package already exists with a solid foundation:
- Expo 54 + React Native 0.81.5 (new arch enabled)
- MWA wallet integration (connect, sign tx, sign message)
- Bottom tab navigation (Discover, Create, Profile) + StrategyDetail modal
- NativeWind styling with gold/bronze theme
- Services layer mirroring axis-agent (api, jupiter, coingecko, dexscreener, dflow)
- Partial screens for Discover (swipe + list), Create (landing, builder, deployment), Profile

**What's missing to ship on Seeker dApp Store:**

---

## Phase 1: Foundation & Monorepo Setup
*Priority: CRITICAL — Do this first*

### 1.1 Add axis-mobile to pnpm workspace
- Add `'axis-mobile'` to `pnpm-workspace.yaml`
- Run `pnpm install` from monorepo root
- Verify workspace linking works

### 1.2 Fix crypto polyfills
- Install `react-native-quick-crypto`
- Ensure `react-native-get-random-values` imports FIRST in `index.ts`
- Add quick-crypto polyfill before any `@solana/web3.js` import:
  ```ts
  import { install } from 'react-native-quick-crypto';
  install();
  ```

### 1.3 Fix WalletContext cluster
- Change `cluster: 'mainnet-beta'` → `cluster: 'devnet'` in `WalletContext.tsx`
- Add configurable RPC endpoint (env var or constants)

### 1.4 Update app.json
- Update bundle identifiers: `com.axisprotocol.mobile`
- Set `userInterfaceStyle: "dark"` (the app is dark-themed)
- Update splash background to `#0A0A0A`
- Add `expo-dev-client` to plugins if not present

### 1.5 Add missing Expo plugins
```json
"plugins": [
  "expo-font",
  "expo-dev-client",
  "expo-haptics",
  "expo-clipboard"
]
```

---

## Phase 2: Core Screens — Feature Parity with Web
*Priority: HIGH — The meat of the app*

### 2.1 Discover Screen (browse strategies)
**Existing:** `DiscoverScreen.tsx`, `SwipeDiscoverView.tsx`, `ListDiscoverView.tsx`, `SwipeCard.tsx`

**Needs:**
- [ ] Wire up to real API (`GET /strategies` via `services/api.ts`)
- [ ] Strategy card UI: name, ticker, TVL, ROI, composition preview
- [ ] Swipe gestures (right = invest, left = skip) using `react-native-gesture-handler` + Reanimated
- [ ] List view with pull-to-refresh
- [ ] Filter/sort controls (type, performance, TVL)
- [ ] Watchlist toggle (heart icon → `POST /watchlist`)
- [ ] Search bar for strategy lookup
- [ ] Navigate to StrategyDetail on tap

### 2.2 Strategy Detail Screen
**Existing:** `StrategyDetailScreen.tsx`

**Needs:**
- [ ] Full strategy info (name, ticker, description, creator, type)
- [ ] Composition breakdown (token list with weights — PizzaChart component exists)
- [ ] Performance chart (Victory Native line chart — 7d, 30d, all-time)
- [ ] Key metrics: TVL, APY, risk score, Sharpe ratio, max drawdown
- [ ] Deposit/Withdraw flow (connect to kagemusha program)
- [ ] Share button (deep link or screenshot)
- [ ] Creator profile link

### 2.3 Create Screen (strategy builder)
**Existing:** `CreateScreen.tsx`, `CreateLanding.tsx`, `ManualBuilder.tsx`, `DeploymentBlueprint.tsx`, `IdentityStep.tsx`, `StrategyDashboard.tsx`

**Needs:**
- [ ] Step flow: Identity → Token Selection → Weight Allocation → Preview → Deploy
- [ ] Token search (Jupiter API) with autocomplete
- [ ] Weight allocation sliders (drag to adjust %)
- [ ] Ensure weights sum to 100% with visual feedback
- [ ] Strategy type selector (Sniper / Fortress / Wave)
- [ ] Preview screen with composition chart + projected metrics
- [ ] Deploy button → call `initializeStrategy` on kagemusha program
- [ ] Post-deploy: show vault address, share link

### 2.4 Profile Screen
**Existing:** `ProfileScreen.tsx`

**Needs:**
- [ ] Wallet address display (truncated) with copy button
- [ ] SOL balance + USDC balance
- [ ] User stats: total XP, rank tier, PnL%
- [ ] List of user's strategies (created)
- [ ] List of user's positions (invested in)
- [ ] Edit profile (name, bio, avatar) → `ProfileEditModal.tsx` exists
- [ ] Settings (RPC endpoint, etc.)
- [ ] Disconnect wallet button

---

## Phase 2.5: Backend Integration for Mobile
*Priority: HIGH — Bridges mobile to the existing API*

### Current Backend State
- **Stack:** Hono + Cloudflare Workers + D1 (SQLite) + R2 (images)
- **API Base:** `https://axis-api.yusukekikuta-05.workers.dev` (TODO: confirm prod URL)
- **CORS:** `origin: '*'` — mobile works out of the box, no backend CORS changes needed
- **42 total endpoints** across 9 route files

### 2.5.1 Missing API client calls (mobile ← existing backend)
The mobile `api.ts` covers 26/29 web endpoints. Add these missing calls:

- [ ] **`signAsFeePayer(txBase64: string)`** — `POST /fee-payer/sign`
  - **CRITICAL:** Without this, users must have SOL for gas on every transaction
  - Web app uses this for zero-SOL UX — mobile must have it too
  - Returns: base64-encoded co-signed transaction
- [ ] **`getPredictionMarkets()`** — `GET /api/dflow/markets`
  - Fetches active prediction markets for strategy composition
  - Needed for full Create flow parity
- [ ] **`getDflowQuotes(mints: string[])`** — `GET /api/dflow/quotes?mints=...`
  - Price quotes for prediction tokens
- [ ] **`generatePizzaArt(tokens, strategyType, wallet)`** — `POST /art/generate`
  - Strategy art generation (low priority — placeholder endpoint)

### 2.5.2 Add response caching to mobile API client
The web app caches several calls; mobile has zero caching. Add:

- [ ] **In-memory cache** for token lists (`getTokens()`) — 5 min TTL
- [ ] **In-memory cache** for SOL price (`getSolPrice()`) — 30 sec TTL
- [ ] **In-memory cache** for leaderboard (`getLeaderboard()`) — 2 min TTL
- [ ] **AsyncStorage cache** for Jupiter token list — 6 hr TTL (matches web)
- [ ] Cache invalidation on pull-to-refresh actions

### 2.5.3 New backend endpoints (axis-api additions)

#### Authentication — Sign-In with Solana (SIWS)
- [ ] **`POST /auth/mobile/siws`** — Verify wallet ownership via signed message
  - Mobile doesn't have Privy — needs its own auth mechanism
  - Flow: client signs a nonce message via MWA → sends signature to backend → backend verifies → returns session token
  - Request: `{ wallet_address, signature, message, timestamp }`
  - Response: `{ session_token, expires_at }`
  - Store session token in AsyncStorage, attach as `Authorization: Bearer <token>` header

- [ ] **`POST /auth/mobile/session/verify`** — Validate session token
  - Called on app open to check if session is still valid
  - Response: `{ valid: boolean, user: UserProfile | null }`

#### Push Notifications
- [ ] **`POST /device/register`** — Register FCM push token
  - Request: `{ wallet_address, device_token, platform: 'android' | 'ios', app_version }`
  - Stores in new `device_tokens` D1 table
  - Called after wallet connect + SIWS auth

- [ ] **`POST /device/unregister`** — Remove device token on logout
  - Request: `{ wallet_address, device_token }`

- [ ] **New D1 table: `device_tokens`**
  ```sql
  CREATE TABLE device_tokens (
    id TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    device_token TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL,
    app_version TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );
  ```

#### Social Auth (Mobile-compatible)
- [ ] **`POST /auth/mobile/twitter`** — Initiate Twitter OAuth for mobile
  - Returns auth URL with deep link callback: `axis://auth/twitter/callback`
  - Mobile opens URL in in-app browser (expo-web-browser)
  - Callback redirects back to app with auth code

#### Sharing & Deep Links
- [ ] **`POST /deeplink/create`** — Generate shareable strategy link
  - Request: `{ strategy_id, referrer_wallet? }`
  - Response: `{ url: 'https://axis.app/s/{shortCode}', short_code }`
  - Backend creates short link that resolves to `axis://strategy/{id}`

- [ ] **`GET /deeplink/{shortCode}`** — Resolve short link
  - Returns 302 redirect to `axis://strategy/{id}` (opens app) or web fallback

### 2.5.4 Backend middleware updates
- [ ] Add `Authorization: Bearer <token>` middleware for mobile session tokens
  - Applied to write endpoints (POST/DELETE)
  - Read endpoints (GET) remain public
  - Coexists with existing web auth (no breaking changes)

### 2.5.5 Webhook enhancements for mobile
- [ ] Extend Helius webhook (`/webhook`) to trigger push notifications
  - On deposit detected → notify device token for vault owner
  - On strategy price alert → notify watchlisted users
  - Uses Cloudflare Workers + FCM HTTP v1 API (no Firebase SDK needed)

---

## Phase 3: On-Chain Integration
*Priority: HIGH — What makes it real*

### 3.1 Kagemusha program client
- Port `axis-agent/src/services/kagemusha.ts` to mobile
- Use `@solana/web3.js` + manual instruction building (Anchor client may not work cleanly in RN)
- OR use Anchor IDL with a lightweight wrapper
- Functions needed:
  - `initializeStrategy(name, type, weights)`
  - `deposit(vault, amount)` / `depositSol(vault, amount)`
  - `withdraw(vault, amount)` / `withdrawSol(vault, amount)`
  - `fetchStrategyVault(address)`
  - `fetchUserPosition(vault, user)`

### 3.2 Transaction flow
- Build transaction → sign via MWA `transact()` → send via RPC
- Show transaction status (pending → confirmed → finalized)
- Toast notifications for success/failure
- Link to Solana Explorer on success

### 3.3 SOL/SPL token balances
- Fetch SOL balance via `getBalance()`
- Fetch SPL token balances via `getTokenAccountsByOwner()`
- Display in Profile + Deposit flows
- Auto-refresh on focus

---

## Phase 4: UX Polish & Mobile-Native Features
*Priority: MEDIUM — Makes it feel native*

### 4.1 Haptic feedback
- `expo-haptics` on key interactions: swipe, deposit, button taps
- Light impact on tab switch, medium on transaction confirm, heavy on errors

### 4.2 Pull-to-refresh
- All list screens (Discover, Profile positions)

### 4.3 Skeleton loading states
- Shimmer placeholders while data loads
- Use Reanimated for smooth skeleton animations

### 4.4 Onboarding / Tutorial
- `TutorialOverlay.tsx` exists — wire it up
- First launch: explain swipe discovery, how to create, how to connect wallet
- Store completion flag in AsyncStorage

### 4.5 Error handling
- Network error states with retry buttons
- Wallet disconnected states
- Transaction failure with human-readable error messages

### 4.6 Deep linking
- `axis://strategy/{id}` → opens StrategyDetail
- `axis://discover` → opens Discover tab
- Configure in `app.json` scheme

### 4.7 Branding assets
- Replace Expo default splash/icon with Axis branding
- App icon: Axis logo on dark background
- Splash: Axis logo centered, `#0A0A0A` background
- Adaptive icon for Android

---

## Phase 5: Seeker-Specific Features
*Priority: MEDIUM — Differentiators for Seeker users*

### 5.1 Seeker Genesis Token (SGT) detection
- Check if user holds SGT NFT on-chain
- If yes: show badge on profile, unlock exclusive features
- Could gate: lower fees, exclusive strategies, early access

### 5.2 .skr domain resolution
- Resolve `.skr` names to wallet addresses
- Display `.skr` name instead of address where available
- Allow sending to `.skr` addresses

### 5.3 Seed Vault optimized UX
- Detect Seed Vault availability
- Show "Secured by Seed Vault" badge
- Biometric confirmation messaging in transaction flows

---

## Phase 6: Pre-Launch & dApp Store Submission
*Priority: HIGH — When features are done*

### 6.1 Build configuration
- Configure `eas.json` for EAS Build (production profile)
- Set up signing keystore for Android release APK
- Build release APK: `eas build --platform android --profile production`

### 6.2 dApp Store preparation
- Create publisher account at Solana Mobile Publisher Portal
- Prepare assets: app icon (512x512), screenshots (phone frames), feature graphic
- Write store description emphasizing: index fund creation, strategy discovery, Solana-native
- Privacy policy URL
- Support/contact URL

### 6.3 dApp Store submission
- Upload signed APK
- Connect publisher wallet (Phantom/Solflare)
- Sign on-chain transactions for metadata storage (~0.2 SOL)
- Submit for review (3-5 business days)

### 6.4 Google Play (optional, parallel)
- Same APK works
- Follow standard Google Play submission process
- Note: crypto apps have additional review requirements on Google Play

---

## Phase 7: Post-Launch
*Priority: LOW — After initial launch*

### 7.1 Push notifications
- Expo Notifications for: strategy alerts, rebalance events, deposit confirmations
- Backend webhook integration

### 7.2 Analytics
- Integrate analytics (similar to GA4 on web, but mobile-appropriate)
- Track: screen views, wallet connections, strategy interactions, deposits

### 7.3 Offline support
- Cache strategy list for offline browsing
- Queue actions for when connection returns

### 7.4 Widgets (Android)
- Portfolio value widget
- Top strategy performance widget

---

## Technical Decisions

### Why NOT Privy on mobile?
The web app uses Privy for auth. On mobile, MWA is the standard — it's what Seeker users expect, it integrates with Seed Vault, and it works with all Solana mobile wallets. Privy's React Native SDK exists but adds complexity without benefit on Seeker.

### Why custom Expo dev builds?
MWA uses Kotlin native modules. Expo Go cannot load custom native code. `expo run:android` compiles a custom dev client that includes MWA's native bridge.

### Why Victory Native for charts?
It uses Skia rendering (already installed: `@shopify/react-native-skia`), which gives 60fps chart animations. Recharts/Lightweight Charts are web-only.

### Service layer approach
Mirror the `axis-agent` service files but adapt for React Native:
- Same API endpoints and response types
- Replace browser-specific APIs (localStorage → AsyncStorage, fetch is the same)
- Share TypeScript types where possible

### Android-only (for now)
MWA is Android-only. iOS support would require a different wallet strategy (WalletConnect or Privy). Phase 1-6 targets Android + Seeker. iOS can be evaluated post-launch.

---

## Execution Order (Recommended)

```
Week 1:  Phase 1 (foundation) + Phase 2.5.1-2.5.2 (mobile API client gaps + caching)
Week 2:  Phase 2.1 (Discover) + Phase 2.2 (StrategyDetail)
Week 3:  Phase 2.3 (Create) + Phase 2.4 (Profile)
Week 4:  Phase 3 (on-chain) + Phase 2.5.3 (new backend endpoints: SIWS, push tokens)
Week 5:  Phase 4 (UX polish) + Phase 2.5.5 (push notification delivery)
Week 6:  Phase 5 (Seeker features) + Phase 6 (dApp Store submission)
```

---

## Files to Create/Modify

### New files needed (axis-mobile):
- `src/services/kagemusha.ts` — On-chain program client
- `src/services/usdc.ts` — USDC balance queries
- `src/services/cache.ts` — In-memory + AsyncStorage caching utility
- `src/hooks/useBalance.ts` — SOL/token balance hook
- `src/hooks/useStrategies.ts` — Strategy data fetching
- `src/hooks/useUserPositions.ts` — User position tracking
- `src/hooks/useSession.ts` — SIWS session management
- `src/components/common/SkeletonLoader.tsx` — Loading states
- `src/components/common/TransactionStatus.tsx` — Tx confirmation UI
- `src/components/common/EmptyState.tsx` — Empty list placeholders
- `polyfill.ts` — Crypto polyfills (import first)
- `eas.json` — EAS Build configuration

### New files needed (axis-api — backend):
- `src/routes/mobile.ts` — Mobile-specific routes (SIWS, device tokens, deep links)
- `src/middleware/mobile-auth.ts` — Bearer token session middleware
- D1 migration for `device_tokens` table

### Files to modify (axis-mobile):
- `index.ts` — Add polyfill imports at top
- `app.json` — Bundle IDs, dark theme, plugins, scheme, deep link scheme
- `package.json` — Add `react-native-quick-crypto`, `expo-web-browser`, build scripts
- `src/services/api.ts` — Add missing calls (signAsFeePayer, dflow, caching)
- `src/context/WalletContext.tsx` — Fix cluster to devnet, add auth token caching
- `src/config/constants.ts` — Add RPC_URL, confirm API_BASE prod URL
- All screen files — Wire up to real APIs and on-chain data

### Files to modify (axis-api — backend):
- `src/app.ts` — Mount new `/mobile` routes
- `src/config/env.ts` — Add FCM_SERVER_KEY binding type
- `src/routes/webhook.ts` — Add push notification triggers
- `../pnpm-workspace.yaml` — Add `axis-mobile` to workspace
