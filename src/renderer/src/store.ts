// Renderer-only state for the project list, selection, and main-process status events.
import { create } from 'zustand'
import type { Project } from '../../shared/types'

function orderedProjects(projects: Project[]): Project[] {
    return projects
        .map((project, index) => ({ project, index }))
        .sort((a, b) => {
            if (a.project.order === undefined) return b.project.order === undefined ? a.index - b.index : 1
            if (b.project.order === undefined) return -1
            return a.project.order - b.project.order
        })
        .map(({ project }) => project)
}

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
            projects: orderedProjects(projects),
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
