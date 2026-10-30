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

function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs

    return new Promise((resolve) => {
        const attempt = () => {
            if (Date.now() >= deadline) {
                resolve(false)
                return
            }

            const socket = createConnection({ port, host: '127.0.0.1' })
            const finish = (ready: boolean) => {
                socket.destroy()
                if (ready) resolve(true)
                else setTimeout(attempt, 350)
            }

            socket.setTimeout(500)
            socket.once('connect', () => finish(true))
            socket.once('timeout', () => finish(false))
            socket.once('error', () => finish(false))
        }

        attempt()
    })
}

async function openProjectInBrowser(project: ProjectConfig): Promise<void> {
    let targetUrl = ''
    if (project.port) {
        targetUrl = `http://localhost:${project.port}`
        const ready = await waitForPort(project.port, 60_000)
        if (!ready) {
            emitProjectNotice(
                project.id,
                `Project did not respond on port ${project.port} within 60 seconds.`
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

    if (!processes.has(project.id)) return
    await shell.openExternal(targetUrl)
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

function detectPort(projectPath: string): number | undefined {
    const packagePath = join(projectPath, 'package.json')
    if (!existsSync(packagePath)) return undefined

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

    const scripts = Object.values(manifest.scripts ?? {}).filter(
        (script): script is string => typeof script === 'string'
    )
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies }

    if (dependencies.next || dependencies['react-scripts'] || dependencies.nuxt) return 3000
    if (dependencies.vite || scripts.some((script) => /\bvite\b/.test(script))) return 5173
    if (scripts.some((script) => /\bng\s+serve\b/.test(script))) return 4200

    return undefined
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
    return new Promise<boolean>((resolve, reject) => {
        const server = createServer()
        server.once('error', (error: NodeJS.ErrnoException) => {
            if (error.code === 'EADDRINUSE') resolve(false)
            else reject(error)
        })
        server.listen(port, '127.0.0.1', () =>
            server.close((error) => (error ? reject(error) : resolve(true)))
        )
    })
}

async function findAvailablePort(startingPort: number): Promise<number> {
    for (let port = startingPort; port <= Math.min(startingPort + 999, 65535); port += 1) {
        if (await isPortAvailable(port)) return port
    }
    throw new Error(
        `No available port found between ${startingPort} and ${Math.min(startingPort + 999, 65535)}.`
    )
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
        port: detectPort(path),
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
    if (processes.has(id)) return { ok: true }
    if (!existsSync(project.path)) throw new Error('The project folder no longer exists.')
    if (!project.port) {
        const detectedPort = detectPort(project.path)
        if (detectedPort) {
            project = { ...project, port: detectedPort }
            store.set(
                'projects',
                storedProjects().map((item) => (item.id === id ? project : item))
            )
        }
    }
    if (project.port) {
        const availablePort = await findAvailablePort(project.port)
        if (availablePort !== project.port) {
            project = { ...project, port: availablePort }
            store.set(
                'projects',
                storedProjects().map((item) => (item.id === id ? project : item))
            )
        }
    }
    emitStatus({ ...project, status: 'starting' })
    try {
        const framework = detectFramework(project.path)
        const isWindows = process.platform === 'win32'
        const shellPath = isWindows ? process.env.ComSpec || 'cmd.exe' : process.env.SHELL || '/bin/bash'
        const processEnv = Object.fromEntries(
            Object.entries(process.env).filter(
                (entry): entry is [string, string] => typeof entry[1] === 'string'
            )
        )
        if (project.port) processEnv.PORT = String(project.port)
        const proc = pty.spawn(shellPath, isWindows ? ['/Q'] : ['-i'], {
            name: 'xterm-256color',
            cols: 100,
            rows: 30,
            cwd: project.path,
            env: processEnv,
            // The bundled ConPTY avoids AttachConsole failures from node-pty's cleanup helper in Electron.
            ...(isWindows ? { useConptyDll: true } : {})
        })
        processes.set(id, proc)
        proc.onExit(({ exitCode }) => {
            processes.delete(id)
            emitStatus({
                ...project,
                status: exitCode === 0 ? 'stopped' : 'error',
                error: exitCode ? `Process exited with code ${exitCode}.` : undefined
            })
        })
        const command = detectCommand(project.path)
        proc.write(`${project.port ? commandForPort(command, project.port, framework) : command}\r`)
        emitStatus({ ...project, status: 'running', pid: proc.pid })
        void openProjectInBrowser(project).catch((error: unknown) => {
            const message =
                error instanceof Error ? error.message : 'Could not open the project in your browser.'
            emitProjectNotice(project.id, message)
        })
        return { ok: true }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to start the project.'
        setProjectError(project, message)
        return { ok: false, message }
    }
})

function stopProject(id: string): Promise<{ ok: boolean; message?: string }> {
    const proc = processes.get(id)
    if (!proc) return Promise.resolve({ ok: true })
    return new Promise((resolve) => {
        treeKill(proc.pid, 'SIGINT', (error) => {
            processes.delete(id)
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
ipcMain.handle('app:open-url', async (_event, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) {
        throw new Error('Only valid http and https URLs can be opened in the browser.')
    }
    await shell.openExternal(url.trim())
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
