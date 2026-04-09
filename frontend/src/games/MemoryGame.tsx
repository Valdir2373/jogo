import { useState, useCallback } from 'react'
import { GameLobby, WaitingRoom, GameHeader, RestartVoting } from '../components/GameLobby'
import { useGameRoom } from '../useGameRoom'

interface Card { emoji: string | null; owner: string | null; face_up: boolean }

interface MemState {
  phase: 'waiting' | 'playing' | 'won'
  grid: Card[]
  flipped: number[]
  pending_flip_back: boolean
  current_player: string | null
  scores: Record<string, number>
  players: string[]
  restart_votes: string[]
  ready: boolean
}

interface Props {
  userId: string; resumeRoomId: string | null
  onBack: () => void; onGameChanged: (r: string, g: string) => void
}

export function MemoryGame({ userId, resumeRoomId, onBack, onGameChanged }: Props) {
  const [state, setState] = useState<MemState | null>(null)

  const onState = useCallback((s: Record<string, unknown>) => setState(s as unknown as MemState), [])
  const room = useGameRoom({ userId, gameType: 'memory_game', resumeRoomId, onBack, onGameChanged, onState })

  if (room.screen === 'lobby') return <GameLobby title="Jogo da Memória" gameType="memory_game" error={room.error} onCreateRoom={room.createRoom} onBack={onBack} />
  if (room.screen === 'waiting') return <WaitingRoom roomId={room.roomId} onBack={onBack} />

  const iVoted    = state?.restart_votes.includes(userId) ?? false
  const theyVoted = state?.restart_votes.some(id => id !== userId) ?? false
  const isMyTurn  = state?.current_player === userId

  const flip = (i: number) => {
    if (!isMyTurn || state?.phase !== 'playing') return
    room.send({ action: 'flip', room_id: room.roomId, index: i })
  }

  const cols = state && state.grid.length > 16 ? 5 : 4

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      <GameHeader roomId={room.roomId} gameName="Jogo da Memória" opponentOnline={room.opponentOnline}
        gameVotes={room.gameVotes} myUserId={userId} onVoteGame={room.voteGame} onBack={onBack} />

      {/* Scores */}
      <div className="flex gap-6 justify-center">
        {state?.players.map(p => (
          <div key={p} className="text-center">
            <div className="text-xs text-zinc-500">{p === userId ? 'você' : 'adversário'}</div>
            <div className="text-xl font-bold text-white">{state.scores[p] ?? 0} pares</div>
          </div>
        ))}
      </div>

      {state?.phase === 'playing' && (
        <p className={`text-sm font-medium ${isMyTurn ? 'text-white' : 'text-zinc-500'}`}>
          {isMyTurn ? 'Sua vez — vire duas cartas!' : 'Vez do adversário...'}
        </p>
      )}

      {/* Grid */}
      {state && (
        <div className={`grid gap-1.5 w-full`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {state.grid.map((card, i) => {
            const matched = !!card.owner
            const visible = card.face_up || matched
            const clickable = isMyTurn && !matched && !visible && state.phase === 'playing'
            return (
              <button key={i} onClick={() => flip(i)} disabled={!clickable}
                className={[
                  'aspect-square rounded-lg flex items-center justify-center text-xl transition-all border',
                  matched ? 'bg-pink-950 border-pink-700 cursor-default' :
                  visible ? 'bg-zinc-800 border-zinc-600' :
                  clickable ? 'bg-zinc-900 border-zinc-700 hover:border-pink-600 cursor-pointer' :
                  'bg-zinc-900 border-zinc-800 cursor-default'
                ].join(' ')}>
                {visible ? (card.emoji ?? '?') : ''}
              </button>
            )
          })}
        </div>
      )}

      {state?.phase === 'won' && (
        <div className="text-center">
          <p className="text-pink-400 font-bold text-lg">Fim de jogo!</p>
          <p className="text-zinc-400 text-sm">
            {Object.entries(state.scores).sort(([,a],[,b]) => b-a)[0]?.[0] === userId ? 'Você venceu!' : 'Adversário venceu!'}
          </p>
          <RestartVoting iVoted={iVoted} theyVoted={theyVoted} onVote={room.voteRestart} />
        </div>
      )}

      {room.error && <p className="text-red-400 text-sm">{room.error}</p>}
    </div>
  )
}
