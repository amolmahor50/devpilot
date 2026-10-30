import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronDown,
  Command,
  ExternalLink,
  FolderOpen,
  Globe,
  LoaderCircle,
  Plus,
  Power,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  Terminal as TerminalIcon,
  Trash2,
  X
} from 'lucide-react'
import type { Project, ProjectConfig } from '../../shared/types'
import { useProjectStore } from './store'
import Terminal from './Terminal'

// Project dashboard and process controls with card-based grid and blue theme.
function App() {
  const projects = useProjectStore((state) => state.projects)
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const setProjects = useProjectStore((state) => state.setProjects)
  const setActiveProject = useProjectStore((state) => state.setActiveProject)
  const updateProjectStatus = useProjectStore((state) => state.updateProjectStatus)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null)
  const [projectPage, setProjectPage] = useState(0)

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null
  const runningCount = projects.filter((project) => project.status === 'running').length
  const filteredProjects = useMemo(
    () =>
      projects.filter((project) =>
        `${project.name} ${project.path}`.toLowerCase().includes(search.toLowerCase())
      ),
    [projects, search]
  )
  const projectsPerPage = 3
  const pageCount = Math.max(1, Math.ceil(filteredProjects.length / projectsPerPage))
  const currentPage = Math.min(projectPage, pageCount - 1)
  const visibleProjects = filteredProjects.slice(
    currentPage * projectsPerPage,
    currentPage * projectsPerPage + projectsPerPage
  )

  useEffect(() => {
    void window.electronAPI
      .listProjects()
      .then(setProjects)
      .catch((error: Error) => setNotice(error.message))
    return window.electronAPI.onProjectStatus(updateProjectStatus)
  }, [setProjects, updateProjectStatus])

  useEffect(() => window.electronAPI.onProjectNotice(({ message }) => setNotice(message)), [])

  const announce = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 4500)
  }

  const addProject = async () => {
    try {
      const selected = await window.electronAPI.chooseProject()
      if (!selected) return
      const updated = await window.electronAPI.addProject(selected)
      setProjects(updated)
      setActiveProject(selected.id)
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Could not add project.')
    }
  }

  const startProject = async (project: Project) => {
    setBusyProjectId(project.id)
    try {
      const result = await window.electronAPI.startProject(project.id)
      if (!result.ok) {
        const status = result.portStatus
        const description = status?.processName
          ? `${result.message} ${status.processName} (PID ${status.pid}) is using it.`
          : (result.message ?? `Could not start ${project.name}.`)
        const stop = status?.pid && window.confirm(`${description}\n\nStop that process and retry?`)
        if (stop) {
          const stopped = await window.electronAPI.stopPortProcess(status.port)
          if (!stopped.ok) throw new Error(stopped.message)
          await new Promise((resolve) => window.setTimeout(resolve, 600))
          const retried = await window.electronAPI.startProject(project.id)
          if (!retried.ok) throw new Error(retried.message)
        } else {
          announce(description)
        }
      }
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
    if (!window.confirm(`Remove ${project.name} from DevPilot? This does not delete project files.`)) return
    try {
      setProjects(await window.electronAPI.removeProject(project.id))
      setActiveProject(null)
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Could not remove project.')
    }
  }

  const refreshProjects = async () => {
    try {
      setProjects(await window.electronAPI.listProjects())
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Could not refresh projects.')
    }
  }

  const openInBrowser = async (project: Project) => {
    const url = project.port
      ? `http://localhost:${project.port}`
      : project.baseUrl && /^https?:\/\//i.test(project.baseUrl)
        ? project.baseUrl
        : null
    if (!url) {
      announce('Configure a port or Base URL to open this project in your browser.')
      return
    }
    try {
      await window.electronAPI.openUrl(url)
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Could not open URL in browser.')
    }
  }

  return (
    <div className="flex h-screen min-h-[600px] min-w-[760px] flex-col overflow-hidden bg-slate-950 font-sans text-slate-100">
      {/* Top Application Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800/90 bg-slate-950 px-6">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/30">
            <Command size={18} strokeWidth={2.5} />
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-base font-bold tracking-tight text-white">devpilot</span>
            <span className="border-l border-slate-800 pl-2.5 text-xs font-semibold tracking-wider text-blue-400">
              CONTROL CENTER
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs font-medium text-slate-400">
          <div className="flex items-center gap-1.5 rounded-full border border-blue-900/60 bg-blue-950/40 px-3 py-1 text-blue-300">
            <ShieldCheck size={14} className="text-blue-400" />
            <span>Local &amp; Isolated</span>
          </div>
          <div className="flex items-center gap-1.5 pl-2">
            <span
              className={`size-2 rounded-full ${runningCount > 0 ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'}`}
            />
            <span className="text-slate-300 font-semibold">{runningCount}</span>
            <span>active</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-950 px-8">
        {/* Navigation Toolbar */}
        <div className="flex min-h-[68px] shrink-0 items-center gap-4 border-b border-slate-800/80">
          {activeProject ? (
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/90 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-blue-500/60 hover:bg-slate-800 hover:text-blue-300"
              onClick={() => setActiveProject(null)}
            >
              <ArrowLeft size={15} /> Back to all projects
            </button>
          ) : (
            <>
              <label className="flex h-10 w-full max-w-md items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 text-slate-400 transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
                <Search size={16} className="text-slate-500" />
                <input
                  className="w-full bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-500"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setProjectPage(0)
                  }}
                  placeholder="Search projects by name or directory…"
                  aria-label="Search projects"
                />
              </label>
              <span className="ml-auto text-xs font-medium text-slate-400">
                {projects.length} {projects.length === 1 ? 'project' : 'projects'} total{' '}
                <span className="text-slate-700">·</span>{' '}
                <span className={runningCount > 0 ? 'text-blue-400 font-semibold' : 'text-slate-500'}>
                  {runningCount} running
                </span>
              </span>
            </>
          )}

          {activeProject && (
            <div className="ml-auto flex items-center gap-2">
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-blue-500/60 hover:text-blue-300"
                onClick={() => {
                  void window.electronAPI
                    .openProjectFolder(activeProject.id)
                    .catch((error: Error) => announce(error.message))
                }}
                title="Open project folder in File Explorer"
              >
                <FolderOpen size={15} className="text-blue-400" />
                <span>Folder</span>
              </button>
              {(activeProject.port || activeProject.baseUrl) && (
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-900/80 bg-blue-950/60 px-3 py-2 text-xs font-medium text-blue-300 transition hover:bg-blue-900/80 hover:text-white"
                  onClick={() => void openInBrowser(activeProject)}
                  title="Open in default browser"
                >
                  <Globe size={15} className="text-blue-400" />
                  <span>Open Browser</span>
                </button>
              )}
            </div>
          )}

          <button
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white shadow-md shadow-blue-600/30 transition hover:bg-blue-500 active:scale-[0.98]"
            onClick={addProject}
          >
            <Plus size={16} strokeWidth={2.5} /> Add Project
          </button>
        </div>

        {/* View Switching: Project Cards Grid OR Project Overview */}
        {activeProject ? (
          <ProjectOverview
            project={activeProject}
            busy={busyProjectId === activeProject.id}
            onStart={() => void startProject(activeProject)}
            onStop={() => void stopProject(activeProject)}
            onOpenBrowser={() => void openInBrowser(activeProject)}
            onSettings={() => setSettingsOpen(true)}
            onRefresh={() => void refreshProjects()}
            onSaved={async (config) => setProjects(await window.electronAPI.updateProject(config))}
            onMessage={announce}
          />
        ) : (
          <section className="mx-auto flex min-h-0 w-full max-w-[1360px] flex-1 flex-col overflow-hidden py-5">
            <div className="mb-4 flex shrink-0 items-end justify-between gap-6">
              <div>
                <p className="text-xs font-bold tracking-widest text-blue-400">WORKSPACE DASHBOARD</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Your Projects</h1>
                <p className="mt-1 text-sm text-slate-400">
                  Select a card to view live terminal streams, metrics, and environment settings.
                </p>
              </div>
            </div>

            {filteredProjects.length ? (
              <div className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-3">
                {visibleProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    busy={busyProjectId === project.id}
                    onOpen={() => setActiveProject(project.id)}
                    onStart={() => void startProject(project)}
                    onStop={() => void stopProject(project)}
                    onOpenBrowser={() => void openInBrowser(project)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900 px-6 text-center">
                <div className="grid size-14 place-items-center rounded-2xl border border-blue-900/60 bg-blue-950/60 text-blue-400">
                  <Boxes size={26} />
                </div>
                <h2 className="mt-4 text-xl font-semibold text-slate-100">
                  {projects.length ? 'No matching projects' : 'No projects added yet'}
                </h2>
                <p className="mt-1 max-w-sm text-sm leading-6 text-slate-400">
                  {projects.length
                    ? 'Check your search query or clear the filter.'
                    : 'Click &quot;Add Project&quot; above to import any local repository and start running scripts.'}
                </p>
                {!projects.length && (
                  <button
                    className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-md shadow-blue-600/30 transition hover:bg-blue-500"
                    onClick={addProject}
                  >
                    <Plus size={16} /> Add your first project
                  </button>
                )}
              </div>
            )}
            {filteredProjects.length > projectsPerPage && (
              <div className="mt-auto flex shrink-0 items-center justify-center gap-4 pt-4">
                <button
                  className="grid size-9 place-items-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-blue-500 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => setProjectPage(Math.max(0, currentPage - 1))}
                  disabled={currentPage === 0}
                  aria-label="Previous projects"
                >
                  <ArrowLeft size={16} />
                </button>
                <span className="min-w-28 text-center text-sm font-medium text-slate-300">
                  Page {currentPage + 1} of {pageCount}
                </span>
                <button
                  className="grid size-9 place-items-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-blue-500 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => setProjectPage(Math.min(pageCount - 1, currentPage + 1))}
                  disabled={currentPage >= pageCount - 1}
                  aria-label="Next projects"
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
          </section>
        )}

        {/* Global Footer */}
        <footer className="mt-auto flex min-h-12 shrink-0 items-center justify-between border-t border-slate-800/80 text-xs text-slate-500">
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full bg-blue-500" />
            <span className="text-slate-400">Primary UI: Blue Theme</span>
          </span>
          <span>
            {runningCount} running of {projects.length} total <span className="mx-1 text-slate-700">·</span>{' '}
            DevPilot v1.0.0
          </span>
        </footer>
      </main>

      {/* Project Settings Slide-over */}
      {settingsOpen && activeProject && (
        <ProjectSettings
          project={activeProject}
          onClose={() => setSettingsOpen(false)}
          onSave={async (config) => {
            setProjects(await window.electronAPI.updateProject(config))
            setSettingsOpen(false)
            announce('Project settings updated.')
          }}
          onRemove={() => {
            setSettingsOpen(false)
            void removeProject(activeProject)
          }}
        />
      )}

      {/* Notification Toast */}
      {notice && (
        <div className="fixed bottom-6 right-6 z-30 flex max-w-md items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-xs text-slate-100 shadow-2xl shadow-black/60">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-blue-600/30 border border-blue-500/50 text-xs font-bold text-blue-300">
            i
          </span>
          <span className="flex-1">{notice}</span>
          <button
            className="text-slate-400 hover:text-white"
            onClick={() => setNotice('')}
            title="Dismiss notice"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  )
}

interface ProjectCardProps {
  project: Project
  busy: boolean
  onOpen: () => void
  onStart: () => void
  onStop: () => void
  onOpenBrowser: () => void
}

// Project Card with clear Start and Stop action buttons, status pills, and clickable overview.
function ProjectCard({ project, busy, onOpen, onStart, onStop, onOpenBrowser }: ProjectCardProps) {
  const isRunning = project.status === 'running'
  const isStarting = project.status === 'starting'

  return (
    <article
      className="group relative flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg shadow-black/20 transition duration-200 hover:-translate-y-1 hover:border-blue-500/60 hover:shadow-xl hover:shadow-blue-950/30"
      tabIndex={0}
      role="button"
      aria-label={`Open ${project.name} overview`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <div>
        {/* Card Header: Icon & Status Badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="grid size-11 place-items-center rounded-xl border border-blue-900/80 bg-blue-950/70 text-blue-400 transition group-hover:border-blue-500/60 group-hover:text-blue-300">
            <Boxes size={22} />
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${
              isRunning
                ? 'border-blue-800 bg-blue-950/80 text-blue-300'
                : project.status === 'error'
                  ? 'border-rose-800/80 bg-rose-950/50 text-rose-300'
                  : isStarting
                    ? 'border-amber-800/80 bg-amber-950/50 text-amber-300'
                    : 'border-slate-800 bg-slate-900 text-slate-400'
            }`}
          >
            <span
              className={`size-2 rounded-full ${
                isRunning
                  ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]'
                  : project.status === 'error'
                    ? 'bg-rose-400'
                    : isStarting
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-slate-600'
              }`}
            />
            {project.status}
          </span>
        </div>

        {/* Project Name & Path */}
        <div className="mt-4">
          <h2 className="truncate text-base font-semibold tracking-tight text-white group-hover:text-blue-300 transition-colors">
            {project.name}
          </h2>
          <p className="mt-1 truncate font-mono text-xs text-slate-400" title={project.path}>
            {project.path}
          </p>
        </div>

        {/* Command & Port Information */}
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-800/90 bg-slate-950/80 p-3">
          <div className="flex items-center gap-2 text-xs">
            <TerminalIcon size={14} className="shrink-0 text-blue-400" />
            <span className="text-slate-400">Command:</span>
            <code className="truncate font-mono font-medium text-slate-200">{project.command}</code>
          </div>

          <div className="flex items-center justify-between text-xs border-t border-slate-900 pt-2">
            <div className="flex items-center gap-2">
              <Globe size={14} className="shrink-0 text-slate-500" />
              <span className="text-slate-400">Port:</span>
              <span className="font-mono text-xs font-medium text-slate-200">
                {project.port ? `:${project.port}` : 'None'}
              </span>
            </div>

            {project.port && isRunning && (
              <button
                className="inline-flex items-center gap-1 font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline"
                onClick={(event) => {
                  event.stopPropagation()
                  onOpenBrowser()
                }}
                title="Open in browser"
              >
                <span>open</span>
                <ExternalLink size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Error message preview if failed */}
        {project.status === 'error' && project.error && (
          <p className="mt-2 line-clamp-2 rounded-lg bg-rose-950/40 border border-rose-900/60 p-2 text-xs text-rose-300">
            {project.error}
          </p>
        )}
      </div>

      {/* Action Buttons: Start and Stop */}
      <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Start Button */}
          <button
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold shadow-sm transition disabled:cursor-not-allowed ${
              isRunning
                ? 'bg-slate-800/60 text-slate-500 border border-slate-800 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
            }`}
            disabled={busy || isRunning || isStarting}
            onClick={(event) => {
              event.stopPropagation()
              onStart()
            }}
            title={isRunning ? 'Already running' : 'Start project and auto-redirect browser'}
          >
            {busy && !isRunning ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : isStarting ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <Power size={14} />
            )}
            <span>{isStarting ? 'Starting…' : 'Start'}</span>
          </button>

          {/* Stop Button */}
          <button
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition disabled:cursor-not-allowed ${
              isRunning
                ? 'border-rose-800/80 bg-rose-950/60 text-rose-200 hover:bg-rose-900/80 hover:border-rose-700'
                : 'border-slate-800 bg-slate-900/40 text-slate-600 cursor-not-allowed'
            }`}
            disabled={busy || !isRunning}
            onClick={(event) => {
              event.stopPropagation()
              onStop()
            }}
            title={isRunning ? 'Stop server' : 'Process is stopped'}
          >
            {busy && isRunning ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <Square size={13} fill="currentColor" />
            )}
            <span>Stop</span>
          </button>
        </div>

        {/* Overview link */}
        <button
          className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-blue-300 transition"
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
        >
          <span>Overview</span>
          <ArrowUpRight size={14} />
        </button>
      </div>
    </article>
  )
}

interface ProjectOverviewProps {
  project: Project
  busy: boolean
  onStart: () => void
  onStop: () => void
  onOpenBrowser: () => void
  onSettings: () => void
  onRefresh: () => void
  onSaved: (project: ProjectConfig) => Promise<void>
  onMessage: (message: string) => void
}

// Project detail page with process metrics, live terminal, and environment switcher.
function ProjectOverview({
  project,
  busy,
  onStart,
  onStop,
  onOpenBrowser,
  onSettings,
  onRefresh,
  onSaved,
  onMessage
}: ProjectOverviewProps) {
  const isRunning = project.status === 'running'
  const isStarting = project.status === 'starting'

  return (
    <section className="mx-auto flex min-h-0 w-full max-w-[1240px] flex-1 flex-col overflow-hidden py-3">
      {/* Header Overview Card */}
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl border border-blue-800/80 bg-blue-950/70 text-blue-300">
            <Boxes size={24} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="truncate text-xl font-bold tracking-tight text-white">{project.name}</h1>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${
                  isRunning
                    ? 'border-blue-700 bg-blue-950/80 text-blue-200'
                    : project.status === 'error'
                      ? 'border-rose-800/80 bg-rose-950/50 text-rose-300'
                      : isStarting
                        ? 'border-amber-800/80 bg-amber-950/50 text-amber-200'
                        : 'border-slate-700 bg-slate-800 text-slate-300'
                }`}
              >
                <span
                  className={`size-2 rounded-full ${
                    isRunning
                      ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]'
                      : project.status === 'error'
                        ? 'bg-rose-400'
                        : isStarting
                          ? 'bg-amber-400 animate-pulse'
                          : 'bg-slate-500'
                  }`}
                />
                {project.status}
              </span>
            </div>
            <p className="mt-1 truncate font-mono text-xs text-slate-400">{project.path}</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Start Button */}
          <button
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold shadow-sm transition disabled:cursor-not-allowed ${
              isRunning
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
            }`}
            disabled={busy || isRunning || isStarting}
            onClick={onStart}
          >
            {busy && !isRunning ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : isStarting ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <Power size={14} />
            )}
            <span>{isStarting ? 'Starting…' : 'Start'}</span>
          </button>

          {/* Stop Button */}
          <button
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-xs font-semibold transition disabled:cursor-not-allowed ${
              isRunning
                ? 'border-rose-800/80 bg-rose-950/60 text-rose-200 hover:bg-rose-900/80'
                : 'border-slate-800 bg-slate-900 text-slate-600 cursor-not-allowed'
            }`}
            disabled={busy || !isRunning}
            onClick={onStop}
          >
            {busy && isRunning ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <Square size={13} fill="currentColor" />
            )}
            <span>Stop</span>
          </button>

          {/* Open in Browser */}
          {(project.port || project.baseUrl) && (
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-900 bg-blue-950/70 px-3 text-xs font-medium text-blue-300 transition hover:bg-blue-900 hover:text-white"
              onClick={onOpenBrowser}
              title="Open in default browser"
            >
              <Globe size={14} className="text-blue-400" />
              <span>Browser</span>
            </button>
          )}

          {/* Refresh */}
          <button
            className="grid size-9 place-items-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 transition hover:border-blue-500/70 hover:text-blue-300"
            onClick={onRefresh}
            title="Refresh process state"
          >
            <RefreshCw size={15} />
          </button>

          {/* Settings */}
          <button
            className="grid size-9 place-items-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 transition hover:border-blue-500/70 hover:text-blue-300"
            onClick={onSettings}
            title="Configure project settings"
          >
            <Settings2 size={15} />
          </button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="mb-3 grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
        <MetricCard
          label="PROCESS STATUS"
          value={project.status}
          caption={project.pid ? `PID: ${project.pid}` : 'Process not running'}
          icon={<Activity size={16} />}
          status={project.status}
        />
        <MetricCard
          label="LOCAL PORT"
          value={project.port ? `:${project.port}` : 'Not set'}
          caption={project.port ? `http://localhost:${project.port}` : 'Configure in settings to auto-open'}
          icon={<Globe size={16} />}
          mono
          clickable={Boolean(project.port)}
          onClick={onOpenBrowser}
        />
        <MetricCard
          label="DEV COMMAND"
          value={project.command}
          caption="Executed inside interactive PTY"
          icon={<TerminalIcon size={16} />}
          mono
        />
        <MetricCard
          label="WORKSPACE"
          value={project.path.split(/[\\/]/).filter(Boolean).slice(-1)[0] || 'Project'}
          caption={project.path}
          icon={<FolderOpen size={16} />}
          mono
        />
      </div>

      {/* Live Terminal */}
      <div className="mb-3 flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Live Terminal Output</h2>
            <p className="text-xs text-slate-400">Streamed directly from your active project process</p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 font-mono text-xs font-semibold ${
              isRunning ? 'text-blue-400' : 'text-slate-500'
            }`}
          >
            <span
              className={`size-2 rounded-full ${isRunning ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'}`}
            />
            {isRunning ? 'STREAMING' : 'IDLE'}
          </span>
        </div>

        <div className="flex min-h-20 flex-1 flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#070b12] shadow-inner">
          <div className="flex h-9 shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900 px-3">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-rose-500/80" />
              <span className="size-2.5 rounded-full bg-amber-500/80" />
              <span className="size-2.5 rounded-full bg-blue-500/80" />
            </div>
            <div className="flex h-7 items-center gap-1.5 self-end rounded-t-md bg-slate-800/90 px-2.5 text-xs font-medium text-slate-200">
              <TerminalIcon size={13} className="text-blue-400" />
              <span>{project.name}</span>
              <ChevronDown size={12} className="text-slate-400" />
            </div>
            <span className="truncate font-mono text-xs text-slate-500">{project.path}</span>
            <span className="ml-auto shrink-0 font-mono text-xs text-slate-400">
              {project.pid ? `PID: ${project.pid}` : 'No active PID'}
            </span>
          </div>

          <div className="relative min-h-0 flex-1">
            <Terminal key={project.id} projectId={project.id} />
            {!isRunning && (
              <div className="pointer-events-none absolute left-4 top-4 font-mono text-xs text-slate-500">
                <span className="mr-2 text-blue-400">›</span>Click &quot;Start&quot; above to execute command
                and stream output
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Environment Switcher */}
      <EnvironmentSwitcher key={project.id} project={project} onSaved={onSaved} onMessage={onMessage} />
    </section>
  )
}

interface MetricCardProps {
  label: string
  value: string
  caption: string
  icon: ReactNode
  status?: Project['status']
  mono?: boolean
  clickable?: boolean
  onClick?: () => void
}

function MetricCard({ label, value, caption, icon, status, mono, clickable, onClick }: MetricCardProps) {
  return (
    <div
      className={`min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-2.5 transition ${
        clickable ? 'hover:border-blue-500/60 cursor-pointer' : ''
      }`}
      onClick={clickable ? onClick : undefined}
    >
      <div className="flex items-center justify-between text-xs font-bold tracking-wider text-slate-400 uppercase">
        <span>{label}</span>
        <span className="text-slate-500">{icon}</span>
      </div>
      <div className="mt-3 flex items-center gap-2 truncate text-base font-semibold text-white capitalize">
        {status && (
          <span
            className={`size-2.5 shrink-0 rounded-full ${
              status === 'running'
                ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]'
                : status === 'error'
                  ? 'bg-rose-400'
                  : status === 'starting'
                    ? 'animate-pulse bg-amber-400'
                    : 'bg-slate-600'
            }`}
          />
        )}
        <span className={`truncate ${mono ? 'font-mono text-xs font-medium' : ''}`}>{value}</span>
      </div>
      <p className="mt-1 truncate text-xs text-slate-400" title={caption}>
        {caption}
      </p>
    </div>
  )
}

interface EnvironmentSwitcherProps {
  project: Project
  onSaved: (project: ProjectConfig) => Promise<void>
  onMessage: (message: string) => void
}

function EnvironmentSwitcher({ project, onSaved, onMessage }: EnvironmentSwitcherProps) {
  const [urlDraft, setUrlDraft] = useState(project.baseUrl ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const value = urlDraft.trim()
    setSaving(true)
    try {
      const result = await window.electronAPI.setBaseUrl(project.id, value)
      if (!result.ok) throw new Error(result.message)
      await onSaved({ ...project, baseUrl: value })
      onMessage('Base URL saved to environment file.')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Could not update environment file.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="shrink-0 rounded-xl border border-slate-800 bg-slate-900 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-white">Environment Switcher</h2>
          <p className="text-xs text-slate-400">
            Safely update your target backend API without modifying secret variables
          </p>
        </div>
        <span className="rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1 font-mono text-xs text-blue-400">
          {project.envFile || '.env'}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-[200px_1fr_auto] md:items-end">
        <div>
          <label className="mb-1.5 block text-xs font-semibold tracking-wider uppercase text-slate-400">
            Environment Key
          </label>
          <code className="block truncate rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-blue-300">
            {project.envKey || 'VITE_API_BASE_URL'}
          </code>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold tracking-wider uppercase text-slate-400">
            Base URL Value
          </label>
          <input
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
            placeholder="http://localhost:3000/api"
          />
        </div>

        <button
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm shadow-blue-600/30 transition hover:bg-blue-500 disabled:opacity-50"
          disabled={saving || urlDraft.trim() === (project.baseUrl ?? '')}
          onClick={() => void save()}
        >
          {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
          Save URL
        </button>
      </div>
    </section>
  )
}

interface ProjectSettingsProps {
  project: Project
  onClose: () => void
  onSave: (project: ProjectConfig) => Promise<void>
  onRemove: () => void
}

function ProjectSettings({ project, onClose, onSave, onRemove }: ProjectSettingsProps) {
  const [name, setName] = useState(project.name)
  const [command, setCommand] = useState(project.command)
  const [port, setPort] = useState(project.port?.toString() ?? '')
  const [envFile, setEnvFile] = useState(project.envFile || '.env')
  const [envKey, setEnvKey] = useState(project.envKey || 'VITE_API_BASE_URL')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const parsedPort = port.trim() ? Number(port) : undefined
    if (parsedPort !== undefined && (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)) {
      window.alert('Port must be a valid integer between 1 and 65535.')
      return
    }

    setSaving(true)
    try {
      await onSave({
        id: project.id,
        name,
        path: project.path,
        command,
        port: parsedPort,
        envFile,
        envKey,
        baseUrl: project.baseUrl
      })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not save project settings.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'mt-1.5 h-10 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 font-mono text-xs text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
  const labelClass = 'block text-xs font-semibold tracking-wider uppercase text-slate-400'

  return (
    <div
      className="fixed inset-0 z-30 flex justify-end bg-black/60 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="flex h-full w-full max-w-md flex-col border-l border-slate-800 bg-slate-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-6 py-5">
          <div>
            <p className="text-xs font-bold tracking-widest text-blue-400 uppercase">Configuration</p>
            <h2 className="mt-0.5 text-lg font-bold text-white">Project Settings</h2>
          </div>
          <button
            className="grid size-8 place-items-center rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
            onClick={onClose}
            title="Close"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          <label className={labelClass}>
            Display Name
            <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <label className={labelClass}>
            Project Folder
            <span className="mt-1.5 flex h-10 items-center gap-2 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 px-3.5 font-mono text-xs text-slate-400">
              <FolderOpen size={15} className="shrink-0 text-blue-400" />
              <span className="truncate">{project.path}</span>
            </span>
          </label>

          <label className={labelClass}>
            Start Command
            <input
              className={inputClass}
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="npm run dev"
            />
          </label>

          <label className={labelClass}>
            Local Port
            <input
              className={inputClass}
              value={port}
              onChange={(event) => setPort(event.target.value)}
              placeholder="5173"
              inputMode="numeric"
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              When started, DevPilot automatically opens http://localhost:[port] in your default browser.
            </span>
          </label>

          <div className="border-t border-slate-800 pt-4 text-xs font-bold uppercase tracking-wider text-slate-300">
            Environment Mapping
          </div>

          <label className={labelClass}>
            File Name
            <input
              className={inputClass}
              value={envFile}
              onChange={(event) => setEnvFile(event.target.value)}
            />
          </label>

          <label className={labelClass}>
            Base URL Key
            <input
              className={inputClass}
              value={envKey}
              onChange={(event) => setEnvKey(event.target.value)}
            />
          </label>
        </div>

        <footer className="flex items-center justify-between border-t border-slate-800 px-6 py-4">
          <button
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 transition"
            onClick={onRemove}
          >
            <Trash2 size={15} /> Remove Project
          </button>
          <div className="flex gap-2">
            <button
              className="h-10 rounded-xl border border-slate-800 px-4 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white shadow-md shadow-blue-600/30 transition hover:bg-blue-500 disabled:opacity-50"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
              Save Changes
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}

export default App
