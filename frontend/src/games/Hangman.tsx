import { useState, useEffect, useCallback } from 'react'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { GameLobby, WaitingRoom, GameHeader, RestartVoting } from '../components/GameLobby'
import { useWebSocket } from '../useWebSocket'

interface HangmanState {
  theme:           string | null
  display:         string[]
  guessed_letters: string[]
  wrong_letters:   string[]
  max_wrong:       number
  phase:           'choosing' | 'playing' | 'won' | 'lost'
  winner:          'guessers' | 'word_owner' | null
  word_length:     number
  word_revealed:   string | null
  word_owner:      string
  players:         string[]
  restart_votes:   string[]
  ready:           boolean
}

interface HangmanProps {
  userId: string
  resumeRoomId: string | null
  onBack: () => void
  onGameChanged: (roomId: string, gameType: string) => void
}

type Screen = 'lobby' | 'waiting' | 'game'

function HangmanFigure({ wrongCount }: { wrongCount: number }) {
  return (
    <svg viewBox="0 0 120 160" width="120" height="160" className="mx-auto">
      <line x1="10"  y1="155" x2="110" y2="155" stroke="#ec4899" strokeWidth="3" strokeLinecap="round" />
      <line x1="30"  y1="155" x2="30"  y2="5"   stroke="#ec4899" strokeWidth="3" strokeLinecap="round" />
      <line x1="30"  y1="5"   x2="75"  y2="5"   stroke="#ec4899" strokeWidth="3" strokeLinecap="round" />
      <line x1="75"  y1="5"   x2="75"  y2="25"  stroke="#ec4899" strokeWidth="3" strokeLinecap="round" />
      {wrongCount >= 1 && <circle cx="75" cy="35" r="10" stroke="white" strokeWidth="2.5" fill="none" />}
      {wrongCount >= 2 && <line x1="75" y1="45" x2="75" y2="95" stroke="white" strokeWidth="2.5" strokeLinecap="round" />}
      {wrongCount >= 3 && <line x1="75" y1="60" x2="52" y2="78" stroke="white" strokeWidth="2.5" strokeLinecap="round" />}
      {wrongCount >= 4 && <line x1="75" y1="60" x2="98" y2="78" stroke="white" strokeWidth="2.5" strokeLinecap="round" />}
      {wrongCount >= 5 && <line x1="75" y1="95" x2="52" y2="125" stroke="white" strokeWidth="2.5" strokeLinecap="round" />}
      {wrongCount >= 6 && <line x1="75" y1="95" x2="98" y2="125" stroke="white" strokeWidth="2.5" strokeLinecap="round" />}
    </svg>
  )
}

