// Renderer-only state for the project list, selection, and main-process status events.
import { create } from 'zustand'
import type { Project } from '../../shared/types'

interface ProjectStore {
    projects: Project[]
    activeProjectId: string | null
    setProjects: (projects: Project[]) => void
    setActiveProject: (id: string | null) => void
    updateProjectStatus: (project: Project) => void
}

export const useProjectStore = create<ProjectStore>((set) => ({
    projects: [],
    activeProjectId: null,
    setProjects: (projects) =>
        set((state) => ({
            projects,
            activeProjectId:
                state.activeProjectId && projects.some((project) => project.id === state.activeProjectId)
                    ? state.activeProjectId
                    : null
        })),
    setActiveProject: (activeProjectId) => set({ activeProjectId }),
    updateProjectStatus: (updated) =>
        set((state) => ({
            projects: state.projects.map((project) =>
                project.id === updated.id ? { ...project, ...updated } : project
            )
        }))
}))
