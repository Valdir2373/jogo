import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '../components/Button'
import { GameLobby, WaitingRoom, GameHeader, RestartVoting } from '../components/GameLobby'
import { useGameRoom } from '../useGameRoom'

interface QuizState {
  phase: 'waiting' | 'question' | 'scored' | 'done'
  question_index: number
  total_questions: number
  question: { text: string; opts: string[] } | null
  correct_answer: string | null
  answers: Record<string, number>
  my_answer: number | null
  scores: Record<string, number>
  players: string[]
  restart_votes: string[]
  ready: boolean
  time_per_q: number
}

interface Props {
  userId: string; resumeRoomId: string | null
  onBack: () => void; onGameChanged: (r: string, g: string) => void
}

export function Quiz({ userId, resumeRoomId, onBack, onGameChanged }: Props) {
  const [state,    setState]    = useState<QuizState | null>(null)
  const [timeLeft, setTimeLeft] = useState(15)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const onState = useCallback((s: Record<string, unknown>) => {
    const qs = s as unknown as QuizState
    setState(qs)
    if (qs.phase === 'question') setTimeLeft(qs.time_per_q)
  }, [])

  const room = useGameRoom({ userId, gameType: 'quiz', resumeRoomId, onBack, onGameChanged, onState })

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (state?.phase === 'question') {
      timerRef.current = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [state?.phase, state?.question_index])

  if (room.screen === 'lobby') return <GameLobby title="Quiz Relâmpago" gameType="quiz" error={room.error} onCreateRoom={room.createRoom} onJoinRoom={room.joinRoom} onBack={onBack} />
  if (room.screen === 'waiting') return <WaitingRoom roomId={room.roomId} onBack={onBack} />

  const iVoted    = state?.restart_votes.includes(userId) ?? false
  const theyVoted = state?.restart_votes.some(id => id !== userId) ?? false
  const answered  = state?.my_answer !== null && state?.my_answer !== undefined

  const answer = (i: number) => {
    if (answered || state?.phase !== 'question') return
    room.send({ action: 'answer', room_id: room.roomId, option: i })
  }

  const nextQ = () => room.send({ action: 'next_question', room_id: room.roomId })

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      <GameHeader roomId={room.roomId} gameName="Quiz Relâmpago" opponentOnline={room.opponentOnline}
        gameVotes={room.gameVotes} myUserId={userId} onVoteGame={room.voteGame} onBack={onBack} />

      {/* Scores */}
      <div className="flex gap-6 justify-center">
        {state?.players.map(p => (
          <div key={p} className="text-center">
            <div className="text-xs text-zinc-500">{p === userId ? 'você' : p.slice(0,8)}</div>
            <div className="text-xl font-bold text-white">{state.scores[p] ?? 0} ⚡</div>
          </div>
        ))}
      </div>

      {/* Progress */}
      {state && state.total_questions > 0 && (
        <div className="w-full">
          <div className="flex justify-between text-xs text-zinc-600 mb-1">
            <span>Pergunta {state.question_index + 1}/{state.total_questions}</span>
            {state.phase === 'question' && <span className={timeLeft <= 5 ? 'text-red-400 font-bold' : ''}>{timeLeft}s</span>}
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5">
            <div className="bg-pink-500 h-1.5 rounded-full transition-all"
              style={{ width: `${((state.question_index) / state.total_questions) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Question */}
      {(state?.phase === 'question' || state?.phase === 'scored') && state?.question && (
        <div className="w-full flex flex-col gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-white font-semibold text-center">{state.question.text}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {state.question.opts.map((opt, i) => {
              const isMyAnswer   = state.my_answer === i
              const isCorrect    = state.correct_answer && opt.toLowerCase() === state.correct_answer
              const isWrong      = state.phase === 'scored' && isMyAnswer && !isCorrect
              return (
                <button key={i} onClick={() => answer(i)} disabled={answered || state.phase === 'scored'}
                  className={[
                    'w-full px-3 py-2.5 rounded-xl text-sm font-medium border transition-all',
                    isCorrect ? 'border-green-600 bg-green-950 text-green-300' :
                    isWrong   ? 'border-red-600 bg-red-950 text-red-300' :
                    isMyAnswer ? 'border-pink-600 bg-pink-950 text-pink-300' :
                    answered ? 'border-zinc-700 text-zinc-500 cursor-default' :
                    'border-zinc-700 hover:border-pink-600 text-zinc-300 cursor-pointer'
                  ].join(' ')}>
                  {opt}
                </button>
              )
            })}
          </div>

          {state.phase === 'scored' && (
            <div className="flex flex-col gap-2">
              <p className="text-center text-xs text-zinc-500">
                {state.players.map(p => `${p === userId ? 'você' : p.slice(0,6)}: ${state.question!.opts[state.answers[p]] ?? '—'}`).join(' · ')}
              </p>
              <Button onClick={nextQ} className="w-full">
                {(state.question_index + 1) < state.total_questions ? 'Próxima ⚡' : 'Ver resultado'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Done */}
      {state?.phase === 'done' && (
        <div className="text-center w-full">
          <p className="text-xl font-bold text-pink-400 mb-3">Quiz finalizado!</p>
          <div className="flex flex-col gap-1 mb-4">
            {Object.entries(state.scores).sort(([,a],[,b]) => b-a).map(([p, sc]) => (
              <div key={p} className="flex justify-between bg-zinc-900 rounded-lg px-4 py-2">
                <span className="text-white">{p === userId ? 'você' : p.slice(0,8)}</span>
                <span className="font-bold text-pink-400">{sc}/{state.total_questions}</span>
              </div>
            ))}
          </div>
          <RestartVoting iVoted={iVoted} theyVoted={theyVoted} onVote={room.voteRestart} label="Novo quiz" />
        </div>
      )}

      {room.error && <p className="text-red-400 text-sm">{room.error}</p>}
    </div>
  )
}
