declare module 'agent-handles/vite' {
  interface AgentHandlesVitePlugin {
    name: string
  }

  const agentHandles: () => AgentHandlesVitePlugin
  export default agentHandles
}
