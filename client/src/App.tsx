import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type AgentStep =
  | { type: 'model'; output: string }
  | { type: 'tool'; call: { tool: string; input: unknown }; output: unknown }
  | { type: 'error'; message: string }

type AgentResult = {
  final: string
  steps: AgentStep[]
}

type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; steps?: AgentStep[] }

const presets = [
  {
    goal: 'Create a 3-minute demo script for our Agentic AI hackathon project. Include a compliance checklist and mention #AmazonNova.',
    context: 'We are using Nova 2 Lite via Bedrock. The demo must show the project functioning end-to-end.'
  },
  {
    goal: 'Write a concise README setup guide for running the client and server locally. Include env vars and troubleshooting.',
    context: 'The backend exposes POST /api/agent and uses Amazon Nova 2 Lite via Bedrock.'
  },
  {
    goal: 'Give me a short pitch (30 seconds) for this product for non-technical users.',
    context: 'The product is an agent powered by Amazon Nova 2 Lite.'
  },
  {
    goal: 'I want to launch this to clients. Suggest 5 features to add next and why each matters.',
    context: ''
  },
]

function classNames(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(' ')
}

function formatMs(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds}s`
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

function App() {
  const [goal, setGoal] = useState('')
  const [context, setContext] = useState('')
  const [result, setResult] = useState<AgentResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const stepCounts = useMemo(() => {
    const steps = result?.steps ?? []
    const counts = { model: 0, tool: 0, error: 0 }
    for (const s of steps) {
      if (s.type === 'model') counts.model += 1
      if (s.type === 'tool') counts.tool += 1
      if (s.type === 'error') counts.error += 1
    }
    return counts
  }, [result])

  useEffect(() => {
    if (!isRunning || !runStartedAt) return

    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - runStartedAt)
    }, 200)

    return () => {
      window.clearInterval(id)
    }
  }, [isRunning, runStartedAt])

  const elapsedLabel = useMemo(() => {
    return formatMs(elapsedMs)
  }, [elapsedMs])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [chat.length, isRunning])

  async function runAgent(overrides?: { goal?: string; context?: string }) {
    const trimmedGoal = (overrides?.goal ?? goal).trim()
    const trimmedContext = (overrides?.context ?? context).trim()

    if (!trimmedGoal) {
      setError('Goal is required.')
      return
    }

    setError(null)
    setResult(null)
    setIsRunning(true)
    setElapsedMs(0)
    setRunStartedAt(Date.now())

    const userText = trimmedContext ? `${trimmedGoal}\n\nContext:\n${trimmedContext}` : trimmedGoal
    setChat((prev) => [
      ...prev,
      { role: 'user', content: userText },
      { role: 'assistant', content: '' },
    ])

    if (!overrides?.goal) {
      setGoal('')
    }

    const ac = new AbortController()
    abortRef.current = ac

    const history = chat
      .filter((m) => (m.role === 'user' ? Boolean(m.content.trim()) : Boolean(m.content.trim())))
      .filter((m) => m.role !== 'assistant' || m.content.trim() !== '')
      .map((m) => ({ role: m.role, content: m.content }))
      .slice(-12)

    try {
      const resp = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ac.signal,
        body: JSON.stringify({
          goal: trimmedGoal,
          context: trimmedContext || undefined,
          messages: history,
        }),
      })

      const data: unknown = await resp.json()
      if (!resp.ok) {
        const maybeErr =
          typeof data === 'object' && data !== null && 'error' in data ? (data as { error?: unknown }).error : undefined
        throw new Error(typeof maybeErr === 'string' ? maybeErr : 'Request failed')
      }

      const next = data as AgentResult
      setResult(next)
      setChat((prev) => {
        const copy = prev.slice()
        for (let i = copy.length - 1; i >= 0; i -= 1) {
          if (copy[i].role === 'assistant' && copy[i].content === '') {
            copy[i] = { role: 'assistant', content: next.final }
            return copy
          }
        }
        return [...copy, { role: 'assistant', content: next.final }]
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.toLowerCase().includes('aborted')) {
        setError('Request aborted.')
      } else {
        setError(msg)
      }

      setChat((prev) => {
        const copy = prev.slice()
        for (let i = copy.length - 1; i >= 0; i -= 1) {
          if (copy[i].role === 'assistant' && copy[i].content === '') {
            copy[i] = { role: 'assistant', content: `Sorry — I couldn't complete that request.\n\nError: ${msg}` }
            return copy
          }
        }
        return [...copy, { role: 'assistant', content: `Sorry — I couldn't complete that request.\n\nError: ${msg}` }]
      })
    } finally {
      setIsRunning(false)
      abortRef.current = null
      setRunStartedAt(null)
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  function clear() {
    setResult(null)
    setError(null)
    setChat([])
    setElapsedMs(0)
    setRunStartedAt(null)
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-900/70 bg-zinc-950/60 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
              <span className={classNames('h-2.5 w-2.5 rounded-full', isRunning ? 'bg-sky-400' : 'bg-emerald-400')} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">Nova Agent Demo</div>
              <div className="truncate text-xs text-zinc-400">Amazon Nova 2 Lite • tool-using agent • /api/agent</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden text-xs text-zinc-400 md:block">
              {stepCounts.model} model • {stepCounts.tool} tools • {stepCounts.error} errors
            </div>
            <button
              className={classNames(
                'rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-100 ring-1 ring-zinc-800 hover:bg-zinc-800',
                isRunning && 'opacity-60'
              )}
              onClick={clear}
              disabled={isRunning}
            >
              New chat
            </button>
            <button
              className={classNames(
                'rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-100 ring-1 ring-zinc-800 hover:bg-zinc-800',
                !isRunning && 'opacity-60'
              )}
              onClick={stop}
              disabled={!isRunning}
            >
              Stop
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-5">
        {error ? (
          <div className="mb-4 rounded-2xl bg-red-950/40 p-3 text-sm text-red-200 ring-1 ring-red-900">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="rounded-3xl bg-zinc-900/40 p-5 ring-1 ring-zinc-800">
              <div className="text-sm font-semibold">Judge-ready demo</div>
              <div className="mt-2 text-sm leading-6 text-zinc-300">
                Give a goal, optionally add context, and the agent will respond using Amazon Nova via the backend.
              </div>

              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl bg-zinc-950/60 p-3 ring-1 ring-zinc-800">
                  <div className="text-xs font-semibold text-zinc-200">How to use</div>
                  <div className="mt-2 space-y-1 text-xs text-zinc-400">
                    <div>1) Pick a preset or write your own goal</div>
                    <div>2) Press Enter to send (Shift+Enter for new line)</div>
                    <div>3) Use Stop to abort long runs</div>
                  </div>
                </div>

                <div className="rounded-2xl bg-zinc-950/60 p-3 ring-1 ring-zinc-800">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-zinc-200">Run stats</div>
                    <div className="text-[11px] text-zinc-500">Live</div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-zinc-950 p-2 ring-1 ring-zinc-800">
                      <div className="text-[11px] text-zinc-500">Model</div>
                      <div className="text-sm font-semibold">{stepCounts.model}</div>
                    </div>
                    <div className="rounded-xl bg-zinc-950 p-2 ring-1 ring-zinc-800">
                      <div className="text-[11px] text-zinc-500">Tools</div>
                      <div className="text-sm font-semibold">{stepCounts.tool}</div>
                    </div>
                    <div className="rounded-xl bg-zinc-950 p-2 ring-1 ring-zinc-800">
                      <div className="text-[11px] text-zinc-500">Errors</div>
                      <div className="text-sm font-semibold">{stepCounts.error}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-zinc-950/60 p-3 ring-1 ring-zinc-800">
                  <div className="text-xs font-semibold text-zinc-200">Presets</div>
                  <div className="mt-3 grid gap-2">
                    {presets.map((p) => (
                      <button
                        key={p.goal}
                        className="rounded-2xl bg-zinc-950 p-3 text-left ring-1 ring-zinc-800 hover:bg-zinc-900"
                        onClick={() => {
                          setGoal(p.goal)
                          setContext(p.context)
                          if (!isRunning) void runAgent({ goal: p.goal, context: p.context })
                        }}
                        disabled={isRunning}
                      >
                        <div
                          className="text-xs font-semibold text-zinc-100"
                          title={p.goal}
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {p.goal}
                        </div>
                        {p.context ? (
                          <div
                            className="mt-2 text-[11px] text-zinc-400"
                            title={p.context}
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {p.context}
                          </div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 text-center text-[11px] text-zinc-500">Powered by Amazon Nova</div>
            </div>
          </div>

          <div className="lg:col-span-8">
            <div className="flex min-h-[70vh] flex-col overflow-hidden rounded-3xl bg-zinc-900/40 ring-1 ring-zinc-800">
              <div className="border-b border-zinc-800/80 bg-zinc-950/40 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">Conversation</div>
                  <div className="text-xs text-zinc-400">{isRunning ? `Running • ${elapsedLabel}` : 'Idle'}</div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-6">
                  {chat.length === 0 ? (
                    <div className="rounded-2xl bg-zinc-950/60 p-5 ring-1 ring-zinc-800">
                      <div className="text-sm font-semibold text-zinc-100">Start with a goal</div>
                      <div className="mt-2 text-sm leading-6 text-zinc-300">
                        Use the presets on the left or ask for a demo script, pitch, README, or next features.
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        <div className="rounded-xl bg-zinc-950 p-3 ring-1 ring-zinc-800">
                          <div className="text-xs font-semibold">Fast</div>
                          <div className="mt-1 text-xs text-zinc-400">Nova 2 Lite responses tuned for a live demo.</div>
                        </div>
                        <div className="rounded-xl bg-zinc-950 p-3 ring-1 ring-zinc-800">
                          <div className="text-xs font-semibold">Agentic</div>
                          <div className="mt-1 text-xs text-zinc-400">Backend can call tools and return structured steps.</div>
                        </div>
                        <div className="rounded-xl bg-zinc-950 p-3 ring-1 ring-zinc-800">
                          <div className="text-xs font-semibold">Simple</div>
                          <div className="mt-1 text-xs text-zinc-400">One API call: POST /api/agent.</div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {chat.map((m, i) => {
                    const isUser = m.role === 'user'
                    return (
                      <div key={i} className="flex gap-3">
                        <div className="mt-0.5">
                          <div
                            className={classNames(
                              'flex h-8 w-8 items-center justify-center rounded-xl ring-1',
                              isUser
                                ? 'bg-emerald-500 text-zinc-950 ring-emerald-400'
                                : 'bg-zinc-900 text-zinc-100 ring-zinc-800'
                            )}
                          >
                            <span className="text-xs font-bold">{isUser ? 'You' : 'AI'}</span>
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-zinc-400">{isUser ? 'You' : 'Nova Agent'}</div>

                          <div
                            className={classNames(
                              'mt-2 rounded-2xl px-3 py-2.5 ring-1',
                              isUser ? 'bg-zinc-950/40 ring-zinc-800' : 'bg-zinc-900 ring-zinc-800'
                            )}
                          >
                            {m.role === 'assistant' ? (
                              m.content ? (
                                <div className="prose prose-sm prose-invert max-w-none text-[13px] leading-6 prose-p:my-2 prose-li:my-1 prose-a:text-emerald-300">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                      h1: (props) => <h1 className="mb-2 mt-2 text-base font-semibold" {...props} />,
                                      h2: (props) => <h2 className="mb-2 mt-4 text-sm font-semibold" {...props} />,
                                      h3: (props) => <h3 className="mb-2 mt-4 text-sm font-semibold" {...props} />,
                                      code: (props) => (
                                        <code
                                          className="rounded bg-zinc-800 px-1.5 py-0.5 text-[0.85em] text-zinc-100 ring-1 ring-zinc-700"
                                          {...props}
                                        />
                                      ),
                                      pre: (props) => (
                                        <pre
                                          className="my-3 overflow-x-auto rounded-xl bg-zinc-800 p-3 text-xs leading-5 text-zinc-100 ring-1 ring-zinc-700"
                                          {...props}
                                        />
                                      ),
                                    }}
                                  >
                                    {m.content}
                                  </ReactMarkdown>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 text-zinc-200">
                                  <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-sky-400" />
                                  <span className="font-medium">Thinking</span>
                                  <span className="text-xs text-zinc-400">{elapsedLabel}</span>
                                </div>
                              )
                            ) : (
                              <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-zinc-100">{m.content}</pre>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  <div ref={scrollRef} />
                </div>
              </div>

              <div className="border-t border-zinc-800/80 bg-zinc-950/40 px-4 py-3">
                <div className="rounded-2xl bg-zinc-950/60 p-3 ring-1 ring-zinc-800">
                  <div className="flex flex-col gap-3">
                    <textarea
                      className="min-h-[46px] w-full resize-none rounded-xl bg-zinc-950 p-3 text-sm text-zinc-100 ring-1 ring-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      placeholder="What should the agent do? (Enter to send)"
                      disabled={isRunning}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          if (!isRunning) void runAgent()
                        }
                      }}
                    />

                    <details className="rounded-xl bg-zinc-950/40 p-2 ring-1 ring-zinc-800">
                      <summary className="cursor-pointer select-none text-xs font-semibold text-zinc-300 hover:text-zinc-100">
                        Context (optional)
                      </summary>
                      <textarea
                        className="mt-2 min-h-[90px] w-full resize-y rounded-xl bg-zinc-950 p-3 text-sm text-zinc-100 ring-1 ring-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        value={context}
                        onChange={(e) => setContext(e.target.value)}
                        placeholder="Extra details the agent should consider"
                        disabled={isRunning}
                      />
                    </details>

                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-zinc-400">Enter to send • Shift+Enter for new line</div>

                      <div className="flex items-center gap-2">
                        <button
                          className={classNames(
                            'rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-100 ring-1 ring-zinc-800 hover:bg-zinc-800',
                            isRunning && 'opacity-60'
                          )}
                          onClick={clear}
                          disabled={isRunning}
                        >
                          Clear
                        </button>
                        <button
                          className={classNames(
                            'rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950',
                            isRunning && 'opacity-60'
                          )}
                          onClick={() => {
                            void runAgent()
                          }}
                          disabled={isRunning}
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
