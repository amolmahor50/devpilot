# DevPilot architecture and folder ownership

The root [`AGENTS.md`](../AGENTS.md) is the canonical engineering and agent policy. This document explains the application boundaries and where implementation belongs.

## Electron process boundaries

```text
Renderer (React UI)
    │ narrow, typed API
    ▼
Preload (contextBridge)
    │ validated IPC request
    ▼
Main (Electron + OS capabilities)
    │ shared DTOs and contracts
    └────────────── Shared types
```

- `src/main/` owns Electron lifecycle, project persistence, process management, filesystem operations, port checks, and IPC handlers.
- `src/preload/` exposes only purpose-specific, typed operations. Keep raw Electron IPC, Node APIs, and OS handles private.
- `src/renderer/` owns presentation, user interaction, xterm UI, and renderer state. It must not import privileged Node or Electron APIs.
- `src/shared/` contains contracts that can safely be imported by both main and preload/renderer code. Do not put runtime process-specific implementation here.

## Placement rules

- Add main-process feature logic under `src/main/`, keeping IPC handlers thin and validating IPC inputs before operating on the filesystem or OS.
- Add each renderer component near the UI feature it owns under `src/renderer/src/`. Extract reusable components when that improves cohesion or testability.
- Implement application UI styling with Tailwind utility classes in component markup. Keep `styles.css` limited to Tailwind directives, global defaults, and unavoidable third-party integration sizing.
- Add cross-process request, response, and model types under `src/shared/`.
- Keep build, lint, formatting, and TypeScript configuration in the repository root.
- Keep provider-specific AI instruction files as adapters to the root `AGENTS.md`; never fork or silently weaken the shared permission rules.
- Do not commit generated `out/`, dependency directories, local secrets, credentials, or user-specific state.

## Quality workflow

- `npm run format` applies the repository Prettier rules.
- `npm run lint` runs ESLint across the application and configuration.
- `npm run typecheck` checks renderer and Electron TypeScript projects.
- `npm run check` runs lint, format verification, and both type checks.
- `npm run build` creates the Electron main, preload, and renderer production bundles.
