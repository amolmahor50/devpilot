// Privileged Electron entry points and local operating-system APIs.
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { execFile } from 'node:child_process'
import { createConnection, createServer } from 'node:net'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
// Local persistence, port-owner discovery, PTY execution, and process-tree cleanup.
import find from 'find-process'
import * as pty from 'node-pty'
import treeKill from 'tree-kill'
import { fileURLToPath } from 'node:url'
// Shared IPC data contracts; no main-process implementation is exposed to the UI.
import type { Project, ProjectConfig, PortStatus } from '../shared/types'

const DEFAULT_PROJECT_PORT = 5173
const currentDir = fileURLToPath(new URL('.', import.meta.url))
const nodeRequire = createRequire(import.meta.url)
const Store = nodeRequire('electron-store').default as typeof import('electron-store').default
const isDevelopment = !app.isPackaged
const store = new Store<{ projects: ProjectConfig[] }>({
    name: 'devpilot',
    encryptionKey: 'devpilot-local-config-v1',
    defaults: { projects: [] }
})
const processes = new Map<string, pty.IPty>()
const browserOpenRequests = new Map<string, symbol>()
const serverOutputBuffers = new Map<string, string>()
const reservedProjectPorts = new Set<number>()
const projectPorts = new Map<string, number>()
let mainWindow: BrowserWindow | null = null

function storedProjects(): ProjectConfig[] {
    return store.get('projects')
}

function statusOf(project: ProjectConfig): Project {
    const proc = processes.get(project.id)
    return {
        ...project,
        status: proc ? 'running' : 'stopped',
        pid: proc?.pid
    }
}

function emitStatus(project: Project): void {
    mainWindow?.webContents.send('project:status', project)
}

function emitProjectNotice(projectId: string, message: string): void {
    mainWindow?.webContents.send('project:notice', { projectId, message })
}

function isDevPilotRendererPort(port: number): boolean {
    const rendererUrl = process.env.ELECTRON_RENDERER_URL
    if (!rendererUrl) return false

    try {
        const parsed = new URL(rendererUrl)
        const rendererPort = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80))
        return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) && rendererPort === port
    } catch (error) {
        throw new Error(
            `Invalid Electron renderer URL: ${error instanceof Error ? error.message : 'invalid URL'}`
        )
    }
}

function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs

    return new Promise((resolve) => {
        const attempt = () => {
            if (Date.now() >= deadline) {
                resolve(false)
                return
            }

            const tryHost = (hosts: string[], index: number) => {
                const socket = createConnection({ port, host: hosts[index] })
                let settled = false
                const finish = (ready: boolean) => {
                    if (settled) return
                    settled = true
                    socket.destroy()
                    if (ready) resolve(true)
                    else if (index + 1 < hosts.length) tryHost(hosts, index + 1)
                    else setTimeout(attempt, 350)
                }

                socket.setTimeout(500)
                socket.once('connect', () => finish(true))
                socket.once('timeout', () => finish(false))
                socket.once('error', () => finish(false))
            }

            tryHost(['127.0.0.1', '::1'], 0)
        }

        attempt()
    })
}

async function openProjectInBrowser(project: ProjectConfig, requestId: symbol): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    if (browserOpenRequests.get(project.id) !== requestId) return

    let targetUrl = ''
    const outputUrl = findLocalServerUrl(serverOutputBuffers.get(project.id) ?? '')
    if (project.port) {
        targetUrl = outputUrl?.url ?? `http://localhost:${project.port}`
        const ready = await waitForPort(outputUrl?.port ?? project.port, 120_000)
        if (!ready) {
            if (browserOpenRequests.get(project.id) !== requestId) return
            emitProjectNotice(
                project.id,
                `Project did not respond on port ${outputUrl?.port ?? project.port} within 120 seconds. Check its start command and port.`
            )
            return
        }
    } else if (project.baseUrl && /^https?:\/\//i.test(project.baseUrl)) {
        targetUrl = project.baseUrl
    } else {
        emitProjectNotice(
            project.id,
            'Project started. Set its local port in project settings to open it automatically.'
        )
        return
    }

    await openBrowserTarget(project.id, requestId, targetUrl)
}

