# DevPilot

DevPilot is a local desktop control center for launching and monitoring multiple developer projects. It is built with Electron, React 18, TypeScript, Tailwind CSS, Zustand, and xterm.js.

The renderer uses Tailwind utility classes for its interface. `src/renderer/src/styles.css` is intentionally limited to Tailwind setup, global defaults, and xterm sizing.

## Requirements

- Node.js 20 or newer
- npm
- Windows, macOS, or Linux
- On Windows, Visual Studio Build Tools with the **Desktop development with C++** workload for the `node-pty` native module. Keep the checkout path free of spaces because `node-gyp` cannot rebuild native modules from paths containing spaces.

## Development

```sh
npm install
npm run dev
```

The first launch prompts you to add a project folder. Projects are shown as dashboard cards with direct Start and Stop controls; select a card to open its overview and terminal. DevPilot stores its project list in Electron's application data directory. Project files remain at their original locations.

## Project configuration

Use the project settings panel to configure the display name, interactive-shell command, expected local port, environment file path, and base URL key. When adding a folder, DevPilot detects the `dev`, `start`, or `serve` script in `package.json` and selects npm, pnpm, yarn, or bun from its lockfile. It also suggests the conventional Vite (5173), Next/React Scripts (3000), or Angular (4200) port when detectable. After starting, DevPilot waits for the configured local port to respond and opens it in your default browser. The fallback command is `npm run dev`; the environment file defaults to `.env`, and the URL key defaults to `VITE_API_BASE_URL`.

The environment switcher replaces only the selected assignment in place. Inline comments and unrelated environment lines are preserved. When the configured port is occupied, DevPilot reports the detected process; stopping that process is a separate, explicit action.

## Security and process behavior

- Renderer access to system functionality is limited to the typed APIs exposed by the preload script. Context isolation is enabled and Node integration is disabled.
- Project commands run in an interactive pseudo-terminal using `node-pty`, with output and input streamed through IPC.
- Stopping a project sends `SIGINT` to its process tree using `tree-kill`.
- Project settings are stored locally with Electron Store. The store encryption key in this application is a static local obfuscation key, not a substitute for OS-backed secret storage. Do not store credentials in project configuration.
- Commands are executed with the current user's permissions. Only add trusted project folders and commands.

## Build

```sh
npm run check
npm run typecheck
npm run build
```

`npm run check` runs ESLint, verifies Prettier formatting, and type-checks the renderer and Electron code. Use `npm run format` to apply formatting or `npm run lint` to run ESLint alone.
