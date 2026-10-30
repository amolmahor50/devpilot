import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Project, ProjectConfig } from '../../../shared/types'
import { useProjectStore } from '../store'

export function useProjects(search: string) {
    const projects = useProjectStore((state) => state.projects)
    const activeProjectId = useProjectStore((state) => state.activeProjectId)
    const setProjects = useProjectStore((state) => state.setProjects)
    const setActiveProject = useProjectStore((state) => state.setActiveProject)
    const updateProjectStatus = useProjectStore((state) => state.updateProjectStatus)
    const [notice, setNotice] = useState('')
    const [busyProjectId, setBusyProjectId] = useState<string | null>(null)
    const noticeTimeout = useRef<number | undefined>(undefined)

    const filteredProjects = useMemo(
        () =>
            projects.filter((project) =>
                `${project.name} ${project.path}`.toLowerCase().includes(search.trim().toLowerCase())
            ),
        [projects, search]
    )

    const announce = useCallback((message: string) => {
        setNotice(message)
        if (noticeTimeout.current !== undefined) window.clearTimeout(noticeTimeout.current)
        noticeTimeout.current = window.setTimeout(() => setNotice(''), 4500)
    }, [])

    useEffect(() => {
        void window.electronAPI
            .listProjects()
            .then(setProjects)
            .catch((error: Error) => announce(error.message))
        return window.electronAPI.onProjectStatus(updateProjectStatus)
    }, [announce, setProjects, updateProjectStatus])

    useEffect(() => window.electronAPI.onProjectNotice(({ message }) => announce(message)), [announce])

    useEffect(
        () => () => {
            if (noticeTimeout.current !== undefined) window.clearTimeout(noticeTimeout.current)
        },
        []
    )

    useEffect(() => {
        if (!activeProjectId && projects.length > 0) setActiveProject(projects[0].id)
    }, [activeProjectId, projects, setActiveProject])

    const addProject = async () => {
        try {
            const selected = await window.electronAPI.chooseProject()
            if (!selected) return
            setProjects(await window.electronAPI.addProject(selected))
            setActiveProject(selected.id)
        } catch (error) {
            announce(error instanceof Error ? error.message : 'Could not add project.')
        }
    }

    const startProject = async (project: Project) => {
        setBusyProjectId(project.id)
        try {
            const result = await window.electronAPI.startProject(project.id)
            if (!result.ok) announce(result.message ?? `Could not start ${project.name}.`)
        } catch (error) {
            announce(error instanceof Error ? error.message : `Could not start ${project.name}.`)
        } finally {
            setBusyProjectId(null)
        }
    }

    const stopProject = async (project: Project) => {
        setBusyProjectId(project.id)
        try {
            const result = await window.electronAPI.stopProject(project.id)
            if (!result.ok) announce(result.message ?? `Could not stop ${project.name}.`)
        } catch (error) {
            announce(error instanceof Error ? error.message : `Could not stop ${project.name}.`)
        } finally {
            setBusyProjectId(null)
        }
    }

    const removeProject = async (project: Project) => {
        const confirmed = window.confirm(
            `Remove "${project.name}" from DevPilot?\n\nThis won't delete any project files.${project.status === 'running' ? '\nThe running development server will be stopped.' : ''}`
        )
        if (!confirmed) return

        setBusyProjectId(project.id)
        try {
            const remainingProjects = await window.electronAPI.removeProject(project.id)
            setProjects(remainingProjects)
            setActiveProject(remainingProjects[0]?.id ?? null)
            announce(`${project.name} was removed from DevPilot.`)
        } catch (error) {
            announce(error instanceof Error ? error.message : `Could not remove ${project.name}.`)
        } finally {
            setBusyProjectId(null)
        }
    }

    const openInBrowser = async (project: Project) => {
        const url = project.port
            ? `http://localhost:${project.port}`
            : project.baseUrl && /^https?:\/\//i.test(project.baseUrl)
              ? project.baseUrl
              : null
        if (!url) {
            announce('Configure a local port or Base URL in project settings to open this project.')
            return
        }
        try {
            await window.electronAPI.openUrl(url)
        } catch (error) {
            announce(error instanceof Error ? error.message : 'Could not open URL in browser.')
        }
    }

    const openInVSCode = async (project: Project) => {
        try {
            await window.electronAPI.openProjectInVSCode(project.id)
        } catch (error) {
            announce(error instanceof Error ? error.message : 'Could not open project in VS Code.')
        }
    }

    const saveProject = async (project: ProjectConfig) => {
        setProjects(await window.electronAPI.updateProject(project))
    }

    return {
        projects,
        filteredProjects,
        activeProjectId,
        setActiveProject,
        busyProjectId,
        notice,
        setNotice,
        announce,
        addProject,
        startProject,
        stopProject,
        removeProject,
        openInBrowser,
        openInVSCode,
        saveProject
    }
}