async function openBrowserTarget(projectId: string, requestId: symbol, targetUrl: string): Promise<void> {
    if (browserOpenRequests.get(projectId) !== requestId) return
    const parsedUrl = new URL(targetUrl)
    if (isDevPilotRendererPort(Number(parsedUrl.port || 80))) {
        throw new Error('Refusing to open DevPilot’s own renderer instead of the project app.')
    }
    browserOpenRequests.delete(projectId)
    await shell.openExternal(targetUrl)
}

function findLocalServerUrl(output: string): { url: string; port: number } | undefined {
    const matches = output.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d{1,5})?/gi)
    if (!matches) return undefined

    for (const match of matches) {
        try {
            const parsed = new URL(match)
            const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80))
            if (port < 1 || port > 65535) continue
            if (isDevPilotRendererPort(port)) continue
            parsed.hostname = 'localhost'
            return { url: parsed.toString(), port }
        } catch {
            continue
        }
    }
    return undefined
}

function getProject(id: string): ProjectConfig {
    const project = storedProjects().find((item) => item.id === id)
    if (!project) throw new Error('Project not found.')
    return project
}

function validProject(project: ProjectConfig): ProjectConfig {
    const path = project.path.trim()
    const name = project.name.trim()
    const command = project.command.trim()
    if (!name || !path || !command) throw new Error('Project name, path, and command are required.')
    if (!existsSync(path)) throw new Error('The selected project folder does not exist.')
    const envFile = project.envFile?.trim() || '.env'
    const envKey = project.envKey?.trim() || 'VITE_API_BASE_URL'
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envKey)) throw new Error('Invalid environment variable name.')
    const envPath = resolve(path, envFile)
    const envRelativePath = relative(path, envPath)
    if (
        isAbsolute(envFile) ||
        envRelativePath === '..' ||
        envRelativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    ) {
        throw new Error('Environment file must be inside the project folder.')
    }
    if (
        project.port !== undefined &&
        (!Number.isInteger(project.port) || project.port < 1 || project.port > 65535)
    ) {
        throw new Error('Port must be an integer between 1 and 65535.')
    }
    return { ...project, name, path, command, envFile, envKey }
}

function readBaseUrl(project: ProjectConfig): string {
    const key = project.envKey || 'VITE_API_BASE_URL'
    const filePath = resolve(project.path, project.envFile || '.env')
    if (!existsSync(filePath)) return ''
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const assignment = new RegExp(`^\\s*(?:export\\s+)?${escapedKey}\\s*=\\s*(.*?)\\s*(?:#.*)?$`)
    for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
        const match = line.match(assignment)
        if (match) return match[1].replace(/^(['"])(.*)\1$/, '$2')
    }
    return ''
}

function detectCommand(projectPath: string): string {
    const packagePath = join(projectPath, 'package.json')
    if (!existsSync(packagePath)) return 'npm run dev'
    let manifest: {
        scripts?: Record<string, unknown>
        dependencies?: Record<string, unknown>
        devDependencies?: Record<string, unknown>
    }
    try {
        manifest = JSON.parse(readFileSync(packagePath, 'utf8')) as typeof manifest
    } catch (error) {
        throw new Error(
            `Could not read package.json: ${error instanceof Error ? error.message : 'invalid JSON'}`
        )
    }
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies }
    const isNextProject =
        dependencies.next ||
        Object.values(manifest.scripts ?? {}).some(
            (script) => typeof script === 'string' && /\bnext\s+(dev|start)\b/.test(script)
        )
    const scriptCandidates = isNextProject ? ['start', 'dev', 'serve'] : ['dev', 'start', 'serve']
    const script = scriptCandidates.find((name) => typeof manifest.scripts?.[name] === 'string')
    if (!script) return 'npm run dev'
    const manager = existsSync(join(projectPath, 'pnpm-lock.yaml'))
        ? 'pnpm'
        : existsSync(join(projectPath, 'yarn.lock'))
          ? 'yarn'
          : existsSync(join(projectPath, 'bun.lockb')) || existsSync(join(projectPath, 'bun.lock'))
            ? 'bun'
            : 'npm'
    return `${manager} run ${script}`
}

type ProjectFramework = 'vite' | 'next' | 'react-scripts' | 'angular' | 'nuxt' | 'unknown'

function detectFramework(projectPath: string): ProjectFramework {
    const packagePath = join(projectPath, 'package.json')
    if (!existsSync(packagePath)) return 'unknown'

    let manifest: {
        scripts?: Record<string, unknown>
        dependencies?: Record<string, unknown>
        devDependencies?: Record<string, unknown>
    }
    try {
        manifest = JSON.parse(readFileSync(packagePath, 'utf8')) as typeof manifest
    } catch (error) {
        throw new Error(
            `Could not read package.json: ${error instanceof Error ? error.message : 'invalid JSON'}`
        )
    }

    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies }
    const scripts = Object.values(manifest.scripts ?? {}).filter(
        (script): script is string => typeof script === 'string'
    )
    if (dependencies.next || scripts.some((script) => /\bnext\s+(dev|start)\b/.test(script))) return 'next'
    if (dependencies['react-scripts'] || scripts.some((script) => /\breact-scripts\b/.test(script)))
        return 'react-scripts'
    if (dependencies.vite || scripts.some((script) => /\bvite\b/.test(script))) return 'vite'
    if (dependencies['@angular/cli'] || scripts.some((script) => /\bng\s+serve\b/.test(script)))
        return 'angular'
    if (dependencies.nuxt || scripts.some((script) => /\bnuxt\s+(dev|start)\b/.test(script))) return 'nuxt'
    return 'unknown'
}

