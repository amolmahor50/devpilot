# DevPilot

DevPilot is a local desktop control center for launching and monitoring multiple developer projects. It is built with Electron, React 18, TypeScript, Tailwind CSS, and Zustand.

The renderer uses Tailwind utility classes for its interface. `src/renderer/src/styles.css` is intentionally limited to Tailwind setup and global browser defaults.

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

On first launch, add a project folder. Each project card includes Start and Stop controls, an environment URL editor, and an option to remove the project from DevPilot. Removing a project requires confirmation and does not delete its files. Starting a project opens its local app in your default browser when the configured port is ready. DevPilot stores its project list in Electron's application data directory. Project files remain at their original locations.

## Project configuration

When adding a folder, DevPilot detects the `dev`, `start`, or `serve` script in `package.json` and selects npm, pnpm, yarn, or bun from its lockfile. Next.js projects prefer `start` when that script exists; other projects prefer `dev`. It also suggests the conventional Vite (5173), Next/React Scripts (3000), or Angular (4200) port when detectable. If that port is already in use, DevPilot selects and saves the next available port, passes it to supported frameworks, then opens the app in your default browser when ready. The fallback command is `npm run dev`; commands run with the project folder as their working directory. The environment file defaults to `.env`, and the URL key defaults to `VITE_API_BASE_URL`.

The environment switcher replaces only the selected assignment in place. Inline comments and unrelated environment lines are preserved. When a configured port is occupied, DevPilot selects the next available port and uses it to start the project.

## Security and process behavior

- Renderer access to system functionality is limited to the typed APIs exposed by the preload script. Context isolation is enabled and Node integration is disabled.
- Project commands run in an interactive pseudo-terminal using `node-pty`.
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
