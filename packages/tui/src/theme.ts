/**
 * Theme — semantic color tokens resolved against the terminal's
 * perceived light/dark mode. Inspired by Claude Code's THEME system,
 * distilled to the keys ccedit actually needs.
 *
 * We do NOT paint backgrounds for emphasis; Ink's `backgroundColor`
 * renders poorly in most terminals and breaks layout. Instead we use
 * hue + weight to convey state.
 */

import { useEffect, useState } from 'react';

export type ThemeMode = 'dark' | 'light';

export interface SemanticColors {
  accent: string;       // primary highlight (replaces "blue" everywhere)
  suggestion: string;    // focused list item / pointer column
  success: string;       // checkmarks, ok results
  warning: string;       // side-effect markers, confirm dialog
  error: string;         // failed tool results, errors
  inactive: string;      // dimmed text, metadata
  subtle: string;        // very dim dividers
  text: string;          // default body text
  inverseText: string;   // text on accent background (rarely used)
}

const dark: SemanticColors = {
  accent: '#7aa2f7',          // soft blue
  suggestion: '#bb9af7',      // lavender (cc uses this for focused items)
  success: '#9ece6a',
  warning: '#e0af68',
  error: '#f7768e',
  inactive: '#565f89',
  subtle: '#3b4261',
  text: '#c0caf5',
  inverseText: '#1a1b26',
};

const light: SemanticColors = {
  accent: '#1f6feb',
  suggestion: '#7c3aed',
  success: '#1a7f37',
  warning: '#9a6700',
  error: '#cf222e',
  inactive: '#6e7781',
  subtle: '#d0d7de',
  text: '#1f2328',
  inverseText: '#ffffff',
};

const themes: Record<ThemeMode, SemanticColors> = { dark, light };

/**
 * Resolve the terminal's light/dark mode.
 *
 * Priority: $CCEDIT_THEME > $COLORFGBG (set by many terminals) > 'dark'.
 * The OSC 11 query path is overkill for a one-shot CLI tool.
 */
function detectMode(): ThemeMode {
  const env = process.env.CCEDIT_THEME;
  if (env === 'light' || env === 'dark') return env;
  const fgBg = process.env.COLORFGBG;
  if (fgBg) {
    // COLORFGBG is "fg;bg" with 0 = black, 15 = white. Light bg = bright number.
    const parts = fgBg.split(';');
    const bg = Number(parts[parts.length - 1]);
    if (!Number.isNaN(bg)) return bg >= 8 ? 'light' : 'dark';
  }
  return 'dark';
}

let cachedColors: SemanticColors | null = null;
let cachedMode: ThemeMode | null = null;

function getColors(): SemanticColors {
  const mode = detectMode();
  if (!cachedColors || cachedMode !== mode) {
    cachedColors = themes[mode];
    cachedMode = mode;
  }
  return cachedColors;
}

/** Synchronous theme access (for components that don't need reactivity). */
export function colors(): SemanticColors {
  return getColors();
}

/**
 * Reactive theme hook. Re-resolves on remount only — ccedit does not
 * need live re-theme; the user is unlikely to flip terminal mid-run.
 */
export function useTheme(): { mode: ThemeMode; colors: SemanticColors } {
  const [snapshot] = useState(() => {
    const mode = detectMode();
    return { mode, colors: themes[mode] };
  });
  return snapshot;
}
