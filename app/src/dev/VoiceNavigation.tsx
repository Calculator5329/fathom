import { useEffect, useReducer, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DICTATION_IDLE, dictationReducer, dictationSupported, isListening, startDictation, type DictationHandle, type SpeechCapableWindow } from './dictation'
import { navigationProposal } from './navigationIntent'

// Opt-in local prototype: speech is a draft; only an explicit confirm clicks an
// existing public navigation handle. No account actions or arbitrary commands.
function VoiceNavigation() {
  const [draft, setDraft] = useState('')
  const [state, dispatch] = useReducer(dictationReducer, DICTATION_IDLE)
  const [receipt, setReceipt] = useState('')
  const [running, setRunning] = useState(false)
  const listening = useRef<DictationHandle | undefined>(undefined)
  const speechWindow = window as unknown as SpeechCapableWindow
  const proposal = navigationProposal(draft)
  useEffect(() => () => listening.current?.cancel(), [])

  const listen = () => {
    if (isListening(state)) { listening.current?.cancel(); return }
    listening.current = startDictation({ win: speechWindow, onEvent: event => {
      dispatch(event)
      if (event.type === 'transcript') setDraft(event.text)
    } })
  }
  const confirm = async () => {
    if (!proposal || running) return
    setRunning(true)
    setReceipt('Waiting for the Handles action receipt…')
    try {
      const session = await fetch('/__agent-handles/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paceMs: 350 }) })
      if (session.status !== 201) throw new Error('Handles could not open a local session.')
      const data: unknown = await session.json()
      if (!data || typeof data !== 'object' || !('token' in data) || typeof data.token !== 'string') throw new Error('Handles did not return a session token.')
      const response = await fetch('/__agent-handles/command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: data.token, command: { action: 'click', testId: proposal.handle } }) })
      const result: unknown = await response.json()
      if (!result || typeof result !== 'object' || !('ok' in result) || !('detail' in result)) throw new Error('Handles returned an invalid receipt.')
      setReceipt(`${result.ok === true ? 'Completed' : 'Refused'}: ${String(result.detail)}`)
    } catch (error) { setReceipt(error instanceof Error ? error.message : 'Navigation failed.') }
    finally { setRunning(false) }
  }
  return <aside className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-background p-4 shadow-lg" aria-label="Voice navigation prototype">
    <p className="font-medium">Voice navigation · local prototype</p>
    <p className="mt-2 text-sm text-muted-foreground">Say or type “open research”, review the destination, then confirm. Public navigation only.</p>
    <label className="mt-3 block text-sm" htmlFor="voice-navigation-draft">Your words</label>
    <input id="voice-navigation-draft" data-testid="dev.voice.draft" className="mt-1 w-full rounded border bg-background p-2" value={draft} onChange={event => setDraft(event.target.value)} disabled={running} />
    <button data-testid="dev.voice.listen" className="mt-2 rounded border px-3 py-1" disabled={!dictationSupported(speechWindow) || running} onClick={listen}>{isListening(state) ? 'Stop listening' : 'Listen'}</button>
    <p className="mt-2 text-sm text-muted-foreground">{dictationSupported(speechWindow) ? 'Listening uses your browser’s speech service.' : 'Browser speech is unavailable. Type here or use your existing system dictation.'}</p>
    {state.status === 'error' && <p role="alert">{state.message}</p>}
    <p className="mt-2 text-sm" data-testid="dev.voice.proposal">{proposal ? `Proposed: ${proposal.label} (${proposal.handle})` : 'No supported destination. Try home, backtest, allocation, income, Monte Carlo or research.'}</p>
    <button data-testid="dev.voice.confirm" className="mt-2 rounded bg-primary px-3 py-1 text-primary-foreground disabled:opacity-40" disabled={!proposal || running || isListening(state)} onClick={() => void confirm()}>Confirm navigation</button>
    <p className="mt-2 text-sm" role="status" data-testid="dev.voice.receipt">{receipt}</p>
  </aside>
}

export function mountVoiceNavigation() {
  const container = document.createElement('div')
  document.body.append(container)
  createRoot(container).render(<VoiceNavigation />)
}
