import { useState, useCallback } from 'react'
import { GameLobby, WaitingRoom, GameHeader, RestartVoting } from '../components/GameLobby'
import { useGameRoom } from '../useGameRoom'

interface RpsState {
  phase: 'picking' | 'revealed'
  my_pick: string | null
  picks_pending: string[]
  revealed: Record<string, string>
  scores: Record<string, number>
  round: number
  results: { round: number; choices: Record<string, string>; winners: string[] }[]
  restart_votes: string[]
  players: string[]
  ready: boolean
  choices: string[]
}

const ICONS: Record<string, string> = {
  pedra: '🪨', papel: '📄', tesoura: '✂️', lagarto: '🦎', spock: '🖖'
}

interface Props {
  userId: string; resumeRoomId: string | null
  onBack: () => void; onGameChanged: (r: string, g: string) => void
}

export function Rps({ userId, resumeRoomId, onBack, onGameChanged }: Props) {
  const [state, setState] = useState<RpsState | null>(null)

  const onState = useCallback((s: Record<string, unknown>) => setState(s as unknown as RpsState), [])
  const room = useGameRoom({ userId, gameType: 'rps', resumeRoomId, onBack, onGameChanged, onState })

  if (room.screen === 'lobby') return <GameLobby title="Pedra Papel Tesoura" gameType="rps" error={room.error} onCreateRoom={room.createRoom} onJoinRoom={room.joinRoom} onBack={onBack} />
  if (room.screen === 'waiting') return <WaitingRoom roomId={room.roomId} onBack={onBack} />

  const iVoted    = state?.restart_votes.includes(userId) ?? false
  const theyVoted = state?.restart_votes.some(id => id !== userId) ?? false
  const picked    = !!state?.my_pick

  const pick = (choice: string) => room.send({ action: 'pick', room_id: room.roomId, choice })
  const nextRound = () => room.send({ action: 'restart_vote', room_id: room.roomId })

  const lastResult = state?.results[state.results.length - 1]

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      <GameHeader roomId={room.roomId} gameName="Pedra Papel Tesoura" opponentOnline={room.opponentOnline}
        gameVotes={room.gameVotes} myUserId={userId} onVoteGame={room.voteGame} onBack={onBack} />

      {/* Scores */}
      <div className="flex gap-6 justify-center">
        {state?.players.map(p => (
          <div key={p} className="text-center">
            <div className="text-xs text-zinc-500">{p === userId ? 'você' : 'adversário'}</div>
            <div className="text-2xl font-bold text-white">{state.scores[p] ?? 0}</div>
          </div>
        ))}
      </div>

      <p className="text-xs text-zinc-600">Rodada {state?.round ?? 1}</p>

      {/* Picking phase */}
      {state?.phase === 'picking' && (
        <div className="flex flex-col items-center gap-3 w-full">
          {!picked ? (
            <>
              <p className="text-zinc-400 text-sm">Escolha sua jogada:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {(state?.choices ?? ['pedra', 'papel', 'tesoura', 'lagarto', 'spock']).map(c => (
                  <button key={c} onClick={() => pick(c)}
                    className="flex flex-col items-center gap-1 bg-zinc-900 border border-zinc-700 hover:border-pink-600 rounded-xl px-4 py-3 transition-all">
                    <span className="text-2xl">{ICONS[c] ?? c}</span>
                    <span className="text-xs text-zinc-400 capitalize">{c}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <span className="text-4xl">{ICONS[state.my_pick!] ?? state.my_pick}</span>
              <p className="text-zinc-500 text-sm animate-pulse">
                Aguardando {state.picks_pending.length} jogador(es)...
              </p>
            </div>
          )}
        </div>
      )}

      {/* Revealed phase */}
      {state?.phase === 'revealed' && lastResult && (
        <div className="w-full flex flex-col gap-3">
          <div className="flex justify-around items-center bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            {state.players.map(p => (
              <div key={p} className="flex flex-col items-center gap-1">
                <span className="text-3xl">{ICONS[lastResult.choices[p]] ?? lastResult.choices[p]}</span>
                <span className="text-xs text-zinc-500">{p === userId ? 'você' : 'adversário'}</span>
                {lastResult.winners.includes(p) && <span className="text-xs text-pink-400 font-bold">ganhou!</span>}
              </div>
            ))}
          </div>
          {lastResult.winners.length === 0 && <p className="text-center text-zinc-400">Empate!</p>}
          <RestartVoting iVoted={iVoted} theyVoted={theyVoted} onVote={nextRound} label="Próxima rodada" />
        </div>
      )}

      {room.error && <p className="text-red-400 text-sm">{room.error}</p>}
    </div>
  )
}
