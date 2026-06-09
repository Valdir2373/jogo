import { useState, useCallback } from 'react'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { GameLobby, WaitingRoom, GameHeader, RestartVoting } from '../components/GameLobby'
import { useGameRoom } from '../useGameRoom'

interface WAIState {
  phase: 'assigning' | 'playing' | 'won'
  words: Record<string, string>
  questions: { asker: string; text: string; answer: string | null }[]
  pending_q: number | null
  current_guesser: string | null
  solved: Record<string, boolean>
  winner: string | null
  assigner: string | null
  players: string[]
  restart_votes: string[]
  ready: boolean
}

interface Props {
  userId: string; resumeRoomId: string | null
  onBack: () => void; onGameChanged: (r: string, g: string) => void
}

export function WhoAmI({ userId, resumeRoomId, onBack, onGameChanged }: Props) {
  const [state,    setState]    = useState<WAIState | null>(null)
  const [wordMap,  setWordMap]  = useState<Record<string, string>>({})
  const [question, setQuestion] = useState('')
  const [guess,    setGuess]    = useState('')

  const onState = useCallback((s: Record<string, unknown>) => setState(s as unknown as WAIState), [])
  const room = useGameRoom({ userId, gameType: 'who_am_i', resumeRoomId, onBack, onGameChanged, onState })

  if (room.screen === 'lobby') return <GameLobby title="Quem Sou Eu?" gameType="who_am_i" error={room.error} onCreateRoom={room.createRoom} onBack={onBack} />
  if (room.screen === 'waiting') return <WaitingRoom roomId={room.roomId} onBack={onBack} />

  const isAssigner = state?.assigner === userId
  const isGuesser  = state?.current_guesser === userId
  const iVoted     = state?.restart_votes.includes(userId) ?? false
  const theyVoted  = state?.restart_votes.some(id => id !== userId) ?? false
  const pendingQ   = state != null && state.pending_q !== null && state.pending_q !== undefined

  const assignWords = () => {
    if (!state?.players.every(p => wordMap[p]?.trim())) { room.setError('Defina uma palavra para cada jogador.'); return }
    room.send({ action: 'assign_words', room_id: room.roomId, words: wordMap })
  }

  const askQuestion = () => {
    if (!question.trim()) return
    room.send({ action: 'ask_question', room_id: room.roomId, question })
    setQuestion('')
  }

  const answerQ = (ans: string) => {
    room.send({ action: 'answer', room_id: room.roomId, answer: ans })
  }

  const makeGuess = () => {
    if (!guess.trim()) return
    room.send({ action: 'guess_word', room_id: room.roomId, guess })
    setGuess('')
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      <GameHeader roomId={room.roomId} gameName="Quem Sou Eu?" opponentOnline={room.opponentOnline}
        gameVotes={room.gameVotes} myUserId={userId} onVoteGame={room.voteGame} onBack={onBack} />

      {/* Assigning phase */}
      {state?.phase === 'assigning' && isAssigner && (
        <div className="w-full flex flex-col gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-white font-semibold">Atribua uma palavra a cada jogador:</p>
          {state?.players.map(p => (
            <div key={p} className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 w-16 shrink-0">{p === userId ? 'você' : p.slice(0, 8)}</span>
              <Input placeholder="personagem, objeto..." value={wordMap[p] ?? ''}
                onChange={e => setWordMap(prev => ({ ...prev, [p]: e.target.value }))}
                maxLength={40} />
            </div>
          ))}
          <Button onClick={assignWords} className="w-full mt-1">Iniciar</Button>
        </div>
      )}
      {state?.phase === 'assigning' && !isAssigner && (
        <p className="text-zinc-500 text-sm animate-pulse">Aguardando o mestre atribuir as palavras...</p>
      )}

      {/* Playing phase */}
      {state?.phase === 'playing' && (
        <div className="w-full flex flex-col gap-3">
          {/* Others' words (not mine) */}
          <div className="flex flex-wrap gap-2 justify-center">
            {Object.entries(state.words).map(([p, w]) => (
              <div key={p} className={`px-3 py-1.5 rounded-lg border text-sm ${state.solved[p] ? 'border-green-700 bg-green-950 text-green-300' : 'border-zinc-700 bg-zinc-900 text-white'}`}>
                <span className="text-xs text-zinc-500 block">{p === userId ? 'você' : p.slice(0, 8)}</span>
                {p !== userId ? w : (state.solved[p] ? w : '???')}
              </div>
            ))}
          </div>

          {/* Q&A log */}
          <div className="max-h-40 overflow-y-auto flex flex-col gap-1">
            {state.questions.slice(-8).map((q, i) => (
              <div key={i} className="text-sm bg-zinc-900 rounded-lg px-3 py-1.5">
                <span className="text-zinc-500">{q.asker === userId ? 'você' : q.asker.slice(0,6)}: </span>
                <span className="text-white">{q.text}</span>
                {q.answer && <span className={`ml-2 font-bold ${q.answer === 'sim' ? 'text-green-400' : 'text-red-400'}`}>{q.answer}</span>}
              </div>
            ))}
          </div>

          {/* Assigner answers pending question */}
          {isAssigner && pendingQ && (
            <div className="flex gap-2">
              <Button onClick={() => answerQ('sim')} className="flex-1 bg-green-900 border-green-700 hover:bg-green-800">Sim ✓</Button>
              <Button onClick={() => answerQ('não')} variant="secondary" className="flex-1">Não ✗</Button>
            </div>
          )}

          {/* Guesser asks/guesses */}
          {isGuesser && !pendingQ && (
            <>
              <div className="flex gap-2 w-full">
                <Input className="flex-1" placeholder="Faça uma pergunta sim/não..." value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && askQuestion()} maxLength={120} />
                <Button onClick={askQuestion}>❓</Button>
              </div>
              <div className="flex gap-2 w-full">
                <Input className="flex-1" placeholder="Tentar adivinhar minha palavra..." value={guess}
                  onChange={e => setGuess(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && makeGuess()} maxLength={40} />
                <Button variant="secondary" onClick={makeGuess}>Tentar</Button>
              </div>
            </>
          )}

          {!isGuesser && !isAssigner && <p className="text-zinc-600 text-sm text-center">Vez de {state.current_guesser?.slice(0,8)}...</p>}
          {isAssigner && !pendingQ && <p className="text-zinc-600 text-sm text-center animate-pulse">Aguardando pergunta...</p>}
        </div>
      )}

      {/* Won */}
      {state?.phase === 'won' && (
        <div className="text-center">
          <p className="text-xl font-bold text-primary-accent">🎭 Todos adivinharam!</p>
          <RestartVoting iVoted={iVoted} theyVoted={theyVoted} onVote={room.voteRestart} />
        </div>
      )}

      {room.error && <p className="text-red-400 text-sm">{room.error}</p>}
    </div>
  )
}
