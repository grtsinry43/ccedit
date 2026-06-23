/**
 * Header / Footer — the two chrome rows that frame every screen.
 * Title on the left, status on the right, no boxes (cc uses the
 * same — a coloured rule, not a border).
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../theme.js';
import { Byline } from './Byline.js';

interface HeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  width: number;
}

export function Header({ title, subtitle, right, width }: HeaderProps) {
  const { colors: c } = useTheme();
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color={c.accent}>{title}</Text>
        {right !== undefined && (typeof right === 'string' || typeof right === 'number'
          ? <Text color={c.inactive}>{right}</Text>
          : <>{right}</>)}
      </Box>
      {subtitle && (
        <Box>
          <Text color={c.inactive} dimColor>{subtitle}</Text>
        </Box>
      )}
      <Text color={c.subtle}>{'─'.repeat(width)}</Text>
    </Box>
  );
}

interface FooterProps {
  hints: React.ReactNode[];
  status?: React.ReactNode;
  width: number;
}

export function Footer({ hints, status, width }: FooterProps) {
  const { colors: c } = useTheme();
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={c.subtle}>{'─'.repeat(width)}</Text>
      <Box justifyContent="space-between">
        <Byline>{hints}</Byline>
        {status !== undefined && (typeof status === 'string' || typeof status === 'number'
          ? <Text color={c.inactive}>{status}</Text>
          : <>{status}</>)}
      </Box>
    </Box>
  );
}
