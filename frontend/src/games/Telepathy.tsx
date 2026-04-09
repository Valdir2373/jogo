import { useState, useCallback } from 'react'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { GameLobby, WaitingRoom, GameHeader } from '../components/GameLobby'
import { useGameRoom } from '../useGameRoom'

interface TelState {
  phase: 'answering' | 'revealed' | 'won'
  category: string | null
  round: number
  score: number
  target: number
  my_answer: string | null
  submitted_ids: string[]
  revealed: Record<string, string> | null
  matches: [string, string][]
  players: string[]
  winner: string | null
  restart_votes: string[]
  ready: boolean
}

interface Props {
  userId: string; resumeRoomId: string | null
  onBack: () => void; onGameChanged: (r: string, g: string) => void
}

export function Telepathy({ userId, resumeRoomId, onBack, onGameChanged }: Props) {
  const [state,  setState]  = useState<TelState | null>(null)
  const [input,  setInput]  = useState('')

  const onState = useCallback((s: Record<string, unknown>) => { setState(s as unknown as TelState); setInput('') }, [])
  const room = useGameRoom({ userId, gameType: 'telepathy', resumeRoomId, onBack, onGameChanged, onState })

  if (room.screen === 'lobby') return <GameLobby title="Telepatia" gameType="telepathy" error={room.error} onCreateRoom={() => room.createRoom()} onJoinRoom={room.joinRoom} onBack={onBack} />
  if (room.screen === 'waiting') return <WaitingRoom roomId={room.roomId} onBack={onBack} />

  const iVoted    = state?.restart_votes.includes(userId) ?? false
  const theyVoted = state?.restart_votes.some(id => id !== userId) ?? false
  const submitted = state?.submitted_ids.includes(userId) ?? false

  const submit = () => {
    if (!input.trim()) return
    room.send({ action: 'submit', room_id: room.roomId, answer: input.trim() })
  }

  const nextRound = () => room.send({ action: 'next_round', room_id: room.roomId })

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      <GameHeader roomId={room.roomId} gameName="Telepatia" opponentOnline={room.opponentOnline}
        gameVotes={room.gameVotes} myUserId={userId} onVoteGame={room.voteGame} onBack={onBack} />

      {/* Score progress */}
      <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
        <p className="text-xs text-zinc-500 uppercase tracking-widest">Pontos do time</p>
        <div className="flex items-center gap-2 justify-center mt-1">
          <span className="text-2xl font-bold text-pink-400">{state?.score ?? 0}</span>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-400">{state?.target ?? 10}</span>
        </div>
        <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-2">
          <div className="bg-pink-500 h-1.5 rounded-full transition-all" style={{ width: `${((state?.score ?? 0) / (state?.target ?? 10)) * 100}%` }} />
        </div>
      </div>

      {/* Category */}
      {state?.category && (
        <div className="text-center">
          <p className="text-xs text-zinc-500 uppercase tracking-widest">Categoria · Rodada {state.round}</p>
          <p className="text-2xl font-bold text-white mt-1">{state.category}</p>
        </div>
      )}

      {/* Answering */}
      {state?.phase === 'answering' && !submitted && (
        <div className="flex gap-2 w-full">
          <Input className="flex-1" placeholder="Sua resposta..." value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} maxLength={40} />
          <Button onClick={submit}>Enviar</Button>
        </div>
      )}
      {state?.phase === 'answering' && submitted && (
        <div className="text-center">
          <p className="text-pink-400 font-semibold">✓ Enviado: "{state.my_answer}"</p>
          <p className="text-zinc-500 text-sm mt-1 animate-pulse">
            Aguardando {(state.players.length - state.submitted_ids.length)} jogador(es)...
          </p>
        </div>
      )}

      {/* Revealed */}
      {state?.phase === 'revealed' && (
        <div className="w-full flex flex-col gap-2">
          <p className="text-xs text-zinc-500 uppercase tracking-widest text-center">Respostas</p>
          {state.players.map(p => {
            const ans = state.revealed?.[p] ?? '—'
            const isMatch = state.matches.some(m => m.includes(p))
            return (
              <div key={p} className={`flex justify-between items-center px-3 py-2 rounded-lg border ${isMatch ? 'border-green-700 bg-green-950' : 'border-zinc-700 bg-zinc-900'}`}>
                <span className="text-sm text-zinc-400">{p === userId ? 'você' : 'adversário'}</span>
                <span className={`font-semibold ${isMatch ? 'text-green-400' : 'text-white'}`}>{ans}</span>
              </div>
            )
          })}
          {state.matches.length > 0 && <p className="text-center text-green-400 font-bold">+{state.matches.length} ponto(s)! 🎉</p>}
          {state.matches.length === 0 && <p className="text-center text-zinc-500">Sem telepatia desta vez...</p>}
          <Button onClick={nextRound} className="w-full mt-2">Próxima rodada</Button>
        </div>
      )}

      {/* Won */}
      {state?.phase === 'won' && (
        <div className="text-center">
          <p className="text-pink-400 text-xl font-bold">🧠 {state.target} pontos! Vocês têm telepatia!</p>
          <div className="flex gap-2 mt-3">
            {!iVoted ? <Button onClick={room.voteRestart} className="w-full">Jogar de novo</Button>
              : !theyVoted ? <p className="text-zinc-500 text-sm">Aguardando...</p> : null}
          </div>
        </div>
      )}

      {room.error && <p className="text-red-400 text-sm">{room.error}</p>}
    </div>
  )
}
