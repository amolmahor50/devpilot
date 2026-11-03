export type ProjectStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface Project {
    id: string
    name: string
    path: string
    command: string
    port?: number
    order?: number
    envFile?: string
    envKey?: string
    baseUrl?: string
    status: ProjectStatus
    pid?: number
    error?: string
}

export type ProjectConfig = Omit<Project, 'status' | 'pid' | 'error'>

export interface PortStatus {
    available: boolean
    port: number
    processName?: string
    pid?: number
}

export interface DesktopAPI {
    listProjects: () => Promise<Project[]>
    chooseProject: () => Promise<ProjectConfig | null>
    addProject: (project: ProjectConfig) => Promise<Project[]>
    removeProject: (id: string) => Promise<Project[]>
    updateProject: (project: ProjectConfig) => Promise<Project[]>
    startProject: (id: string) => Promise<{ ok: boolean; message?: string; portStatus?: PortStatus }>
    stopProject: (id: string) => Promise<{ ok: boolean; message?: string }>
    checkPort: (port: number) => Promise<PortStatus>
    stopPortProcess: (port: number) => Promise<{ ok: boolean; message?: string }>
    setBaseUrl: (id: string, value: string) => Promise<{ ok: boolean; message?: string }>
    openProjectInVSCode: (id: string) => Promise<void>
    onProjectStatus: (callback: (project: Project) => void) => () => void
    onProjectNotice: (callback: (event: { projectId: string; message: string }) => void) => () => void
}

declare global {
    interface Window {
        electronAPI: DesktopAPI
    }
}

export type CreateAccountProps = {
    name: string
    email: string
    password: string
}
