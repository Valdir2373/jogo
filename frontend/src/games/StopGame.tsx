import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '../components/Button'
import { GameLobby, WaitingRoom, GameHeader } from '../components/GameLobby'
import { useGameRoom } from '../useGameRoom'

const CATEGORIES = ['Nome', 'Animal', 'Comida', 'Cidade', 'Objeto', 'Marca']

interface StopState {
  phase: 'playing' | 'review'
  letter: string | null
  categories: string[]
  round: number
  scores: Record<string, number>
  stopper: string | null
  submitted_ids: string[]
  round_results: Record<string, Record<string, { answer: string; points: number }>> | null
  all_answers: Record<string, Record<string, string>> | null
  my_answers: Record<string, string> | null
  time_limit: number
  players: string[]
  restart_votes: string[]
  ready: boolean
}

interface Props {
  userId: string; resumeRoomId: string | null
  onBack: () => void; onGameChanged: (r: string, g: string) => void
}

export function StopGame({ userId, resumeRoomId, onBack, onGameChanged }: Props) {
  const [state,   setState]  = useState<StopState | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [timeLeft, setTimeLeft] = useState(30)
  const [stopped, setStopped]  = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const onState = useCallback((s: Record<string, unknown>) => {
    const ss = s as unknown as StopState
    setState(ss)
    if (ss.phase === 'playing' && !stopped) {
      setTimeLeft(ss.time_limit)
      setAnswers({})
    }
    if (ss.phase === 'review') setStopped(false)
  }, [stopped])

  const room = useGameRoom({ userId, gameType: 'stop_game', resumeRoomId, onBack, onGameChanged, onState })

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (state?.phase === 'playing' && !stopped) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) { submitStop(); return 0 }
          return t - 1
        })
      }, 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [state?.phase, stopped]) // eslint-disable-line react-hooks/exhaustive-deps

  if (room.screen === 'lobby') return <GameLobby title="Stop" gameType="stop_game" error={room.error} onCreateRoom={room.createRoom} onBack={onBack} />
  if (room.screen === 'waiting') return <WaitingRoom roomId={room.roomId} onBack={onBack} />

  const hasSubmitted = state?.submitted_ids.includes(userId) ?? false

  const submitStop = () => {
    if (stopped || hasSubmitted) return
    setStopped(true)
    if (timerRef.current) clearInterval(timerRef.current)
    room.send({ action: 'stop', room_id: room.roomId, answers })
  }

  const nextRound = () => room.send({ action: 'next_round', room_id: room.roomId })

  const cats = state?.categories ?? CATEGORIES

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-sm">
      <GameHeader roomId={room.roomId} gameName="Stop" opponentOnline={room.opponentOnline}
        gameVotes={room.gameVotes} myUserId={userId} onVoteGame={room.voteGame} onBack={onBack} />

      {/* Scores */}
      <div className="flex gap-4 justify-center flex-wrap">
        {state?.players.map(p => (
          <div key={p} className="text-center">
            <div className="text-xs text-zinc-500">{p === userId ? 'você' : p.slice(0,8)}</div>
            <div className="text-lg font-bold text-white">{state.scores[p] ?? 0}pts</div>
          </div>
        ))}
      </div>

      {state?.phase === 'playing' && (
        <>
          <div className="flex items-center justify-between w-full">
            <div className="text-center">
              <p className="text-xs text-zinc-500">Rodada {state.round}</p>
              <p className="text-5xl font-black text-primary">{state.letter}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-500">Tempo</p>
              <p className={`text-2xl font-bold ${timeLeft <= 5 ? 'text-red-400' : 'text-white'}`}>{timeLeft}s</p>
            </div>
          </div>

          {state.stopper && !hasSubmitted && (
            <p className="text-yellow-400 text-xs text-center animate-pulse">
              ⚠ {state.stopper === userId ? 'Você chamou' : 'Alguém chamou'} STOP! Envie suas respostas.
            </p>
          )}

          {!hasSubmitted ? (
            <div className="w-full flex flex-col gap-2">
              {cats.map(cat => (
                <div key={cat} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 w-16 shrink-0">{cat}</span>
                  <input value={answers[cat] ?? ''}
                    onChange={e => setAnswers(prev => ({ ...prev, [cat]: e.target.value }))}
                    placeholder={`${cat} com ${state.letter}...`}
                    className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-primary rounded-lg px-2.5 py-1.5 text-sm text-white placeholder-zinc-600 outline-none" />
                </div>
              ))}
              <Button onClick={submitStop} className="w-full bg-red-900 border-red-700 hover:bg-red-800 mt-1">
                STOP! 🛑
              </Button>
            </div>
          ) : (
            <p className="text-primary font-semibold animate-pulse">✓ Enviado! Aguardando adversários...</p>
          )}
        </>
      )}

      {state?.phase === 'review' && state.round_results && (
        <div className="w-full flex flex-col gap-2">
          <p className="text-center font-bold text-white">Resultados — Rodada {state.round - 1}</p>
          {cats.map(cat => (
            <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">{cat}</p>
              <div className="flex flex-col gap-1">
                {state.players.map(p => {
                  const r = state.round_results![p]?.[cat]
                  const pts = r?.points ?? 0
                  return (
                    <div key={p} className="flex justify-between text-sm">
                      <span className="text-zinc-400">{p === userId ? 'você' : p.slice(0,8)}</span>
                      <span className={pts === 10 ? 'text-green-400' : pts === 5 ? 'text-yellow-400' : 'text-zinc-600'}>
                        {r?.answer || '—'} ({pts}pts)
                      </span>
                    </div>
                  )
                })}
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
