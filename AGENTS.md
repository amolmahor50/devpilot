# DevPilot engineering standards

This is the canonical, always-on instruction set for every AI coding agent working anywhere in this repository. Provider-specific instruction files must point here instead of defining competing standards. Preserve these rules when adding folders or components.

## Communication and permissions

- Communicate with the user in English, regardless of the user's language or which agent/provider is active.
- Never run a Git command, including read-only status or diff commands, unless the user explicitly authorizes that specific Git operation first.
- Never install, update, remove, or restore a package unless the user explicitly authorizes that specific package operation first. Do not use package runners that download tools.
- Never open, search, log, print, parse, or otherwise inspect `.env` or other secret-bearing environment files as an agent. Never expose or upload their contents. Runtime application behavior specifically authorized by the user is separate.
- Never push, publish, or upload files to GitHub or another remote. Do not create commits without explicit permission.
- Keep secrets, credentials, local state, dependency directories, caches, and generated build output out of source control.
- When a requested action requires permission, ask first and wait. Do not treat general task intent as permission to violate these restrictions.

## Senior engineering workflow

- Before editing, inspect the relevant source, configuration, and documentation; check the existing conventions and consumers. Do not inspect secret files.
- Make complete, focused changes that address the root cause. Preserve unrelated work and existing behavior; do not make speculative or unrelated refactors.
- Prefer clear, small, cohesive modules and existing helpers. Keep changes type-safe; avoid `any`, unsafe casts, silent fallbacks, and broad exception swallowing.
- Surface actionable errors. Validate untrusted input at process and IPC boundaries. Keep security boundaries explicit.
- Add or update tests when behavior changes and update directly related documentation. Validate with existing project scripts and already-installed tooling. Ask before running Git or package-manager commands.
- Format changed source with Prettier and run ESLint and type checks when their dependencies are installed. Never claim a validation passed unless its command completed successfully.
- Add comments for meaningful module boundaries, non-obvious decisions, and logical section headers when they improve navigation. Do not add a comment to every import, trivial statement, or self-explanatory component.

## Folder ownership and file placement

Keep the established Electron process boundaries and place new files according to this layout:

```text
.
├── .agent/
│   └── rules/devpilot.md         # Antigravity rule adapter
├── .cursor/
│   └── rules/devpilot.mdc        # Cursor rule adapter
├── .github/
│   └── copilot-instructions.md   # GitHub Copilot adapter
├── .vscode/
│   ├── extensions.json           # Editor extension recommendations
│   └── settings.json             # Format-on-save and editor defaults
├── docs/
│   └── ARCHITECTURE.md           # System boundaries and file placement
├── src/
│   ├── main/
│   │   ├── index.ts              # Electron lifecycle, IPC, OS capabilities
│   │   └── types.d.ts            # Narrow third-party type declarations
│   ├── preload/
│   │   └── index.ts              # Typed contextBridge IPC surface
│   ├── renderer/
│   │   ├── index.html            # Renderer HTML entry
│   │   └── src/
│   │       ├── App.tsx           # Workspace and project settings
│   │       ├── Terminal.tsx      # xterm UI and PTY stream subscription
│   │       ├── main.tsx          # React renderer entry point
│   │       ├── store.ts          # Zustand project state
│   │       └── styles.css        # Tailwind entry, global defaults, xterm sizing
│   └── shared/
│       └── types.ts              # Cross-process contracts
├── .gitignore                    # Generated, local, and secret exclusions
├── .prettierignore               # Formatter exclusions
├── .prettierrc.json              # Shared formatting rules
├── AGENTS.md                     # Canonical rules for all repository agents
├── CLAUDE.md                     # Claude adapter to AGENTS.md
├── GEMINI.md                     # Gemini and Antigravity adapter to AGENTS.md
├── README.md                     # User setup and operation
├── electron.vite.config.ts       # Main, preload, and renderer build entries
├── eslint.config.mjs             # ESLint flat configuration
├── package.json                  # Scripts and declared dependencies
├── package-lock.json             # Reproducible npm dependency graph
├── postcss.config.cjs            # Tailwind and Autoprefixer
├── tailwind.config.js            # Renderer content scan and design tokens
├── tsconfig.json                 # Renderer and shared TypeScript settings
├── tsconfig.node.json            # Electron and build-config TypeScript settings
└── .windsurfrules                # Windsurf rule adapter
```

- Keep OS access, persistence, process lifecycle, and Electron IPC handlers in `src/main/`. Keep `src/preload/` limited to validated, purpose-specific APIs. Renderer modules must not import Electron, Node filesystem, or process APIs.
- Keep cross-process DTOs and API contracts in `src/shared/`; do not move renderer implementation into shared code.
- Group React components and their directly related UI code under `src/renderer/src/`. Split files when that improves cohesion, reuse, or testability, not just to reduce line count.
- Style React UI with Tailwind utility classes in component markup. Do not add application component selectors or page styling to `styles.css`; reserve it for Tailwind directives, global browser defaults, and third-party integrations that utilities cannot control.
- Put durable architecture, setup, and maintainer guidance in `docs/` and link to it from this file. Keep temporary plans and notes out of the repository.
- Put optional file-specific Copilot instructions in `.github/instructions/` with descriptive frontmatter and narrow `applyTo` patterns. Avoid duplicating this global policy.
- Keep generated files, dependencies, logs, local application data, and secrets excluded by `.gitignore`.

## Architecture and security invariants

- Preserve Electron `contextIsolation: true` and `nodeIntegration: false`. Never expose raw `ipcRenderer`, `fs`, `child_process`, or unrestricted Node capabilities to the renderer.
- Route renderer system operations through narrow preload functions with shared TypeScript contracts. Validate IPC arguments in the main process.
- Use `node-pty` for interactive project processes and `tree-kill` for process-tree shutdown. Never replace the PTY with `child_process.spawn`.
- When changing `.env` at runtime, retain unrelated lines, whitespace, quoting, line endings, and inline comments. Do not display or log environment file contents.
- Use explicit user confirmation before terminating unrelated processes or deleting project files.

## Formatting, linting, and validation

- Prettier is the source formatter; use `npm run format` for formatting and `npm run format:check` to verify formatting.
- ESLint is the source linter; use `npm run lint`. Fix violations in changed code rather than disabling rules broadly.
- Run `npm run typecheck` for both renderer and Electron TypeScript projects. Run `npm run check` for the combined lint, format, and typecheck checks.
- Build with `npm run build` when native dependencies are available. Do not hide native build failures or claim the app was launched unless it was.

## Documentation and dependencies

- Keep `README.md` focused on end-user setup and usage. Put architecture and contribution guidance in `docs/`.
- Change `package.json` and the lockfile together when adding or changing dependencies, and only after explicit user permission to install or modify packages.
- Prefer the smallest dependency set and use existing scripts. Do not introduce a second formatter, linter, or competing style source.
