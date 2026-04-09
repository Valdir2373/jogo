import { useState, useCallback, useEffect } from 'react'
import { GameLobby, WaitingRoom, GameHeader, RestartVoting } from '../components/GameLobby'
import { useGameRoom } from '../useGameRoom'

interface BombState {
  phase: 'waiting' | 'playing' | 'over'
  holder: string | null
  lives: Record<string, number>
  round: number
  time_left: number | null
  fuse_duration: number | null
  exploded_at: string | null
  winner: string | null
  players: string[]
  restart_votes: string[]
  ready: boolean
}

interface Props {
  userId: string; resumeRoomId: string | null
  onBack: () => void; onGameChanged: (r: string, g: string) => void
}

export function TimeBomb({ userId, resumeRoomId, onBack, onGameChanged }: Props) {
  const [state, setState] = useState<BombState | null>(null)
  const [localTime, setLocalTime] = useState<number | null>(null)

  const onState = useCallback((s: Record<string, unknown>) => {
    const bs = s as unknown as BombState
    setState(bs)
    setLocalTime(bs.time_left)
  }, [])

  const room = useGameRoom({ userId, gameType: 'time_bomb', resumeRoomId, onBack, onGameChanged, onState })

  // Local countdown tick
  useEffect(() => {
    if (state?.phase !== 'playing' || localTime === null) return
    if (localTime <= 0) return
    const t = setTimeout(() => setLocalTime(l => l !== null ? Math.max(0, l - 0.1) : null), 100)
    return () => clearTimeout(t)
  }, [localTime, state?.phase])

  if (room.screen === 'lobby') return <GameLobby title="Bomba Relógio" gameType="time_bomb" error={room.error} onCreateRoom={() => room.createRoom()} onJoinRoom={room.joinRoom} onBack={onBack} />
  if (room.screen === 'waiting') return <WaitingRoom roomId={room.roomId} onBack={onBack} />

  const iVoted    = state?.restart_votes.includes(userId) ?? false
  const theyVoted = state?.restart_votes.some(id => id !== userId) ?? false
  const iHoldBomb = state?.holder === userId
  const pct = (localTime !== null && state?.fuse_duration) ? (localTime / state.fuse_duration) * 100 : 100

  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-sm">
      <GameHeader roomId={room.roomId} gameName="Bomba Relógio" opponentOnline={room.opponentOnline}
        gameVotes={room.gameVotes} myUserId={userId} onVoteGame={room.voteGame} onBack={onBack} />

      {state?.phase === 'playing' && (
        <>
          {/* Bomb visual */}
          <div className={`relative text-center transition-all duration-300 ${iHoldBomb ? 'scale-125' : 'scale-100 opacity-60'}`}>
            <span className="text-7xl">{iHoldBomb ? '💣' : '💣'}</span>
            {iHoldBomb && <p className="text-red-400 font-bold text-sm mt-1 animate-pulse">VOCÊ ESTÁ COM A BOMBA!</p>}
          </div>

          {/* Fuse bar */}
          {localTime !== null && (
            <div className="w-full">
              <div className="flex justify-between text-xs text-zinc-600 mb-1">
                <span>Estopim</span>
                <span className={pct < 30 ? 'text-red-400 font-bold' : ''}>{localTime?.toFixed(1)}s</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-3">
                <div className={`h-3 rounded-full transition-all ${pct < 30 ? 'bg-red-500' : pct < 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {/* Holders */}
          <div className="flex gap-3 flex-wrap justify-center">
            {state.players.map(p => (
              <div key={p} className={`flex flex-col items-center px-3 py-2 rounded-xl border ${state.holder === p ? 'border-red-600 bg-red-950' : 'border-zinc-700 bg-zinc-900'}`}>
                <span className="text-xs text-zinc-400">{p === userId ? 'você' : p.slice(0, 8)}</span>
                <span className="text-sm">{'❤️'.repeat(state.lives[p] ?? 0)}{'🖤'.repeat(3 - (state.lives[p] ?? 0))}</span>
                {state.holder === p && <span className="text-xs text-red-400">💣</span>}
              </div>
            ))}
          </div>

          {state.exploded_at && (
            <p className="text-center text-red-400 font-bold text-lg animate-bounce">
              💥 {state.exploded_at === userId ? 'VOCÊ EXPLODIU!' : `${state.exploded_at.slice(0,8)} explodiu!`}
            </p>
          )}

          <p className="text-xs text-zinc-600">Rodada {state.round}</p>
        </>
      )}

      {state?.phase === 'over' && (
        <div className="text-center">
          <p className="text-xl font-bold text-pink-400">
            {state.winner === userId ? '🎉 Você sobreviveu!' : '💥 Você explodiu!'}
          </p>
          <RestartVoting iVoted={iVoted} theyVoted={theyVoted} onVote={room.voteRestart} />
        </div>
      )}

      {state?.phase === 'waiting' && <p className="text-zinc-500 text-sm animate-pulse">Aguardando 3+ jogadores...</p>}

      {room.error && <p className="text-red-400 text-sm">{room.error}</p>}
    </div>
  )
}
