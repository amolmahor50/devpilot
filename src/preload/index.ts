// Expose typed IPC methods only; raw Electron and Node capabilities remain private.
import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopAPI, Project, ProjectConfig } from '../shared/types'

const api: DesktopAPI = {
  listProjects: () => ipcRenderer.invoke('projects:list'),
  chooseProject: () => ipcRenderer.invoke('projects:choose'),
  addProject: (project: ProjectConfig) => ipcRenderer.invoke('projects:add', project),
  removeProject: (id: string) => ipcRenderer.invoke('projects:remove', id),
  updateProject: (project: ProjectConfig) => ipcRenderer.invoke('projects:update', project),
  startProject: (id: string) => ipcRenderer.invoke('process:start', id),
  stopProject: (id: string) => ipcRenderer.invoke('process:stop', id),
  checkPort: (port: number) => ipcRenderer.invoke('ports:check', port),
  stopPortProcess: (port: number) => ipcRenderer.invoke('ports:stop-process', port),
  setBaseUrl: (id: string, value: string) => ipcRenderer.invoke('env:set-base-url', id, value),
  openProjectFolder: (id: string) => ipcRenderer.invoke('projects:open-folder', id),
  openUrl: (url: string) => ipcRenderer.invoke('app:open-url', url),
  onProjectStatus: (callback: (project: Project) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, project: Project) => callback(project)
    ipcRenderer.on('project:status', listener)
    return () => ipcRenderer.removeListener('project:status', listener)
  },
  onProjectNotice: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { projectId: string; message: string }) =>
      callback(payload)
    ipcRenderer.on('project:notice', listener)
    return () => ipcRenderer.removeListener('project:notice', listener)
  },
  onTerminalData: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { projectId: string; data: string }) =>
      callback(payload)
    ipcRenderer.on('terminal:data', listener)
    return () => ipcRenderer.removeListener('terminal:data', listener)
  },
  writeTerminal: (id, data) => ipcRenderer.send('terminal:write', id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal:resize', id, cols, rows)
}

contextBridge.exposeInMainWorld('electronAPI', api)