function commandForPort(command: string, port: number, framework: ProjectFramework): string {
    if (!['vite', 'next', 'angular', 'nuxt'].includes(framework)) return command

    const portArgument = /(--port(?:=|\s+)|-p\s+)\d+/
    if (portArgument.test(command)) {
        return command.replace(portArgument, (_argument, prefix: string) => `${prefix}${port}`)
    }
    if (/\b(?:npm|pnpm)\s+run\b/.test(command)) {
        return command.includes(' -- ') ? `${command} --port ${port}` : `${command} -- --port ${port}`
    }
    return `${command} --port ${port}`
}

async function isPortAvailable(port: number): Promise<boolean> {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port.')
    const canBindHost = (host: string) =>
        new Promise<boolean>((resolve, reject) => {
            const server = createServer()
            server.once('error', (error: NodeJS.ErrnoException) => {
                if (error.code === 'EADDRINUSE') resolve(false)
                else reject(error)
            })
            server.listen(port, host, () => server.close((error) => (error ? reject(error) : resolve(true))))
        })
    const availability = await Promise.all([canBindHost('127.0.0.1'), canBindHost('::1')])
    return availability.every(Boolean)
}

async function findAvailablePort(startingPort: number): Promise<number> {
    for (let port = startingPort; port <= Math.min(startingPort + 999, 65535); port += 1) {
        if (reservedProjectPorts.has(port) || isDevPilotRendererPort(port)) continue
        if (!(await isPortAvailable(port)) || reservedProjectPorts.has(port)) continue
        if (isDevPilotRendererPort(port)) continue
        reservedProjectPorts.add(port)
        return port
    }
    throw new Error(
        `No available port found between ${startingPort} and ${Math.min(startingPort + 999, 65535)}.`
    )
}

function releaseProjectPort(projectId: string): void {
    const port = projectPorts.get(projectId)
    if (port !== undefined) reservedProjectPorts.delete(port)
    projectPorts.delete(projectId)
}

async function checkPort(port: number): Promise<PortStatus> {
    const available = await isPortAvailable(port)
    if (available) return { available, port }
    const matches = await find('port', port).catch(() => [])
    const match = matches.find((item) => typeof item.pid === 'number' && item.pid !== process.pid)
    return {
        available,
        port,
        pid: match?.pid,
        processName: match?.name
    }
}

