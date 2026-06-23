/**
 * Toast — transient notification pinned to the bottom of the screen.
 * Renders for `ttlMs` and then disappears. Mirrors cc's transient
 * notice behaviour: prominent but never modal, never blocks input.
 *
 * Single in-flight toast (latest wins). Host components should put
 * exactly one `<Toast>` near the bottom of their tree.
 */
import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../theme.js';
import { G } from '../glyphs.js';

export type ToastLevel = 'info' | 'warn' | 'error' | 'success';

export interface ToastState {
  level: ToastLevel;
  message: string;
  /** Auto-dismiss time. 0 = no auto-dismiss. */
  ttlMs?: number;
}

interface Props {
  toast: ToastState | null;
  onExpire?: () => void;
}

const ICON: Record<ToastLevel, string> = {
  info: '⏵',
  warn: G.warning,
  error: G.cross,
  success: G.tick,
};

export function Toast({ toast, onExpire }: Props) {
  const { colors: c } = useTheme();

  useEffect(() => {
    if (!toast) return;
    const ttl = toast.ttlMs ?? 2500;
    if (ttl <= 0) return;
    const t = setTimeout(() => onExpire?.(), ttl);
    return () => clearTimeout(t);
  }, [toast?.message, toast?.level, toast?.ttlMs]);

  if (!toast) return null;

  const colorByLevel = {
    info: c.accent,
    warn: c.warning,
    error: c.error,
    success: c.success,
  } as const;

  return (
    <Box paddingX={1}>
      <Box
        borderStyle="single"
        borderColor={colorByLevel[toast.level]}
        paddingX={1}
      >
        <Text color={colorByLevel[toast.level]} bold>
          {ICON[toast.level]} {toast.message}
        </Text>
      </Box>
    </Box>
  );
}
