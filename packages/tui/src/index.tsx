#!/usr/bin/env node

import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';
import App from './components/App.js';

const program = new Command();

program
  .name('ccsessed')
  .description('Claude Code Session Editor - TUI for precise session history editing')
  .version('1.0.0')
  .argument('[session-id]', 'Session ID to edit directly')
  .option('-p, --project <path>', 'Project path (default: current directory)')
  .option('-r, --repair', 'Repair message chain before opening')
  .action(async (sessionId, options) => {
    const projectPath = options.project || process.cwd();
    const { waitUntilExit } = render(
      React.createElement(App, {
        initialProjectPath: projectPath,
        initialSessionId: sessionId,
        repair: options.repair || false,
      }),
      // Opt into the kitty keyboard protocol so terminals that support it
      // (iTerm2, ghostty, kitty, WezTerm, …) can report Shift+Enter as a
      // distinct key for inserting a newline in the editor. 'auto' safely
      // probes the terminal and is a no-op where unsupported — Option+Enter
      // and Ctrl+J remain the cross-terminal newline fallbacks.
      { kittyKeyboard: { mode: 'auto' } },
    );
    await waitUntilExit();
  });

program.parse();
