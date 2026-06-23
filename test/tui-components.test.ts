import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ConfirmDialog } from '../packages/tui/src/components/ConfirmDialog.js';
import { KeyboardShortcutHint } from '../packages/tui/src/components/KeyboardShortcutHint.js';
import { Byline } from '../packages/tui/src/components/Byline.js';
import { Divider } from '../packages/tui/src/components/Divider.js';
import { ListItem } from '../packages/tui/src/components/ListItem.js';
import { MultiLineTextInput } from '../packages/tui/src/components/MultiLineTextInput.js';
import { Toast } from '../packages/tui/src/components/Toast.js';
import { truncate, visibleWidth, flatten, wrapText } from '../packages/tui/src/glyphs.js';

describe('TUI Components', () => {
  describe('ConfirmDialog', () => {
    it('renders the title and main question', () => {
      const { lastFrame } = render(
        React.createElement(ConfirmDialog, {
          message: 'Delete 5 messages?',
          width: 100,
          onConfirm: () => {},
          onCancel: () => {},
        }),
      );
      const output = lastFrame();
      expect(output).toContain('confirm deletion');
      expect(output).toContain('Delete 5 messages?');
    });

    it('shows affected files when provided', () => {
      const { lastFrame } = render(
        React.createElement(ConfirmDialog, {
          message: 'Delete messages?',
          affectedFiles: ['/src/App.tsx', '/src/utils.ts'],
          sideEffectCount: 2,
          width: 100,
          onConfirm: () => {},
          onCancel: () => {},
        }),
      );
      const output = lastFrame();
      expect(output).toContain('App.tsx');
      expect(output).toContain('utils.ts');
      expect(output).toContain('side effects');
    });
  });

  describe('Design primitives', () => {
    it('KeyboardShortcutHint renders shortcut and action', () => {
      const { lastFrame } = render(
        React.createElement(KeyboardShortcutHint, { shortcut: 'enter', action: 'save' }),
      );
      const output = lastFrame();
      expect(output).toContain('enter');
      expect(output).toContain('save');
    });

    it('Byline separates children with middle dot', () => {
      const { lastFrame } = render(
        React.createElement(Byline, null,
          React.createElement(KeyboardShortcutHint, { shortcut: 'a', action: 'one' }),
          React.createElement(KeyboardShortcutHint, { shortcut: 'b', action: 'two' }),
        ),
      );
      const output = lastFrame();
      expect(output).toContain('one');
      expect(output).toContain('two');
      expect(output).toMatch(/·/);
    });

    it('Divider renders plain rule when no title', () => {
      const { lastFrame } = render(React.createElement(Divider, { width: 20 }));
      const output = lastFrame();
      expect(output.length).toBeGreaterThan(0);
    });

    it('Divider renders centred title', () => {
      const { lastFrame } = render(React.createElement(Divider, { width: 30, title: 'hi' }));
      const output = lastFrame();
      expect(output).toContain('hi');
    });

    it('ListItem shows pointer when focused', () => {
      const { lastFrame } = render(
        React.createElement(ListItem, { isFocused: true }, 'hello'),
      );
      const output = lastFrame();
      expect(output).toContain('hello');
      expect(output).toMatch(/❯/);
    });

    it('ListItem shows check when selected', () => {
      const { lastFrame } = render(
        React.createElement(ListItem, { isFocused: false, isSelected: true }, 'x'),
      );
      expect(lastFrame()).toMatch(/✓/);
    });
  });

  describe('Glyphs utilities', () => {
    it('visibleWidth counts CJK as 2 columns', () => {
      expect(visibleWidth('abc')).toBe(3);
      expect(visibleWidth('你好')).toBe(4);
      expect(visibleWidth('hi 你')).toBe(5);
    });

    it('truncate respects column budget and appends ellipsis', () => {
      const t = truncate('hello world', 7);
      expect(visibleWidth(t)).toBeLessThanOrEqual(7);
      expect(t.endsWith('…')).toBe(true);
    });

    it('flatten collapses whitespace', () => {
      expect(flatten('a\n\n b\t  c')).toBe('a b c');
    });

    it('wrapText hard-breaks overlong words', () => {
      const lines = wrapText('aaaaaaaaaa', 4);
      expect(lines).toEqual(['aaaa', 'aaaa', 'aa']);
    });

    it('wrapText splits on whitespace when possible', () => {
      // 'hello' = 5 cols + ' ' = 6 cols, 'hello world' = 11 > 8 so we
      // break before adding 'world'. The trailing space rides with
      // the line it precedes; on visual reflow that's the convention
      // the editor's cursor uses too.
      const lines = wrapText('hello world foo', 8);
      expect(lines).toEqual(['hello ', 'world ', 'foo']);
    });
  });

  describe('MultiLineTextInput', () => {
    function setup(initial: string) {
      const changes: string[] = [];
      const submits: string[] = [];
      const utils = render(
        React.createElement(MultiLineTextInput, {
          value: initial,
          onChange: (v: string) => { changes.push(v); },
          onSubmit: (v: string) => { submits.push(v); },
          width: 20,
        }),
      );
      return {
        changes, submits,
        stdin: utils.stdin,
        lastFrame: () => utils.stdout.lastFrame() ?? '',
      };
    }

    it('renders the value across wrapped lines', () => {
      const { lastFrame } = setup('hello world foo bar');
      const out = lastFrame();
      expect(out).toContain('hello');
      expect(out).toContain('world');
      expect(out).toContain('bar');
    });

    it('renders placeholder when value is empty', () => {
      const utils = render(
        React.createElement(MultiLineTextInput, {
          value: '',
          onChange: () => {},
          onSubmit: () => {},
          width: 30,
          placeholder: 'type here',
        }),
      );
      expect(utils.stdout.lastFrame() ?? '').toContain('type here');
    });

    it('Enter submits without changing the value', () => {
      const { submits, changes, stdin } = setup('hello');
      stdin.write('\r');
      expect(submits).toEqual(['hello']);
      expect(changes).toEqual([]);
    });
  });

  describe('Toast', () => {
    it('renders nothing when toast is null', () => {
      const { lastFrame } = render(React.createElement(Toast, { toast: null }));
      expect(lastFrame().trim()).toBe('');
    });

    it('renders the level icon + message', () => {
      const { lastFrame } = render(React.createElement(Toast, {
        toast: { level: 'warn', message: 'something', ttlMs: 0 },
      }));
      expect(lastFrame()).toContain('something');
    });
  });
});
