import { useState, useCallback } from 'react'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { GameLobby, WaitingRoom, GameHeader, RestartVoting } from '../components/GameLobby'
import { useGameRoom } from '../useGameRoom'

interface GuessState {
  phase: 'choosing' | 'playing' | 'won'
  hint: string | null
  chooser: string | null
  winner: string | null
  players: string[]
  scores: Record<string, number>
  guesses: { player: string; number: number }[]
  restart_votes: string[]
  ready: boolean
  range: [number, number]
}

interface Props {
  userId: string; resumeRoomId: string | null
  onBack: () => void; onGameChanged: (r: string, g: string) => void
}

export function GuessNumber({ userId, resumeRoomId, onBack, onGameChanged }: Props) {
  const [state,       setState]       = useState<GuessState | null>(null)
  const [numInput,    setNumInput]    = useState('')
  const [secretInput, setSecretInput] = useState('')

  const onState = useCallback((s: Record<string, unknown>) => setState(s as unknown as GuessState), [])
  const room = useGameRoom({ userId, gameType: 'guess_number', resumeRoomId, onBack, onGameChanged, onState })

  if (room.screen === 'lobby') return <GameLobby title="Adivinhe o Número" gameType="guess_number" error={room.error} onCreateRoom={room.createRoom} onJoinRoom={room.joinRoom} onBack={onBack} />
  if (room.screen === 'waiting') return <WaitingRoom roomId={room.roomId} onBack={onBack} />

  const iVoted = state?.restart_votes.includes(userId) ?? false
  const theyVoted = state?.restart_votes.some(id => id !== userId) ?? false
  const isChooser = state?.chooser === userId
  const [min, max] = state?.range ?? [1, 100]

  const setSecret = () => {
    const n = parseInt(secretInput)
    if (isNaN(n)) return
    room.send({ action: 'set_number', room_id: room.roomId, number: n })
    setSecretInput('')
  }

  const makeGuess = () => {
    const n = parseInt(numInput)
    if (isNaN(n)) return
    room.send({ action: 'guess', room_id: room.roomId, number: n })
    setNumInput('')
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      <GameHeader roomId={room.roomId} gameName="Adivinhe o Número" opponentOnline={room.opponentOnline}
        gameVotes={room.gameVotes} myUserId={userId} onVoteGame={room.voteGame} onBack={onBack} />

      {/* Scores */}
      <div className="flex gap-4 justify-center">
        {state?.players.map(p => (
          <div key={p} className="flex flex-col items-center">
            <span className="text-xs text-zinc-500">{p === userId ? 'você' : 'adversário'}</span>
            <span className={`text-lg font-bold ${p === state.chooser ? 'text-pink-400' : 'text-white'}`}>
              {state.scores[p] ?? 0}pts {p === state.chooser ? '📝' : ''}
            </span>
          </div>
        ))}
      </div>

      {/* Choosing phase — chooser */}
      {state?.phase === 'choosing' && isChooser && (
        <div className="w-full flex flex-col gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-white font-semibold text-center">Você escolhe o número secreto!</p>
          <p className="text-zinc-500 text-xs text-center">({min}–{max})</p>
          <Input type="number" placeholder={`${min}–${max}`} value={secretInput}
            onChange={e => setSecretInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setSecret()}
            min={min} max={max} />
          <Button onClick={setSecret} className="w-full">Confirmar</Button>
        </div>
      )}

      {/* Choosing phase — guesser */}
      {state?.phase === 'choosing' && !isChooser && (
        <p className="text-zinc-500 text-sm animate-pulse">Aguardando o escolhedor definir o número...</p>
      )}

      {/* Playing phase */}
      {state?.phase === 'playing' && (
        <div className="w-full flex flex-col gap-3">
          {state.hint && (
            <div className="text-center py-3">
              <span className={`text-2xl font-bold ${state.hint === 'maior' ? 'text-green-400' : state.hint === 'menor' ? 'text-red-400' : 'text-pink-400'}`}>
                {state.hint === 'maior' ? '⬆ Maior!' : state.hint === 'menor' ? '⬇ Menor!' : state.hint}
              </span>
            </div>
          )}

          {!isChooser && (
            <div className="flex gap-2 w-full">
              <Input type="number" placeholder={`Seu palpite (${min}–${max})`} value={numInput}
                onChange={e => setNumInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && makeGuess()}
                min={min} max={max} className="flex-1" />
              <Button onClick={makeGuess}>Tentar</Button>
            </div>
          )}
          {isChooser && <p className="text-zinc-600 text-sm text-center animate-pulse">Aguardando palpites...</p>}

          {state.guesses.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-zinc-600 uppercase tracking-widest">Histórico</p>
              {state.guesses.slice(-6).map((g, i) => (
                <div key={i} className="flex justify-between text-sm bg-zinc-900 rounded-lg px-3 py-1.5">
                  <span className="text-zinc-400">{g.player === userId ? 'você' : 'adversário'}</span>
                  <span className="font-mono text-white">{g.number}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Won */}
      {state?.phase === 'won' && (
        <div className="text-center">
          <p className="text-xl font-bold text-pink-400">
            {state.winner === userId ? '🎉 Você acertou!' : '😅 Adversário acertou!'}
          </p>
          <RestartVoting iVoted={iVoted} theyVoted={theyVoted} onVote={room.voteRestart} />
        </div>
      )}

      {room.error && <p className="text-red-400 text-sm">{room.error}</p>}
    </div>
  )
}
