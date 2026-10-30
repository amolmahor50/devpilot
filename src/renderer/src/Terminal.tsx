// xterm.js UI and fit behavior run in the renderer; terminal I/O uses the narrow preload API.
import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

interface TerminalProps {
  projectId: string
}

export default function Terminal({ projectId }: TerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hostRef.current) return
    const terminal = new XTerm({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.45,
      theme: {
        background: '#090d14',
        foreground: '#d3dce9',
        cursor: '#60a5fa',
        selectionBackground: '#353d4a',
        black: '#151923',
        green: '#60a5fa',
        brightGreen: '#93c5fd',
        cyan: '#7dd3fc',
        yellow: '#facc15',
        red: '#fb7185'
      },
      convertEol: true,
      scrollback: 3000
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(hostRef.current)
    fit.fit()
    terminal.writeln('\x1b[90mTerminal session is ready. Start the project to stream output.\x1b[0m')
    const input = terminal.onData((data) => window.electronAPI.writeTerminal(projectId, data))
    const output = window.electronAPI.onTerminalData((event) => {
      if (event.projectId === projectId) terminal.write(event.data)
    })
    const observer = new ResizeObserver(() => {
      fit.fit()
      window.electronAPI.resizeTerminal(projectId, terminal.cols, terminal.rows)
    })
    observer.observe(hostRef.current)
    return () => {
      input.dispose()
      output()
      observer.disconnect()
      terminal.dispose()
    }
  }, [projectId])

  return <div ref={hostRef} className="terminal-host h-full w-full p-3" aria-label="Project terminal" />
}