function setProjectError(project: ProjectConfig, error: string): void {
    emitStatus({ ...project, status: 'error', error })
}

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 920,
        minWidth: 1050,
        minHeight: 680,
        backgroundColor: '#0b0d12',
        title: 'DevPilot',
        webPreferences: {
            preload: join(currentDir, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    })
    if (isDevelopment && process.env.ELECTRON_RENDERER_URL) {
        void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
        void mainWindow.loadFile(join(currentDir, '../renderer/index.html'))
    }
    mainWindow.on('closed', () => {
        mainWindow = null
    })
}

ipcMain.handle('projects:list', () => storedProjects().map(statusOf))
ipcMain.handle('projects:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Choose a project folder'
    })
    if (result.canceled || !result.filePaths[0]) return null
    const path = result.filePaths[0]
    return {
        id: randomUUID(),
        name: basename(path),
        path,
        command: detectCommand(path),
        port: DEFAULT_PROJECT_PORT,
        envFile: '.env',
        envKey: 'VITE_API_BASE_URL',
        baseUrl: readBaseUrl({
            id: '',
            name: basename(path),
            path,
            command: '',
            envFile: '.env',
            envKey: 'VITE_API_BASE_URL'
        })
    } satisfies ProjectConfig
})
ipcMain.handle('projects:add', (_event, input: ProjectConfig) => {
    const validated = validProject(input)
    const project = { ...validated, baseUrl: validated.baseUrl ?? readBaseUrl(validated) }
    if (storedProjects().some((item) => item.path.toLowerCase() === project.path.toLowerCase())) {
        throw new Error('This project folder is already in DevPilot.')
    }
    store.set('projects', [...storedProjects(), project])
    return storedProjects().map(statusOf)
})
ipcMain.handle('projects:update', (_event, input: ProjectConfig) => {
    const project = validProject(input)
    store.set(
        'projects',
        storedProjects().map((item) => (item.id === project.id ? project : item))
    )
    return storedProjects().map(statusOf)
})
ipcMain.handle('projects:remove', async (_event, id: string) => {
    getProject(id)
    if (processes.has(id)) {
        const result = await stopProject(id)
        if (!result.ok) throw new Error(`Could not stop the project before removing it: ${result.message}`)
    }
    store.set(
        'projects',
        storedProjects().filter((item) => item.id !== id)
    )
    return storedProjects().map(statusOf)
})
ipcMain.handle('process:start', async (_event, id: string) => {
    let project = getProject(id)
    if (processes.has(id)) {
        const requestId = browserOpenRequests.get(id)
        if (requestId) {
            void openProjectInBrowser(project, requestId).catch((error: unknown) => {
                const message =
                    error instanceof Error ? error.message : 'Could not open the project in your browser.'
                emitProjectNotice(project.id, message)
            })
        }
        return { ok: true }
    }
    if (!existsSync(project.path)) throw new Error('The project folder no longer exists.')
    const availablePort = await findAvailablePort(DEFAULT_PROJECT_PORT)
    projectPorts.set(id, availablePort)
    if (availablePort !== project.port) {
        project = { ...project, port: availablePort }
        store.set(
            'projects',
            storedProjects().map((item) => (item.id === id ? project : item))
        )
    }
    emitStatus({ ...project, status: 'starting' })
    try {
        serverOutputBuffers.delete(id)
        const framework = detectFramework(project.path)
        const isWindows = process.platform === 'win32'
        const shellPath = isWindows ? process.env.ComSpec || 'cmd.exe' : process.env.SHELL || '/bin/bash'
        const processEnv = Object.fromEntries(
            Object.entries(process.env).filter(
                (entry): entry is [string, string] => typeof entry[1] === 'string'
            )
        )
        processEnv.PORT = String(availablePort)
        const proc = pty.spawn(shellPath, isWindows ? ['/Q'] : ['-i'], {
            name: 'xterm-256color',
            cols: 100,
            rows: 30,
            cwd: project.path,
            env: processEnv,
            // The bundled ConPTY avoids AttachConsole failures from node-pty's cleanup helper in Electron.
            ...(isWindows ? { useConptyDll: true } : {})
        })
        const requestId = Symbol(project.id)
        browserOpenRequests.set(project.id, requestId)
        processes.set(id, proc)
        proc.onExit(({ exitCode }) => {
            processes.delete(id)
            serverOutputBuffers.delete(id)
            releaseProjectPort(id)
            browserOpenRequests.delete(id)
            emitStatus({
                ...project,
                status: exitCode === 0 ? 'stopped' : 'error',
                error: exitCode ? `Process exited with code ${exitCode}.` : undefined
            })
        })
        proc.onData((data) => {
            const output = `${serverOutputBuffers.get(id) ?? ''}${data}`.slice(-4096)
            serverOutputBuffers.set(id, output)
            const server = findLocalServerUrl(output)
            if (!server) return

            if (project.port !== server.port) {
                const reservedPort = projectPorts.get(id)
                if (reservedProjectPorts.has(server.port) && reservedPort !== server.port) {
                    emitProjectNotice(
                        id,
                        `The project tried to use port ${server.port}, which is already assigned to another project.`
                    )
                    return
                }
                if (reservedPort !== undefined) reservedProjectPorts.delete(reservedPort)
                reservedProjectPorts.add(server.port)
                projectPorts.set(id, server.port)
                project = { ...project, port: server.port }
                store.set(
                    'projects',
                    storedProjects().map((item) => (item.id === id ? project : item))
                )
                emitStatus({ ...project, status: 'running', pid: proc.pid })
            }

            void openBrowserTarget(id, requestId, server.url).catch((error: unknown) => {
                const message =
                    error instanceof Error ? error.message : 'Could not open the project in your browser.'
                emitProjectNotice(id, message)
            })
        })
        const command = detectCommand(project.path)
        proc.write(`${commandForPort(command, availablePort, framework)}\r`)
        emitStatus({ ...project, status: 'running', pid: proc.pid })
        void openProjectInBrowser(project, requestId).catch((error: unknown) => {
            const message =
                error instanceof Error ? error.message : 'Could not open the project in your browser.'
            emitProjectNotice(project.id, message)
        })
        return { ok: true }
    } catch (error) {
        releaseProjectPort(id)
        const message = error instanceof Error ? error.message : 'Unable to start the project.'
        setProjectError(project, message)
        return { ok: false, message }
    }
})

