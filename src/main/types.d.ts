declare module 'tree-kill' {
  function treeKill(pid: number | string, signal?: string, callback?: (error?: Error) => void): void
  export default treeKill
}
