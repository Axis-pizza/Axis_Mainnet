/**
 * Axis Brand Color System — Reddish Copper-Bronze × Void Black
 *
 * Single source of truth for all TypeScript-driven color values.
 * CSS classes (Tailwind) are controlled via @theme in src/index.css.
 *
 * Concept: 18K Rose-Gold / Forge-Bronze on deep void black.
 * The gold is warm orange-red — like a copper ingot, NOT yellow or mustard.
 *
 * Core accent: #C77D36 = rgb(199, 125, 54)
 * Specular highlight: #F4DFBE — pale champagne where light hits the top edge
 * Deep shadow: #6B3716 — reddish-brown like aged mahogany
 */

// ─── Sand Scale (Backgrounds & Neutrals) ────────────────────────────────────
// Slightly warmer than pure grey — gives the void a faint amber warmth
export const sand = {
  1: '#090705',   // App background — near-void, faint warm tint
  2: '#100d0a',   // Card background
  3: '#181410',   // Elevated surface (modals, headers)
  4: '#211b16',   // Subtle interactive
  5: '#2a2218',   // Hover state
  6: '#33291e',   // Active state
  7: '#3e3228',   // Subtle border
  8: '#4e4035',   // Border
  9: '#665548',   // Placeholder / disabled
  10: '#7a6858',  // Muted text (MC, VOL labels)
  11: '#b8a898',  // Secondary text — readable
  12: '#eeddd0',  // Primary text — warm cream
} as const;

// ─── Axis Gold Scale (18K Rose-Gold / Copper-Bronze) ─────────────────────────
// Hue: warm orange-red — like freshly poured copper, NOT yellow-gold.
// rgb(199, 125, 54) = #C77D36 — our rgba base
export const gold = {
  // Deep shadow / void zone
  950: '#1A0A04',  // Void with ember warmth — for glow halos & deep bgs
  900: '#2D1408',  // Very dark warm bg
  800: '#4A230F',  // Dark reddish-brown — shadow edge
  700: '#6B3716',  // Deep copper shadow — border, divider
  // Accent range
  600: '#8E4D1F',  // Dark bronze — button fill, pressed state
  500: '#B0652B',  // Heavy rich bronze — hover state
  400: '#C77D36',  // AXIS GOLD — 18K Rose-Bronze main accent ★
  300: '#D9A05B',  // Satin copper — secondary accent
  200: '#E8C28A',  // Warm gold — badge text on dark bg
  100: '#F4DFBE',  // Champagne highlight edge
  50:  '#FCF6EC',  // Bright champagne — specular peak
} as const;

// ─── Emerald Scale (Success) ─────────────────────────────────────────────────
export const emerald = {
  9: '#30a46c',   // Success solid
  11: '#4cc38a',  // Success text on dark
  12: '#adf0d4',  // Very light success
} as const;

// ─── Red Scale (Danger) ──────────────────────────────────────────────────────
export const red = {
  9: '#e54d2e',   // Danger solid
  11: '#ff6369',  // Danger text on dark
  12: '#ffd1d9',  // Very light danger
} as const;

// ─── Blue (Balanced Strategy) ────────────────────────────────────────────────
export const blue = {
  solid: '#3b82f6',
  text: '#bfdbfe',
} as const;

// ─── Semantic Tokens ─────────────────────────────────────────────────────────
export const colors = {
  // App backgrounds
  bg: sand[1],            // '#090705'
  bgCard: sand[2],        // '#100d0a'
  bgElevated: sand[3],    // '#181410'
  bgInteractive: sand[4], // '#211b16'
  bgHover: sand[5],       // '#2a2218'

  // Borders
  borderSubtle: sand[7],  // '#3e3228'
  border: sand[8],        // '#4e4035'

  // Text
  textPrimary: sand[12],    // '#eeddd0'
  textSecondary: sand[11],  // '#b8a898'
  textMuted: sand[10],      // '#7a6858'
  textDisabled: sand[9],    // '#665548'

  // Axis Gold accent (18K Rose-Bronze)
  accentSolid: gold[400],     // '#C77D36' — main CTA
  accentHover: gold[500],     // '#B0652B' — hover
  accentText: gold[400],      // '#C77D36' — text on dark
  accentTextLight: gold[200], // '#E8C28A' — badge/label text on dark
  accentLight: gold[100],     // '#F4DFBE' — specular highlight
  accentBgDark: gold[800],    // '#4A230F' — dark bg for gold containers
  accentBorder: gold[700],    // '#6B3716' — border for gold elements

  // Success (Emerald)
  successSolid: emerald[9],  // '#30a46c'
  successText: emerald[11],  // '#4cc38a'
  successLight: emerald[12], // '#adf0d4'

  // Danger (Red)
  dangerSolid: red[9],    // '#e54d2e'
  dangerText: red[11],    // '#ff6369'
  dangerLight: red[12],   // '#ffd1d9'
} as const;

// ─── Strategy Type Colors ─────────────────────────────────────────────────────
export const strategyTypeColors = {
  AGGRESSIVE: {
    tailwind:
      'text-amber-200 border-amber-500/30 bg-amber-500/10 shadow-[0_0_15px_rgba(199,125,54,0.22)]',
    hex: gold[400],
    hexLight: gold[200],
  },
  BALANCED: {
    tailwind:
      'text-blue-200 border-blue-500/30 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.2)]',
    hex: blue.solid,
    hexLight: blue.text,
  },
  CONSERVATIVE: {
    tailwind:
      'text-emerald-200 border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_15px_rgba(48,164,108,0.2)]',
    hex: emerald[9],
    hexLight: emerald[12],
  },
} as const;

export type StrategyType = keyof typeof strategyTypeColors;

// ─── Chart Colors ─────────────────────────────────────────────────────────────
export const chartColors = {
  positive: emerald[11],              // '#4cc38a'
  negative: red[11],                  // '#ff6369'
  positiveArea: 'rgba(48, 164, 108, 0.3)',
  negativeArea: 'rgba(229, 77, 46, 0.3)',
  accent: gold[400],                  // '#C77D36'
  grid: 'rgba(199, 125, 54, 0.05)',
  crosshair: 'rgba(199, 125, 54, 0.4)',
  textMuted: sand[10],                // '#7a6858'
} as const;

// ─── Pizza / Pie Chart Slices ─────────────────────────────────────────────────
export const pizzaSliceColors = [
  gold[400],   // '#C77D36' — Axis Rose-Bronze
  gold[700],   // '#6B3716' — Deep Copper
  '#9f1239',   // Wine Red
  '#15803d',   // Deep Green
  gold[600],   // '#8E4D1F' — Dark Bronze
  sand[4],     // '#211b16' — Dark Neutral
  '#be123c',   // Raspberry
  '#0f766e',   // Deep Teal
] as const;

// ─── Toast Notification Colors ───────────────────────────────────────────────
export const toastColors = {
  success: `bg-[${sand[2]}] border-emerald-500/30`,
  error: `bg-[${sand[2]}] border-red-500/30`,
  info: `bg-[${sand[2]}] border-[rgba(199,125,54,0.28)]`,
} as const;

// rgba helper for Axis Gold (#C77D36 = rgb(199, 125, 54))
export const goldRgba = (opacity: number) => `rgba(199, 125, 54, ${opacity})`;