export function Hangman({ userId, resumeRoomId, onBack, onGameChanged }: HangmanProps) {
  const [screen,      setScreen]      = useState<Screen>('lobby')
  const [roomId,      setRoomId]      = useState(resumeRoomId ?? '')
  const [gameState,   setGameState]   = useState<HangmanState | null>(null)
  const [error,       setError]       = useState('')
  const [wordInput,   setWordInput]   = useState('')
  const [themeInput,  setThemeInput]  = useState('')
  const [wordError,   setWordError]   = useState('')
  const [gameVotes,   setGameVotes]   = useState<Record<string, string>>({})
  const [opponentOnline, setOpponentOnline] = useState(true)

  const isWordOwner = gameState?.word_owner === userId
  const phase       = gameState?.phase ?? 'choosing'
  const gameOver    = phase === 'won' || phase === 'lost'
  const iVoted      = gameState?.restart_votes.includes(userId) ?? false
  const theyVoted   = gameState?.restart_votes.some(id => id !== userId) ?? false

  const handleMessage = useCallback((msg: Record<string, unknown>) => {
    const event   = msg.event as string
    const payload = msg.payload as Record<string, unknown>
    switch (event) {
      case 'room_created':
        setRoomId(payload.room_id as string)
        setScreen('waiting')
        break
      case 'state': {
        const state = payload as unknown as HangmanState
        setGameState(state)
        setGameVotes({})
        if (state.ready) setScreen('game')
        break
      }
      case 'game_vote_pending':
        setGameVotes(payload.game_votes as Record<string, string>)
        break
      case 'game_changed':
        onGameChanged(roomId, payload.game_type as string)
        break
      case 'player_kicked':    onBack(); break
      case 'player_disconnected':
        if ((payload.user_id as string) !== userId) setOpponentOnline(false); break
      case 'player_reconnected':
        if ((payload.user_id as string) !== userId) setOpponentOnline(true); break
      case 'error':
        setError((payload.message as string) || 'Algo deu errado.'); break
    }
  }, [userId, roomId, onGameChanged, onBack])

  const { send } = useWebSocket(userId, handleMessage)

  useEffect(() => {
    if (screen === 'waiting' && roomId) send({ action: 'join', room_id: roomId })
  }, [screen, roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (resumeRoomId) {
      setRoomId(resumeRoomId)
      send({ action: 'join', room_id: resumeRoomId })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const createRoom = () => { setError(''); send({ action: 'create_room', game_type: 'hangman' }) }
  const joinRoom   = (id: string) => {
    const clean = id.trim().toUpperCase()
    if (!clean) return
    setError(''); setRoomId(clean)
    send({ action: 'join', room_id: clean })
  }

  const submitWord = () => {
    const word  = wordInput.trim().toUpperCase().replace(/\s+/g, '')
    const theme = themeInput.trim()
    if (!word) { setWordError('Digite a palavra.'); return }
    if (!/^[A-Z]{1,20}$/.test(word)) { setWordError('Use apenas letras A-Z, até 20 caracteres.'); return }
    if (!theme) { setWordError('Digite o tema.'); return }
    setWordError('')
    send({ action: 'set_word', room_id: roomId, word, theme })
    setWordInput(''); setThemeInput('')
  }

  const guessLetter = (letter: string) => {
    if (phase !== 'playing' || isWordOwner) return
    if (gameState?.guessed_letters.includes(letter)) return
    send({ action: 'guess', room_id: roomId, letter })
  }

  const voteRestart = () => { if (!iVoted) send({ action: 'restart_vote', room_id: roomId }) }
  const voteGame    = (gt: string) => send({ action: 'game_vote', room_id: roomId, game_type: gt })

  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const wrongCount = gameState?.wrong_letters.length ?? 0

  if (screen === 'lobby') {
    return (
      <GameLobby title="Forca" gameType="hangman" error={error}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        onBack={onBack} />
    )
  }

  if (screen === 'waiting') return <WaitingRoom roomId={roomId} onBack={onBack} />

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-sm">
      <GameHeader
        roomId={roomId} gameName="Forca" opponentOnline={opponentOnline}
        gameVotes={gameVotes} myUserId={userId} onVoteGame={voteGame} onBack={onBack}
        rightSlot={<span className="text-xs text-zinc-500">{isWordOwner ? 'você escolhe' : 'você adivinha'}</span>}
      />

      {phase === 'choosing' && isWordOwner && (
        <div className="w-full flex flex-col gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-white font-semibold text-center">Você escolhe a palavra!</p>
          <p className="text-zinc-500 text-xs text-center">Os outros vão tentar adivinhar.</p>
          <Input placeholder="Tema (ex: Animais)" value={themeInput}
            onChange={e => setThemeInput(e.target.value)} maxLength={30} />
          <Input placeholder="Palavra secreta (A-Z, sem acento)" value={wordInput}
            onChange={e => setWordInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && submitWord()} maxLength={20} />
          {wordError && <p className="text-red-400 text-xs">{wordError}</p>}
          <Button onClick={submitWord} className="w-full">Confirmar</Button>
        </div>
      )}

      {phase === 'choosing' && !isWordOwner && (
        <div className="flex flex-col items-center gap-3 py-4">
          <HangmanFigure wrongCount={0} />
          <p className="text-zinc-500 text-sm animate-pulse">Aguardando a palavra ser escolhida...</p>
        </div>
      )}

      {(phase === 'playing' || phase === 'won' || phase === 'lost') && (
        <>
          <div className="w-full flex flex-col items-center gap-1">
            {gameState?.theme && (
              <p className="text-xs text-zinc-500 uppercase tracking-widest">
                Tema: <span className="text-pink-400">{gameState.theme}</span>
              </p>
            )}
            <HangmanFigure wrongCount={wrongCount} />
            <p className="text-xs text-zinc-600">{wrongCount}/{gameState?.max_wrong ?? 6} erros</p>
          </div>

          <div className="flex gap-1.5 flex-wrap justify-center px-2">
            {(phase === 'won' || phase === 'lost'
              ? (gameState?.word_revealed ?? '').split('')
              : gameState?.display ?? []
            ).map((ch, i) => (
              <div key={i} className="flex flex-col items-center">
                <span className={`text-xl font-bold font-mono min-w-[1.4rem] text-center ${ch === '_' ? 'text-transparent' : 'text-white'}`}>
                  {ch === '_' ? '_' : ch}
                </span>
                <div className="w-5 h-0.5 bg-zinc-600 mt-0.5" />
              </div>
            ))}
          </div>

          {phase === 'won' && (
            <p className="text-pink-400 font-semibold text-center">
              {isWordOwner ? 'Ninguém adivinhou — você venceu!' : 'Parabéns! Palavra adivinhada!'}
            </p>
          )}
          {phase === 'lost' && (
            <p className="text-zinc-400 font-semibold text-center">
              {isWordOwner ? 'Eles adivinharam! Você perdeu.' : 'A forca foi completada...'}
            </p>
          )}

          {gameState && gameState.wrong_letters.length > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-center">
              {gameState.wrong_letters.map(l => (
                <span key={l} className="text-red-500 font-mono font-bold text-sm bg-zinc-900 border border-red-900 rounded px-1.5 py-0.5">{l}</span>
              ))}
            </div>
          )}

          {phase === 'playing' && !isWordOwner && (
            <div className="flex flex-wrap justify-center gap-1.5 mt-1">
              {ALPHABET.map(letter => {
                const guessed = gameState?.guessed_letters.includes(letter) ?? false
                const wrong   = gameState?.wrong_letters.includes(letter) ?? false
                const correct = guessed && !wrong
                return (
                  <button key={letter} onClick={() => guessLetter(letter)} disabled={guessed}
                    className={[
                      'w-8 h-8 rounded font-mono font-bold text-sm transition-all border',
                      guessed
                        ? correct ? 'bg-green-950 border-green-700 text-green-400 cursor-default'
                                  : 'bg-zinc-950 border-zinc-800 text-zinc-700 cursor-default'
                        : 'bg-zinc-900 border-zinc-700 hover:border-pink-600 hover:text-pink-300 text-zinc-200 cursor-pointer',
                    ].join(' ')}>
                    {letter}
                  </button>
                )
              })}
            </div>
          )}

          {phase === 'playing' && isWordOwner && (
            <p className="text-zinc-600 text-sm text-center animate-pulse">Aguardando os palpites...</p>
          )}

          {gameOver && <RestartVoting iVoted={iVoted} theyVoted={theyVoted} onVote={voteRestart} />}
        </>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  )
}
