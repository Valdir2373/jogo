import { useState, useCallback } from 'react'
import { Button } from '../components/Button'
import { GameLobby, WaitingRoom, GameHeader } from '../components/GameLobby'
import { useGameRoom } from '../useGameRoom'

interface TDState {
  phase: 'choosing' | 'voting' | 'confirming'
  current_player: string | null
  current_type: string | null
  options: string[]
  votes: Record<string, number>
  chosen_option: number | null
  history: { player: string; type: string; text: string }[]
  players: string[]
  restart_votes: string[]
  ready: boolean
}

interface Props {
  userId: string; resumeRoomId: string | null
  onBack: () => void; onGameChanged: (r: string, g: string) => void
}

export function TruthDare({ userId, resumeRoomId, onBack, onGameChanged }: Props) {
  const [state, setState] = useState<TDState | null>(null)

  const onState = useCallback((s: Record<string, unknown>) => setState(s as unknown as TDState), [])
  const room = useGameRoom({ userId, gameType: 'truth_dare', resumeRoomId, onBack, onGameChanged, onState })

  if (room.screen === 'lobby') return <GameLobby title="Verdade ou Desafio" gameType="truth_dare" error={room.error} onCreateRoom={room.createRoom} onJoinRoom={room.joinRoom} onBack={onBack} />
  if (room.screen === 'waiting') return <WaitingRoom roomId={room.roomId} onBack={onBack} />

  const isCurrentPlayer = state?.current_player === userId
  const alreadyVoted    = state?.votes[userId] !== undefined
  const chosenText      = state?.chosen_option !== null && state?.chosen_option !== undefined ? state?.options[state.chosen_option] : null

  const choose  = (type: string)  => room.send({ action: 'choose',        room_id: room.roomId, type })
  const vote    = (i: number)     => room.send({ action: 'vote_question', room_id: room.roomId, option: i })
  const confirm = ()              => room.send({ action: 'confirm_done',  room_id: room.roomId })
  const skip    = ()              => room.send({ action: 'skip',          room_id: room.roomId })

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      <GameHeader roomId={room.roomId} gameName="Verdade ou Desafio" opponentOnline={room.opponentOnline}
        gameVotes={room.gameVotes} myUserId={userId} onVoteGame={room.voteGame} onBack={onBack} />

      {/* Turn indicator */}
      <div className="text-center">
        <p className="text-xs text-zinc-500">Vez de</p>
        <p className="text-lg font-bold text-pink-400">
          {state?.current_player === userId ? 'você' : state?.current_player?.slice(0,10)}
        </p>
      </div>

      {/* Choosing */}
      {state?.phase === 'choosing' && isCurrentPlayer && (
        <div className="flex gap-3 w-full">
          <button onClick={() => choose('verdade')}
            className="flex-1 flex flex-col items-center gap-2 bg-zinc-900 border border-zinc-700 hover:border-pink-600 rounded-xl px-4 py-5 transition-all">
            <span className="text-3xl">🤫</span>
            <span className="font-semibold text-white">Verdade</span>
          </button>
          <button onClick={() => choose('desafio')}
            className="flex-1 flex flex-col items-center gap-2 bg-zinc-900 border border-zinc-700 hover:border-pink-600 rounded-xl px-4 py-5 transition-all">
            <span className="text-3xl">🎯</span>
            <span className="font-semibold text-white">Desafio</span>
          </button>
        </div>
      )}
      {state?.phase === 'choosing' && !isCurrentPlayer && (
        <p className="text-zinc-500 text-sm animate-pulse">Aguardando escolha...</p>
      )}

      {/* Voting — others vote, current player waits */}
      {state?.phase === 'voting' && (
        <div className="w-full flex flex-col gap-2">
          <p className="text-xs text-zinc-500 text-center uppercase tracking-widest">
            {state.current_type === 'verdade' ? '🤫 Verdade' : '🎯 Desafio'} — vote na melhor opção
          </p>
          {state.options.map((opt, i) => {
            const voteCount = Object.values(state.votes).filter(v => v === i).length
            const iVoted    = state.votes[userId] === i
            return (
              <button key={i} onClick={() => !isCurrentPlayer && !alreadyVoted && vote(i)}
                disabled={isCurrentPlayer || alreadyVoted}
                className={[
                  'w-full text-left px-3 py-3 rounded-xl text-sm border transition-all',
                  iVoted ? 'border-pink-600 bg-pink-950 text-white' :
                  isCurrentPlayer || alreadyVoted ? 'border-zinc-800 text-zinc-500 cursor-default' :
                  'border-zinc-700 hover:border-pink-600 text-zinc-300'
                ].join(' ')}>
                <div className="flex justify-between items-start gap-2">
                  <span>{opt}</span>
                  {voteCount > 0 && <span className="text-pink-400 text-xs shrink-0">{voteCount}✓</span>}
                </div>
              </button>
            )
          })}
          {isCurrentPlayer && <p className="text-zinc-600 text-sm text-center animate-pulse">Os outros estão votando...</p>}
          {!isCurrentPlayer && alreadyVoted && <p className="text-zinc-500 text-sm text-center">✓ Voto registrado</p>}
        </div>
      )}

      {/* Confirming — current player confirms they did it */}
      {state?.phase === 'confirming' && (
        <div className="w-full flex flex-col gap-3">
          <div className="bg-zinc-900 border border-pink-800 rounded-xl p-4 text-center">
            <p className="text-xs text-zinc-500 mb-1">{state.current_type === 'verdade' ? '🤫 Verdade escolhida' : '🎯 Desafio escolhido'}</p>
            <p className="text-white font-semibold">{chosenText}</p>
          </div>
          {isCurrentPlayer ? (
            <div className="flex gap-2">
              <Button onClick={confirm} className="flex-1">✓ Feito!</Button>
              <Button onClick={skip} variant="ghost" className="flex-1">Pular</Button>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center animate-pulse">Aguardando...</p>
          )}
        </div>
      )}

      {/* History */}
      {state && state.history.length > 0 && (
        <div className="w-full flex flex-col gap-1 mt-1">
          <p className="text-xs text-zinc-600 uppercase tracking-widest">Histórico</p>
          {state.history.slice(-4).reverse().map((h, i) => (
            <div key={i} className="text-xs bg-zinc-900 rounded-lg px-3 py-2">
              <span className="text-zinc-500">{h.player === userId ? 'você' : h.player.slice(0,8)} · {h.type}: </span>
              <span className="text-zinc-400">{h.text.slice(0, 60)}</span>
            </div>
          ))}
        </div>
      )}

      {room.error && <p className="text-red-400 text-sm">{room.error}</p>}
    </div>
  )
}
