import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '../components/Button'
import { GameLobby, WaitingRoom, GameHeader } from '../components/GameLobby'
import { useGameRoom } from '../useGameRoom'

interface LRState {
  phase: 'playing' | 'review'
  letter: string | null
  category: string | null
  round: number
  scores: Record<string, number>
  submitted_ids: string[]
  round_results: Record<string, { words: string[]; valid: string[]; duplicates: string[]; points: number }> | null
  my_words: string[] | null
  time_limit: number
  players: string[]
  restart_votes: string[]
  ready: boolean
}

interface Props {
  userId: string; resumeRoomId: string | null
  onBack: () => void; onGameChanged: (r: string, g: string) => void
}

export function LetterRace({ userId, resumeRoomId, onBack, onGameChanged }: Props) {
  const [state,     setState]     = useState<LRState | null>(null)
  const [inputs,    setInputs]    = useState<string[]>(Array(20).fill(''))
  const [timeLeft,  setTimeLeft]  = useState(60)
  const [submitted, setSubmitted] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const onState = useCallback((s: Record<string, unknown>) => {
    const ls = s as unknown as LRState
    setState(ls)
    if (ls.phase === 'playing' && !submitted) {
      setTimeLeft(ls.time_limit)
      setInputs(Array(20).fill(''))
    }
    if (ls.phase === 'review') setSubmitted(false)
  }, [submitted])

  const room = useGameRoom({ userId, gameType: 'letter_race', resumeRoomId, onBack, onGameChanged, onState })

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (state?.phase === 'playing' && !submitted) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) { submitWords(); return 0 }
          return t - 1
        })
      }, 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [state?.phase, submitted]) // eslint-disable-line react-hooks/exhaustive-deps

  if (room.screen === 'lobby') return <GameLobby title="Corrida de Letras" gameType="letter_race" error={room.error} onCreateRoom={room.createRoom} onBack={onBack} />
  if (room.screen === 'waiting') return <WaitingRoom roomId={room.roomId} onBack={onBack} />

  const hasSubmitted = state?.submitted_ids.includes(userId) ?? false

  const submitWords = () => {
    if (submitted || hasSubmitted) return
    const words = inputs.filter(w => w.trim())
    room.send({ action: 'submit_words', room_id: room.roomId, words })
    setSubmitted(true)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  const nextRound = () => room.send({ action: 'next_round', room_id: room.roomId })

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-sm">
      <GameHeader roomId={room.roomId} gameName="Corrida de Letras" opponentOnline={room.opponentOnline}
        gameVotes={room.gameVotes} myUserId={userId} onVoteGame={room.voteGame} onBack={onBack} />

      {/* Scores */}
      <div className="flex gap-6 justify-center">
        {state?.players.map(p => (
          <div key={p} className="text-center">
            <div className="text-xs text-zinc-500">{p === userId ? 'você' : p.slice(0, 8)}</div>
            <div className="text-xl font-bold text-white">{state.scores[p] ?? 0}pts</div>
          </div>
        ))}
      </div>

      {state?.phase === 'playing' && (
        <>
          <div className="text-center">
            <p className="text-xs text-zinc-500">Rodada {state.round} · {state.category}</p>
            <p className="text-5xl font-black text-primary-accent">{state.letter}</p>
            <p className="text-xs text-zinc-600">Digite palavras que começam com essa letra</p>
          </div>

          {/* Timer */}
          <div className="w-full">
            <div className="flex justify-between text-xs text-zinc-600 mb-1">
              <span>Tempo</span>
              <span className={timeLeft <= 10 ? 'text-red-400 font-bold' : ''}>{timeLeft}s</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full transition-all ${timeLeft <= 10 ? 'bg-red-500' : 'bg-primary'}`}
                style={{ width: `${(timeLeft / (state.time_limit)) * 100}%` }} />
            </div>
          </div>

          {!hasSubmitted ? (
            <>
              <div className="w-full grid grid-cols-2 gap-1.5 max-h-60 overflow-y-auto">
                {inputs.map((val, i) => (
                  <input key={i} value={val}
                    onChange={e => { const n = [...inputs]; n[i] = e.target.value; setInputs(n) }}
                    placeholder={`Palavra ${i + 1}`}
                    className="bg-zinc-900 border border-zinc-700 focus:border-primary rounded-lg px-2.5 py-1.5 text-sm text-white placeholder-zinc-600 outline-none"
                    maxLength={40} />
                ))}
              </div>
              <Button onClick={submitWords} className="w-full">Stop! 🛑</Button>
            </>
          ) : (
            <p className="text-primary-accent font-semibold animate-pulse">
              ✓ Enviado! Aguardando adversários...
            </p>
          )}
        </>
      )}

      {state?.phase === 'review' && state.round_results && (
        <div className="w-full flex flex-col gap-3">
          <p className="text-center font-bold text-white">Rodada {state.round - 1} — Resultados</p>
          {Object.entries(state.round_results).map(([p, r]) => (
            <div key={p} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <div className="flex justify-between mb-2">
                <span className="font-semibold text-white">{p === userId ? 'você' : p.slice(0, 8)}</span>
                <span className="text-primary-accent font-bold">+{r.points}pts</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {r.valid.map(w => <span key={w} className="text-xs bg-green-950 border border-green-800 text-green-300 rounded px-1.5 py-0.5">{w}</span>)}
                {r.duplicates.map(w => <span key={w} className="text-xs bg-yellow-950 border border-yellow-800 text-yellow-300 rounded px-1.5 py-0.5">{w} (½)</span>)}
              </div>
            </div>
          ))}
          <Button onClick={nextRound} className="w-full">Próxima rodada</Button>
        </div>
      )}

      {room.error && <p className="text-red-400 text-sm">{room.error}</p>}
    </div>
  )
}
