/**
 * Axis Brand Color System — Mobile port of axis-agent/src/theme/colors.ts
 * Single source of truth for all color values.
 *
 * Core accent: #C77D36 = 18K Rose-Bronze (NOT yellow gold)
 */

import { Platform } from 'react-native';

// ─── Sand Scale (Backgrounds & Neutrals) ─────────────────────────────────────
export const sand = {
  1:  '#090705',   // App background — near-void
  2:  '#100d0a',   // Card background
  3:  '#181410',   // Elevated surface (modals, headers)
  4:  '#211b16',   // Subtle interactive
  5:  '#2a2218',   // Hover state
  6:  '#33291e',   // Active state
  7:  '#3e3228',   // Subtle border
  8:  '#4e4035',   // Border
  9:  '#665548',   // Placeholder / disabled
  10: '#7a6858',   // Muted text
  11: '#b8a898',   // Secondary text
  12: '#eeddd0',   // Primary text — warm cream
} as const;

// ─── Axis Gold Scale (18K Rose-Gold / Copper-Bronze) ─────────────────────────
export const gold = {
  950: '#1A0A04',
  900: '#2D1408',
  800: '#4A230F',
  700: '#6B3716',
  600: '#8E4D1F',
  500: '#B0652B',
  400: '#C77D36',   // AXIS GOLD — 18K Rose-Bronze main accent ★
  300: '#D9A05B',
  200: '#E8C28A',
  100: '#F4DFBE',
  50:  '#FCF6EC',
} as const;

// ─── Semantic Colors ──────────────────────────────────────────────────────────
export const colors = {
  // App backgrounds
  background:    sand[1],   // '#090705'
  bgCard:        sand[2],   // '#100d0a'
  bgElevated:    sand[3],   // '#181410'
  bgInteractive: sand[4],   // '#211b16'

  // Aliases kept for backward compat with existing components
  backgroundSecondary: sand[3],
  backgroundTertiary:  sand[4],
  surface:      sand[2],
  surfaceLight: sand[4],

  // Borders
  borderSubtle: sand[7],
  border:       sand[8],
  borderLight:  'rgba(199,125,54,0.1)',

  // Text
  text:          sand[12],  // '#eeddd0'
  textSecondary: sand[11],  // '#b8a898'
  textMuted:     sand[10],  // '#7a6858'
  textDisabled:  sand[9],   // '#665548'
  textDim:       sand[10],

  // Axis Gold accent
  accent:          gold[400],  // '#C77D36' — main CTA
  accentSolid:     gold[400],
  accentHover:     gold[500],
  accentLight:     gold[100],
  accentDark:      gold[800],
  accentBronze:    gold[600],
  accentHighlight: gold[200],
  accentBgDark:    gold[800],
  accentBorder:    gold[700],

  // Status
  positive:     '#4cc38a',
  negative:     '#ff6369',
  successSolid: '#30a46c',
  dangerSolid:  '#e54d2e',
  info:         '#3b82f6',

  // Strategy types
  aggressive:   gold[400],
  balanced:     '#3b82f6',
  conservative: '#30a46c',
} as const;

// ─── Strategy Type Colors ─────────────────────────────────────────────────────
export const strategyTypeColors = {
  AGGRESSIVE: {
    hex:      gold[400],
    hexLight: gold[200],
    bg:       'rgba(199,125,54,0.1)',
    border:   'rgba(199,125,54,0.3)',
    text:     gold[400],
  },
  BALANCED: {
    hex:      '#3b82f6',
    hexLight: '#bfdbfe',
    bg:       'rgba(59,130,246,0.1)',
    border:   'rgba(59,130,246,0.3)',
    text:     '#3b82f6',
  },
  CONSERVATIVE: {
    hex:      '#30a46c',
    hexLight: '#adf0d4',
    bg:       'rgba(48,164,108,0.1)',
    border:   'rgba(48,164,108,0.3)',
    text:     '#30a46c',
  },
} as const;

export type StrategyType = keyof typeof strategyTypeColors;

// ─── Chart Colors ─────────────────────────────────────────────────────────────
export const chartColors = {
  positive:     '#4cc38a',
  negative:     '#ff6369',
  positiveArea: 'rgba(48,164,108,0.3)',
  negativeArea: 'rgba(229,77,46,0.3)',
  accent:       gold[400],
  grid:         'rgba(199,125,54,0.05)',
} as const;

// ─── Pizza / Pie Chart Slices ─────────────────────────────────────────────────
export const pizzaSliceColors = [
  gold[400],   // '#C77D36'
  gold[700],   // '#6B3716'
  '#9f1239',
  '#15803d',
  gold[600],   // '#8E4D1F'
  sand[4],     // '#211b16'
  '#be123c',
  '#0f766e',
] as const;

// rgba helper
export const goldRgba = (opacity: number) => `rgba(199,125,54,${opacity})`;

// Serif font — matches Times New Roman on web
export const serifFont = Platform.OS === 'ios' ? 'Georgia' : 'serif';
