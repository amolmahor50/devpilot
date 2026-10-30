import { useState } from 'react'
import {
    Check,
    ExternalLink,
    FolderOpen,
    LoaderCircle,
    Plus,
    Power,
    Search,
    Square,
    Trash2,
    X
} from 'lucide-react'
import type { Project, ProjectConfig } from '../../shared/types'
import { useProjects } from './hooks/useProjects'

function ProjectCard({
    project,
    busy,
    selected,
    onSelect,
    onStart,
    onStop,
    onRemove,
    onOpenBrowser,
    onOpenFolder,
    onSave,
    onMessage
}: {
    project: Project
    busy: boolean
    selected: boolean
    onSelect: () => void
    onStart: () => void
    onStop: () => void
    onRemove: () => void
    onOpenBrowser: () => void
    onOpenFolder: () => void
    onSave: (project: ProjectConfig) => Promise<void>
    onMessage: (message: string) => void
}) {
    const [urlDraft, setUrlDraft] = useState(project.baseUrl ?? '')
    const [saving, setSaving] = useState(false)
    const isRunning = project.status === 'running'
    const isStarting = project.status === 'starting'
    const statusBadgeClass =
        project.status === 'running'
            ? 'bg-green-500/10 text-green-700'
            : project.status === 'error'
              ? 'bg-red-500/10 text-red-700'
              : project.status === 'starting'
                ? 'bg-amber-500/10 text-amber-700'
                : 'bg-red-500/10 text-red-700'
    const statusDotClass =
        project.status === 'running'
            ? 'bg-green-500'
            : project.status === 'error'
              ? 'bg-red-500'
              : project.status === 'starting'
                ? 'animate-pulse bg-amber-500'
                : 'bg-red-500'
    const inputId = `base-url-${project.id}`

    const saveBaseUrl = async () => {
        const value = urlDraft.trim()
        setSaving(true)
        try {
            const result = await window.electronAPI.setBaseUrl(project.id, value)
            if (!result.ok) throw new Error(result.message)
            await onSave({ ...project, baseUrl: value })
            onMessage('Base URL saved to environment file.')
        } catch (error) {
            onMessage(error instanceof Error ? error.message : 'Could not update environment file.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <article className="flex h-full min-w-0 flex-col rounded-2xl bg-secondary p-4 text-foreground transition duration-200 hover:bg-muted/70 sm:p-5">
            <div className="flex items-start justify-between gap-3">
                <button
                    type="button"
                    aria-pressed={selected}
                    onClick={onSelect}
                    className="flex min-w-0 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                    <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold tracking-tight text-foreground">
                            {project.name}
                        </span>
                        <span
                            className="mt-1 block truncate font-mono text-[11px] text-muted-foreground"
                            title={project.path}
                        >
                            {project.path}
                        </span>
                    </span>
                </button>
                <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusBadgeClass}`}
                >
                    <span className={`size-1.5 rounded-full ${statusDotClass}`} />
                    {project.status}
                </span>
            </div>

            <div className="mt-4 border-t border-border/70 pt-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor={inputId}>
                        Environment URL
                    </label>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                        {project.envKey || 'VITE_API_BASE_URL'}
                    </span>
                </div>
                <div className="flex min-w-0 gap-2">
                    <input
                        id={inputId}
                        className="h-8 w-full min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 py-1 font-mono text-xs text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        value={urlDraft}
                        onChange={(event) => setUrlDraft(event.target.value)}
                        placeholder="https://api.example.com"
                    />
                    <button
                        type="button"
                        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-input bg-background px-2.5 font-mono text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                        disabled={saving || urlDraft.trim() === (project.baseUrl ?? '')}
                        onClick={() => void saveBaseUrl()}
                    >
                        {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
                        Save
                    </button>
                </div>
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/70 pt-4">
                {isRunning ? (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onStop}
                        className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                    >
                        {busy ? (
                            <LoaderCircle size={14} className="animate-spin" />
                        ) : (
                            <Square size={12} fill="currentColor" />
                        )}
                        Stop
                    </button>
                ) : (
                    <button
                        type="button"
                        disabled={busy || isStarting}
                        onClick={onStart}
                        className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                    >
                        {busy || isStarting ? (
                            <LoaderCircle size={14} className="animate-spin" />
                        ) : (
                            <Power size={14} />
                        )}
                        {isStarting ? 'Starting…' : 'Start'}
                    </button>
                )}
                <button
                    type="button"
                    onClick={onOpenFolder}
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2"
                    title="Open project in VS Code"
                    aria-label={`Open ${project.name} in VS Code`}
                >
                    <FolderOpen size={15} />
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={onRemove}
                    className="inline-flex size-9 items-center justify-center rounded-lg border bg-background border-transparent text-red-600 transition-colors hover:border-red-200 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                    title="Remove project"
                    aria-label={`Remove ${project.name} from DevPilot`}
                >
                    <Trash2 size={15} />
                </button>
                {(project.port || project.baseUrl) && (
                    <button
                        type="button"
                        onClick={onOpenBrowser}
                        className="ml-auto inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        <ExternalLink size={14} />
                        Open app
                    </button>
                )}
            </div>
        </article>
    )
}

function BrandMark() {
    return (
        <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary to-chart-3 text-white shadow-sm">
            <svg aria-hidden="true" viewBox="0 0 40 40" className="size-7">
                <path
                    d="M12 9.5h8.2c6.3 0 10.3 4.1 10.3 10.5s-4 10.5-10.3 10.5H12V9.5Zm5 4.3v12.4h3.1c3.4 0 5.3-2.2 5.3-6.2s-1.9-6.2-5.3-6.2H17Z"
                    fill="currentColor"
                />
                <circle cx="30.5" cy="10" r="2" fill="currentColor" opacity=".8" />
            </svg>
        </span>
    )
}

function App() {
    const [search, setSearch] = useState('')
    const {
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
    } = useProjects(search)
    const runningCount = projects.filter((project) => project.status === 'running').length

    return (
        <div className="flex min-h-screen min-w-0 flex-col bg-background font-sans text-foreground">
            <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur">
                <div className="mx-auto flex h-[68px] w-full max-w-[1800px] items-center justify-between px-4 sm:px-6 lg:px-10">
                    <div className="flex items-center gap-3">
                        <BrandMark />
                        <div>
                            <p className="text-[17px] font-bold leading-5 tracking-tight">DevPilot</p>
                            <p className="mt-0.5 text-[11px] font-medium tracking-wide text-muted-foreground">
                                LOCAL DEVELOPMENT
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground">
                        <span className="size-2 rounded-full bg-green-500" />
                        {runningCount} running
                    </div>
                </div>
            </header>

            <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-7 px-4 py-7 sm:px-6 sm:py-9 lg:gap-9 lg:px-10">
                <section className="flex flex-col items-stretch justify-between gap-5 sm:flex-row sm:items-end">
                    <div>
                        <p className="text-xs font-semibold uppercase text-primary">Your workspace</p>
                        <h1 className="mt-1.5 text-xl font-bold tracking-tight sm:text-2xl">
                            Everything in one place.
                        </h1>
                        <p className="max-w-xl leading-5 text-muted-foreground text-sm sm:leading-6">
                            Launch your projects, manage environment URLs, and jump straight into your work.
                        </p>
                    </div>
                    <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:gap-3">
                        {projects.length > 0 && (
                            <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-input bg-card px-3 text-muted-foreground transition focus-within:border-ring focus-within:ring-1 focus-within:ring-ring sm:w-64 sm:flex-none">
                                <Search size={16} className="shrink-0" />
                                <input
                                    className="h-8 w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Search projects…"
                                    aria-label="Search projects"
                                />
                            </label>
                        )}
                        <button
                            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2"
                            onClick={() => void addProject()}
                        >
                            <Plus size={16} />
                            <span className="hidden sm:inline">Add project</span>
                            <span className="sm:hidden">Add</span>
                        </button>
                    </div>
                </section>

                {filteredProjects.length > 0 && (
                    <section aria-label="Projects">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {filteredProjects.map((project) => (
                                <ProjectCard
                                    key={project.id}
                                    project={project}
                                    selected={project.id === activeProjectId}
                                    busy={busyProjectId === project.id}
                                    onSelect={() => setActiveProject(project.id)}
                                    onStart={() => void startProject(project)}
                                    onStop={() => void stopProject(project)}
                                    onRemove={() => void removeProject(project)}
                                    onOpenBrowser={() => void openInBrowser(project)}
                                    onOpenFolder={() => void openInVSCode(project)}
                                    onSave={saveProject}
                                    onMessage={announce}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {projects.length > 0 && filteredProjects.length === 0 && (
                    <section className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 text-center">
                        <Search size={22} className="text-muted-foreground" />
                        <h2 className="mt-3 text-base font-semibold">No projects found</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Try another project name or folder path.
                        </p>
                    </section>
                )}

                {projects.length === 0 && (
                    <section className="flex min-h-[360px] flex-1 flex-col items-center justify-center rounded-2xl bg-secondary/60 px-8 text-center">
                        <BrandMark />
                        <h2 className="mt-5 text-xl font-semibold">Your workspace is ready</h2>
                        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                            Add a project folder to launch its development server and manage its environment
                            right here.
                        </p>
                        <button
                            className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2"
                            onClick={() => void addProject()}
                        >
                            <Plus size={16} />
                            Add your first project
                        </button>
                    </section>
                )}
            </main>

            {notice && (
                <div
                    role="status"
                    className="fixed bottom-5 right-5 z-40 max-w-md rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground shadow-lg"
                >
                    <div className="flex items-center gap-3">
                        <span className="flex-1">{notice}</span>
                        <button
                            className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            onClick={() => setNotice('')}
                            aria-label="Dismiss notification"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default App
