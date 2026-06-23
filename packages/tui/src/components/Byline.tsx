/**
 * Byline — horizontal list of children joined by a middle dot.
 * cc uses this in footer hints; we use it for footer hint rows
 * and metadata bylines alike.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import { G } from '../glyphs.js';

interface BylineProps {
  children: React.ReactNode;
  dim?: boolean;
}

export function Byline({ children, dim = true }: BylineProps) {
  const arr = React.Children.toArray(children);
  return (
    <Box>
      {arr.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Text color={colors().inactive}> {G.bullet} </Text>}
          <Text dimColor={dim}>{child}</Text>
        </React.Fragment>
      ))}
    </Box>
  );
}
