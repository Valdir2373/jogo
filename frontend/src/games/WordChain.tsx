import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { GameLobby, WaitingRoom, GameHeader, RestartVoting } from '../components/GameLobby'
import { useGameRoom } from '../useGameRoom'

interface WCState {
  phase: 'waiting' | 'playing' | 'over'
  current_word: string | null
  last_letter: string | null
  current_player: string | null
  lives: Record<string, number>
  history: { player: string; word: string }[]
  winner: string | null
  players: string[]
  restart_votes: string[]
  ready: boolean
  turn_time: number
}

interface Props {
  userId: string; resumeRoomId: string | null
  onBack: () => void; onGameChanged: (r: string, g: string) => void
}

export function WordChain({ userId, resumeRoomId, onBack, onGameChanged }: Props) {
  const [state,     setState]     = useState<WCState | null>(null)
  const [input,     setInput]     = useState('')
  const [timeLeft,  setTimeLeft]  = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const onState = useCallback((s: Record<string, unknown>) => {
    const ws = s as unknown as WCState
    setState(ws)
    if (ws.phase === 'playing') {
      setTimeLeft(ws.turn_time)
    }
  }, [])

  const room = useGameRoom({ userId, gameType: 'word_chain', resumeRoomId, onBack, onGameChanged, onState })

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (state?.phase === 'playing') {
      timerRef.current = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [state?.current_player, state?.phase])

  if (room.screen === 'lobby') return <GameLobby title="Palavras Encadeadas" gameType="word_chain" error={room.error} onCreateRoom={room.createRoom} onBack={onBack} />
  if (room.screen === 'waiting') return <WaitingRoom roomId={room.roomId} onBack={onBack} />

  const isMyTurn  = state?.current_player === userId
  const iVoted    = state?.restart_votes.includes(userId) ?? false
  const theyVoted = state?.restart_votes.some(id => id !== userId) ?? false

  const submit = () => {
    if (!input.trim() || !isMyTurn) return
    room.send({ action: 'submit_word', room_id: room.roomId, word: input.trim() })
    setInput('')
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      <GameHeader roomId={room.roomId} gameName="Palavras Encadeadas" opponentOnline={room.opponentOnline}
        gameVotes={room.gameVotes} myUserId={userId} onVoteGame={room.voteGame} onBack={onBack} />

      {/* Lives */}
      <div className="flex gap-4 justify-center">
        {state?.players.map(p => (
          <div key={p} className="text-center">
            <div className="text-xs text-zinc-500">{p === userId ? 'você' : 'adversário'}</div>
            <div className="text-lg">{'❤️'.repeat(state.lives[p] ?? 0)}{'🖤'.repeat(3 - (state.lives[p] ?? 0))}</div>
          </div>
        ))}
      </div>

      {state?.phase === 'playing' && (
        <>
          {/* Current word + last letter */}
          <div className="text-center">
            <p className="text-xs text-zinc-600 uppercase tracking-widest">Palavra atual</p>
            <p className="text-2xl font-bold text-white">{state.current_word}</p>
            <p className="text-primary-accent font-bold text-lg">→ começa com <span className="text-3xl">{state.last_letter}</span></p>
          </div>

          {/* Timer */}
          {isMyTurn && (
            <div className="w-full">
              <div className="flex justify-between text-xs text-zinc-600 mb-1">
                <span>Tempo</span><span className={timeLeft <= 3 ? 'text-red-400 font-bold' : ''}>{timeLeft}s</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${timeLeft <= 3 ? 'bg-red-500' : 'bg-primary'}`}
                  style={{ width: `${(timeLeft / (state.turn_time ?? 10)) * 100}%` }} />
              </div>
            </div>
          )}

          {/* Input */}
          {isMyTurn ? (
            <div className="flex gap-2 w-full">
              <Input className="flex-1" placeholder={`Começa com ${state.last_letter}...`} value={input}
                onChange={e => setInput(e.target.value.toLowerCase())}
                onKeyDown={e => e.key === 'Enter' && submit()} maxLength={30} />
              <Button onClick={submit}>Enviar</Button>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm animate-pulse">Vez do adversário...</p>
          )}

          {/* History */}
          <div className="w-full flex flex-col gap-1 mt-1">
            {state.history.slice(-6).reverse().map((h, i) => (
              <div key={i} className={`flex justify-between text-sm px-3 py-1.5 rounded-lg ${h.player === 'game' ? 'bg-zinc-950 border border-zinc-800' : 'bg-zinc-900'}`}>
                <span className="text-zinc-500">{h.player === 'game' ? '🎮' : h.player === userId ? 'você' : 'adversário'}</span>
                <span className={h.word.includes('tempo') ? 'text-red-400' : 'text-white'}>{h.word}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {state?.phase === 'over' && (
        <div className="text-center">
          <p className="text-xl font-bold text-primary-accent">
            {state.winner === userId ? '🎉 Você venceu!' : '😅 Você perdeu.'}
          </p>
          <RestartVoting iVoted={iVoted} theyVoted={theyVoted} onVote={room.voteRestart} />
        </div>
      )}

      {room.error && <p className="text-red-400 text-sm">{room.error}</p>}
    </div>
  )
}
