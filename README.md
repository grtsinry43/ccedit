# Claude Code Session Editor (ccedit)

A TUI for browsing, selecting, and precisely editing Claude Code session history.

> **Note:** This project was written primarily by Claude (Anthropic's Claude
> Code / Opus), with direction and review from [@grtsinry43](https://github.com/grtsinry43).

## Features

- **Two-step flow** — pick a session first, then edit its messages
- **Auto-discovery** — finds the Claude sessions for the current directory
- **Precise message editing** — delete a specific debugging exchange while keeping the rest
- **Visual transcript** — message list with tool-call markers and timestamps
- **Side-effect detection** — flags messages that modified files
- **Safe deletion** — shows affected files before deleting, and keeps a backup
- **Atomic tool pairs** — deleting one half of a `tool_use ↔ tool_result` pair pulls in the other so the chain never orphans
- **Image stripping** — remove image attachments (including tool screenshots) so non-vision models stop erroring
- **Chain repair** — fixes broken `parentUuid` links

## Quick start

```bash
# Run the latest published version directly — no install needed
npx ccedit

# …or install it globally
npm install -g ccedit
ccedit
```

Run it from inside a project directory and it lists that project's sessions.

```bash
cd /path/to/your/project
ccedit                       # list sessions for this directory
ccedit <session-id>          # edit a specific session directly
ccedit -p /other/project     # point at a different project path
ccedit --repair              # repair a broken session chain
ccedit --help
```

Requires **Node.js >= 22**.

## Workflow

**1. Pick a session** — navigate with `↑↓`, open with `Enter`.

**2. Edit messages** — `Space` to select messages, `D` to delete the selection,
`I` to strip images, `W` to write changes to disk.

## Keybindings

### Session picker

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate sessions |
| `Enter` | Open the session |
| `Q` | Quit |

### Message editor

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate messages |
| `Space` | Select / deselect |
| `Enter` | Open details (or expand a sidechain group) |
| `E` | Edit message text |
| `D` | Delete the selection |
| `I` | Strip images (focused / selected / whole session) |
| `Ctrl+A` / `Ctrl+X` | Select all deletable / clear selection |
| `W` | Save and quit |
| `B` | Back to the session list |
| `Q` | Quit without saving |
| `Esc` | Close details / cancel |

### Text editor (when editing a message)

| Key | Action |
|-----|--------|
| `Enter` | Save |
| `Shift+Enter` / `Option+Enter` / `Ctrl+J` | Insert a newline |
| `↑↓←→` | Move the cursor |
| `Home` / `End` | Start / end of line |
| `Ctrl+A` / `Ctrl+E` | Start / end of input |
| `Esc` | Cancel |

`Shift+Enter` is only distinguishable in terminals that support the kitty
keyboard protocol (iTerm2, ghostty, kitty, WezTerm, …). Elsewhere use
`Option+Enter` or `Ctrl+J`.

## Notes

1. **Backups** — a `.bak` file is written before saving.
2. **Reload** — after editing, run `claude --resume` to reload the session.
3. **Side effects** — deleting a message that wrote files does **not** revert those files on disk.
4. **Chain** — use `--repair` to fix broken `parentUuid` chains.

## Development

This is a pnpm + Turborepo monorepo.

```
ccedit/
├── packages/
│   ├── core/     # parsing, serialization, pairing, repair, image-strip
│   ├── tui/      # React + Ink components and the CLI entry
│   └── shared/   # small utilities
└── scripts/
    └── package.cjs   # esbuild bundle → ./dist (publishable `ccedit` package)
```

```bash
pnpm install
pnpm run dev               # watch mode
pnpm run test:integration  # run the test suite
pnpm -w run build          # build all packages
pnpm run package           # bundle a publishable ./dist
```

### Publishing

`scripts/package.cjs` bundles the workspace into a single self-contained
`dist/ccedit.js` (with `ink`, `react`, and `commander` kept as external
runtime dependencies) and stages a ready-to-publish package in `./dist`:

```bash
pnpm run release
npm publish ./dist
```

## Tech stack

- **Runtime:** Node.js >= 22
- **TUI:** React 19 + Ink 7
- **Language:** TypeScript
- **Tooling:** pnpm workspaces, Turborepo, esbuild

## License

MIT