function stopProject(id: string): Promise<{ ok: boolean; message?: string }> {
    browserOpenRequests.delete(id)
    const proc = processes.get(id)
    if (!proc) {
        releaseProjectPort(id)
        return Promise.resolve({ ok: true })
    }
    return new Promise((resolve) => {
        treeKill(proc.pid, 'SIGINT', (error) => {
            processes.delete(id)
            releaseProjectPort(id)
            serverOutputBuffers.delete(id)
            try {
                proc.kill()
            } catch {
                /* The process may already have exited. */
            }
            const project = storedProjects().find((item) => item.id === id)
            if (project) emitStatus({ ...project, status: 'stopped' })
            resolve(error ? { ok: false, message: error.message } : { ok: true })
        })
    })
}

ipcMain.handle('process:stop', (_event, id: string) => stopProject(id))
ipcMain.handle('ports:check', (_event, port: number) => checkPort(port))
ipcMain.handle('ports:stop-process', async (_event, port: number) => {
    const status = await checkPort(port)
    if (status.available) return { ok: true, message: `Port ${port} is already available.` }
    if (!status.pid) return { ok: false, message: 'Could not safely identify the process using this port.' }
    if (status.pid === process.pid) return { ok: false, message: 'Refusing to stop the DevPilot process.' }
    await new Promise<void>((resolve, reject) =>
        treeKill(status.pid!, 'SIGINT', (error) => (error ? reject(error) : resolve()))
    )
    return { ok: true, message: `Sent an interrupt signal to ${status.processName || `PID ${status.pid}`}.` }
})
ipcMain.handle('env:set-base-url', (_event, id: string, value: string) => {
    const project = getProject(id)
    const filePath = resolve(project.path, project.envFile || '.env')
    const key = (project.envKey || 'VITE_API_BASE_URL').trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error('Invalid environment variable name.')
    if (/[\r\n]/.test(value)) throw new Error('Base URL cannot contain line breaks.')
    const original = existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''
    const lines = original.split(/\r?\n/)
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const assignment = new RegExp(`^(\\s*(?:export\\s+)?${escapedKey}\\s*=\\s*)(.*)$`)
    let updated = false
    // Rewrite only the configured assignment while retaining its quote style, spacing, and comment.
    const next = lines.map((line) => {
        const match = line.match(assignment)
        if (!match) return line
        updated = true
        const rawValue = match[2]
        let quoteState = ''
        let commentStart = -1
        for (let index = 0; index < rawValue.length; index += 1) {
            const character = rawValue[index]
            if (character === '\\' && quoteState === '"' && index + 1 < rawValue.length) {
                index += 1
            } else if (
                (character === '"' || character === "'") &&
                (!quoteState || quoteState === character)
            ) {
                quoteState = quoteState ? '' : character
            } else if (character === '#' && !quoteState) {
                commentStart = index
                break
            }
        }
        const valueAndSpace = commentStart < 0 ? rawValue : rawValue.slice(0, commentStart)
        const comment = commentStart < 0 ? '' : rawValue.slice(commentStart)
        const trailingSpace = valueAndSpace.match(/\s*$/)?.[0] ?? ''
        const oldValue = valueAndSpace.slice(0, valueAndSpace.length - trailingSpace.length)
        const quote = oldValue.match(/^(['"]).*\1$/s)?.[1] ?? ''
        const escapedValue = quote ? value.replaceAll(quote, `\\${quote}`) : value
        return `${match[1]}${quote}${escapedValue}${quote}${trailingSpace}${comment}`
    })
    if (!updated) {
        if (!original) next[0] = `${key}=${value}`
        else if (original.endsWith('\n')) next.splice(next.length - 1, 0, `${key}=${value}`)
        else next.push(`${key}=${value}`)
    }
    const newline = original.includes('\r\n') ? '\r\n' : '\n'
    writeFileSync(filePath, next.join(newline), 'utf8')
    store.set(
        'projects',
        storedProjects().map((item) => (item.id === id ? { ...item, baseUrl: value } : item))
    )
    return { ok: true }
})
ipcMain.handle('projects:open-vscode', async (_event, id: string) => {
    const project = getProject(id)
    const executablePaths = [
        process.env.LOCALAPPDATA &&
            join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'),
        process.env.ProgramFiles && join(process.env.ProgramFiles, 'Microsoft VS Code', 'Code.exe'),
        process.env['ProgramFiles(x86)'] &&
            join(process.env['ProgramFiles(x86)'], 'Microsoft VS Code', 'Code.exe')
    ].filter((path): path is string => Boolean(path))
    const executablePath = executablePaths.find(existsSync)

    if (executablePath) {
        await new Promise<void>((resolve, reject) => {
            execFile(executablePath, ['--new-window', project.path], { windowsHide: true }, (error) => {
                if (error) reject(new Error(`Could not open VS Code: ${error.message}`))
                else resolve()
            })
        })
        return
    }

    const pathSegments = project.path.replace(/\\/g, '/').split('/')
    const encodedPath = pathSegments
        .map((segment, index) =>
            index === 0 && /^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment)
        )
        .join('/')
    try {
        await shell.openExternal(`vscode://file/${encodedPath}?windowId=_blank`)
    } catch (error) {
        const detail = error instanceof Error ? error.message : 'VS Code URI handler is unavailable.'
        throw new Error(
            `Could not open VS Code. Install VS Code or repair its folder registration. ${detail}`
        )
    }
})
app.whenReady().then(() => {
    createWindow()
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})
let isQuitting = false
app.on('before-quit', (event) => {
    if (isQuitting || processes.size === 0) return
    event.preventDefault()
    isQuitting = true
    void Promise.all([...processes.keys()].map((id) => stopProject(id))).finally(() => app.quit())
})
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
