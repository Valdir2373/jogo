import { useState, useCallback } from 'react'
import { Button } from '../components/Button'
import { GameLobby, WaitingRoom, GameHeader, RestartVoting } from '../components/GameLobby'
import { useGameRoom } from '../useGameRoom'

interface Card { suit: string; value: string }
interface BJState {
  phase: 'waiting' | 'playing' | 'dealer' | 'over'
  player_hands: Record<string, Card[]>
  player_values: Record<string, number>
  player_stands: Record<string, boolean>
  player_busted: Record<string, boolean>
  dealer_hand: Card[]
  dealer_value: number | null
  dealer_done: boolean
  current_turn: string | null
  round_result: Record<string, { value: number; outcome: string }> | null
  scores: Record<string, number>
  players: string[]
  restart_votes: string[]
  ready: boolean
}

interface Props {
  userId: string; resumeRoomId: string | null
  onBack: () => void; onGameChanged: (r: string, g: string) => void
}

function CardView({ card }: { card: Card }) {
  const red = card.suit === '♥' || card.suit === '♦'
  return (
    <div className={`inline-flex flex-col justify-between w-10 h-14 bg-white rounded-md border border-zinc-300 px-1 py-0.5 text-xs font-bold ${red ? 'text-red-600' : 'text-zinc-900'}`}>
      <span>{card.value}</span>
      <span className="self-end">{card.suit}</span>
    </div>
  )
}

const OUTCOME_LABEL: Record<string, string> = {
  win: '🎉 Ganhou!', lose: '😞 Perdeu', push: '🤝 Empate', bust: '💥 Estourou'
}

export function Blackjack({ userId, resumeRoomId, onBack, onGameChanged }: Props) {
  const [state, setState] = useState<BJState | null>(null)

  const onState = useCallback((s: Record<string, unknown>) => setState(s as unknown as BJState), [])
  const room = useGameRoom({ userId, gameType: 'blackjack', resumeRoomId, onBack, onGameChanged, onState })

  if (room.screen === 'lobby') return <GameLobby title="Blackjack" gameType="blackjack" error={room.error} onCreateRoom={() => room.createRoom()} onJoinRoom={room.joinRoom} onBack={onBack} />
  if (room.screen === 'waiting') return <WaitingRoom roomId={room.roomId} onBack={onBack} />

  const iVoted    = state?.restart_votes.includes(userId) ?? false
  const theyVoted = state?.restart_votes.some(id => id !== userId) ?? false
  const isMyTurn  = state?.current_turn === userId

  const hit   = () => room.send({ action: 'hit',   room_id: room.roomId })
  const stand = () => room.send({ action: 'stand', room_id: room.roomId })

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      <GameHeader roomId={room.roomId} gameName="Blackjack" opponentOnline={room.opponentOnline}
        gameVotes={room.gameVotes} myUserId={userId} onVoteGame={room.voteGame} onBack={onBack} />

      {/* Scores */}
      <div className="flex gap-6 justify-center">
        {state?.players.map(p => (
          <div key={p} className="text-center">
            <div className="text-xs text-zinc-500">{p === userId ? 'você' : p.slice(0,8)}</div>
            <div className="text-xl font-bold text-white">{state.scores[p] ?? 0}</div>
          </div>
        ))}
      </div>

      {/* Dealer */}
      <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3">
        <p className="text-xs text-zinc-500 mb-2">Banca {state?.dealer_done ? `(${state.dealer_value})` : ''}</p>
        <div className="flex gap-1.5 flex-wrap">
          {state?.dealer_hand.map((c, i) => <CardView key={i} card={c} />)}
        </div>
      </div>

      {/* Players */}
      {state?.players.map(p => (
        <div key={p} className={`w-full bg-zinc-900 border rounded-xl p-3 ${p === state.current_turn ? 'border-pink-700' : 'border-zinc-800'}`}>
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-semibold text-white">{p === userId ? 'você' : p.slice(0,8)}</p>
            <span className={`text-sm font-bold ${(state.player_values[p] ?? 0) > 21 ? 'text-red-400' : 'text-white'}`}>
              {state.player_values[p] ?? 0}
              {state.player_stands[p] && ' (stand)'}
              {state.player_busted[p] && ' 💥'}
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(state.player_hands[p] ?? []).map((c, i) => <CardView key={i} card={c} />)}
          </div>
          {state.round_result?.[p] && (
            <p className="text-sm font-bold mt-2 text-center">
              {OUTCOME_LABEL[state.round_result[p].outcome] ?? state.round_result[p].outcome}
            </p>
          )}
        </div>
      ))}

      {/* Actions */}
      {state?.phase === 'playing' && isMyTurn && !state.player_stands[userId] && !state.player_busted[userId] && (
        <div className="flex gap-3 w-full">
          <Button onClick={hit}   className="flex-1">Pedir carta</Button>
          <Button onClick={stand} variant="secondary" className="flex-1">Parar</Button>
        </div>
      )}
      {state?.phase === 'playing' && !isMyTurn && (
        <p className="text-zinc-500 text-sm animate-pulse">Aguardando {state.current_turn?.slice(0,8)}...</p>
      )}

      {state?.phase === 'over' && (
        <RestartVoting iVoted={iVoted} theyVoted={theyVoted} onVote={room.voteRestart} label="Nova rodada" />
      )}

      {room.error && <p className="text-red-400 text-sm">{room.error}</p>}
    </div>
  )
}
