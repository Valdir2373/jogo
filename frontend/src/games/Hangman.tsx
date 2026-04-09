import { useState, useEffect, useCallback } from 'react'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
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

const AVAILABLE_GAMES = [
  { type: 'tic_tac_toe', name: 'Jogo da Velha', maxPlayers: 2 },
  { type: 'hangman',     name: 'Forca',          maxPlayers: 6 },
]

function HangmanFigure({ wrongCount }: { wrongCount: number }) {
  return (
    <svg viewBox="0 0 120 160" width="120" height="160" className="mx-auto">
      {/* Gallows */}
      <line x1="10"  y1="155" x2="110" y2="155" stroke="#ec4899" strokeWidth="3" strokeLinecap="round" />
      <line x1="30"  y1="155" x2="30"  y2="5"   stroke="#ec4899" strokeWidth="3" strokeLinecap="round" />
      <line x1="30"  y1="5"   x2="75"  y2="5"   stroke="#ec4899" strokeWidth="3" strokeLinecap="round" />
      <line x1="75"  y1="5"   x2="75"  y2="25"  stroke="#ec4899" strokeWidth="3" strokeLinecap="round" />
      {/* Head */}
      {wrongCount >= 1 && (
        <circle cx="75" cy="35" r="10" stroke="white" strokeWidth="2.5" fill="none" />
      )}
      {/* Body */}
      {wrongCount >= 2 && (
        <line x1="75" y1="45" x2="75" y2="95" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      )}
      {/* Left arm */}
      {wrongCount >= 3 && (
        <line x1="75" y1="60" x2="52" y2="78" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      )}
      {/* Right arm */}
      {wrongCount >= 4 && (
        <line x1="75" y1="60" x2="98" y2="78" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      )}
      {/* Left leg */}
      {wrongCount >= 5 && (
        <line x1="75" y1="95" x2="52" y2="125" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      )}
      {/* Right leg */}
      {wrongCount >= 6 && (
        <line x1="75" y1="95" x2="98" y2="125" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      )}
    </svg>
  )
}

export function Hangman({ userId, resumeRoomId, onBack, onGameChanged }: HangmanProps) {
  const [screen,       setScreen]       = useState<Screen>('lobby')
  const [roomId,       setRoomId]       = useState(resumeRoomId ?? '')
  const [joinInput,    setJoinInput]    = useState('')
  const [gameState,    setGameState]    = useState<HangmanState | null>(null)
  const [error,        setError]        = useState('')
  const [copied,       setCopied]       = useState(false)
  const [wordInput,    setWordInput]    = useState('')
  const [themeInput,   setThemeInput]   = useState('')
  const [wordError,    setWordError]    = useState('')
  const [opponentOnline, setOpponentOnline] = useState(true)
  const [showGamePicker, setShowGamePicker] = useState(false)
  const [gameVotes,    setGameVotes]    = useState<Record<string, string>>({})

  const isWordOwner = gameState?.word_owner === userId
  const phase       = gameState?.phase ?? 'choosing'
  const gameOver    = phase === 'won' || phase === 'lost'
  const iVoted      = gameState?.restart_votes.includes(userId) ?? false
  const theyVoted   = gameState?.restart_votes.some(id => id !== userId) ?? false
  const myGameVote  = gameVotes[userId]
  const theirGameVote = Object.entries(gameVotes).find(([id]) => id !== userId)?.[1]

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
      case 'player_kicked':
        onBack()
        break
      case 'player_disconnected':
        if ((payload.user_id as string) !== userId) setOpponentOnline(false)
        break
      case 'player_reconnected':
        if ((payload.user_id as string) !== userId) setOpponentOnline(true)
        break
      case 'error':
        setError((payload.message as string) || 'Algo deu errado.')
        break
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

  const joinRoom = () => {
    const id = joinInput.trim().toUpperCase()
    if (!id) return
    setError(''); setRoomId(id)
    send({ action: 'join', room_id: id })
  }

  const submitWord = () => {
    const word  = wordInput.trim().toUpperCase().replace(/\s+/g, '')
    const theme = themeInput.trim()
    if (!word) { setWordError('Digite a palavra.'); return }
    if (!/^[A-Z]{1,20}$/.test(word)) { setWordError('Use apenas letras A-Z, até 20 caracteres.'); return }
    if (!theme) { setWordError('Digite o tema.'); return }
    setWordError('')
    send({ action: 'set_word', room_id: roomId, word, theme })
    setWordInput('')
    setThemeInput('')
  }

  const guessLetter = (letter: string) => {
    if (phase !== 'playing' || isWordOwner) return
    if (gameState?.guessed_letters.includes(letter)) return
    send({ action: 'guess', room_id: roomId, letter })
  }

  const voteRestart = () => { if (!iVoted) send({ action: 'restart_vote', room_id: roomId }) }

  const voteGame = (gameType: string) => {
    send({ action: 'game_vote', room_id: roomId, game_type: gameType })
    setShowGamePicker(false)
  }

  const copyRoomId = async () => {
    try { await navigator.clipboard.writeText(roomId) } catch {
      const ta = document.createElement('textarea')
      ta.value = roomId; document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

  // ── Lobby ────────────────────────────────────────────────────────────────────
  if (screen === 'lobby') {
    return (
      <div className="flex flex-col items-center gap-5 w-full max-w-sm">
        <h2 className="text-xl font-bold text-white">Forca</h2>
        <Button onClick={createRoom} className="w-full">Criar sala</Button>
        <div className="flex gap-2 w-full">
          <Input className="flex-1" placeholder="Código da sala" value={joinInput}
            onChange={e => setJoinInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && joinRoom()} maxLength={6} />
          <Button variant="secondary" onClick={joinRoom}>Entrar</Button>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <Button variant="ghost" onClick={onBack}>← Voltar</Button>
      </div>
    )
  }

  // ── Waiting ──────────────────────────────────────────────────────────────────
  if (screen === 'waiting') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-sm text-center">
        <h2 className="text-xl font-bold text-white">Sala criada</h2>
        <p className="text-zinc-500 text-sm">Compartilhe o código:</p>
        <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-4">
          <span className="text-3xl font-mono font-bold tracking-widest text-pink-400">{roomId}</span>
          <button onClick={copyRoomId} className="text-zinc-500 hover:text-pink-400 transition-colors ml-1">
            {copied ? '✓' : '⎘'}
          </button>
        </div>
        <p className="text-zinc-600 text-sm animate-pulse">Aguardando o outro jogador...</p>
        <Button variant="ghost" onClick={onBack}>← Cancelar</Button>
      </div>
    )
  }

  // ── Game ─────────────────────────────────────────────────────────────────────
  const wrongCount = gameState?.wrong_letters.length ?? 0

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-sm">
      {/* Header */}
      <div className="flex justify-between items-center w-full">
        <Button variant="ghost" onClick={onBack} className="text-sm px-3 py-1.5">←</Button>
        <div className="flex flex-col items-center gap-0.5">
          <span className="font-mono text-xs text-zinc-600">{roomId}</span>
          <button
            onClick={() => setShowGamePicker(v => !v)}
            className="text-xs text-zinc-500 hover:text-pink-400 transition-colors"
          >
            Forca ↕
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${opponentOnline ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-zinc-500">
            {isWordOwner ? 'você escolhe' : 'você adivinha'}
          </span>
        </div>
      </div>

      {/* Game picker */}
      {showGamePicker && (
        <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-xs text-zinc-500 mb-1">Propor troca de jogo (ambos devem concordar):</p>
          {AVAILABLE_GAMES.map(g => {
            const iVotedThis   = myGameVote === g.type
            const theyVoteThis = theirGameVote === g.type
            return (
              <button key={g.type} onClick={() => voteGame(g.type)}
                className={[
                  'w-full text-left px-3 py-2 rounded-lg text-sm transition-all border',
                  iVotedThis
                    ? 'border-pink-600 bg-pink-950 text-pink-300'
                    : 'border-zinc-700 hover:border-pink-700 text-zinc-300',
                ].join(' ')}>
                <div className="flex justify-between items-center">
                  <span>{g.name} <span className="text-zinc-600 text-xs">({g.maxPlayers} jogadores)</span></span>
                  <span className="text-xs text-zinc-600">
                    {iVotedThis && '✓ você'}
                    {theyVoteThis && !iVotedThis && '✓ adversário'}
                  </span>
                </div>
              </button>
            )
          })}
          {myGameVote && !theirGameVote && (
            <p className="text-xs text-zinc-500 text-center pt-1 animate-pulse">
              Aguardando concordar...
            </p>
          )}
          {theirGameVote && !myGameVote && (
            <p className="text-xs text-pink-400 text-center pt-1 animate-pulse">
              Querem mudar para {AVAILABLE_GAMES.find(g => g.type === theirGameVote)?.name}!
            </p>
          )}
        </div>
      )}

      {/* Word-setter screen (choosing phase, word owner) */}
      {phase === 'choosing' && isWordOwner && (
        <div className="w-full flex flex-col gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-white font-semibold text-center">Você escolhe a palavra!</p>
          <p className="text-zinc-500 text-xs text-center">Os outros jogadores vão tentar adivinhar.</p>
          <Input
            placeholder="Tema (ex: Animais)"
            value={themeInput}
            onChange={e => setThemeInput(e.target.value)}
            maxLength={30}
          />
          <Input
            placeholder="Palavra secreta (A-Z, sem acento)"
            value={wordInput}
            onChange={e => setWordInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && submitWord()}
            maxLength={20}
          />
          {wordError && <p className="text-red-400 text-xs">{wordError}</p>}
          <Button onClick={submitWord} className="w-full">Confirmar</Button>
        </div>
      )}

      {/* Waiting for word owner (choosing phase, guesser) */}
      {phase === 'choosing' && !isWordOwner && (
        <div className="flex flex-col items-center gap-3 py-4">
          <HangmanFigure wrongCount={0} />
          <p className="text-zinc-500 text-sm animate-pulse">
            Aguardando o dono da sala escolher a palavra...
          </p>
        </div>
      )}

      {/* Playing / Won / Lost */}
      {(phase === 'playing' || phase === 'won' || phase === 'lost') && (
        <>
          {/* Theme + hangman figure */}
          <div className="w-full flex flex-col items-center gap-1">
            {gameState?.theme && (
              <p className="text-xs text-zinc-500 uppercase tracking-widest">
                Tema: <span className="text-pink-400">{gameState.theme}</span>
              </p>
            )}
            <HangmanFigure wrongCount={wrongCount} />
            <p className="text-xs text-zinc-600">
              {wrongCount}/{gameState?.max_wrong ?? 6} erros
            </p>
          </div>

          {/* Word display */}
          <div className="flex gap-1.5 flex-wrap justify-center px-2">
            {(gameState?.phase === 'won' || gameState?.phase === 'lost'
              ? (gameState.word_revealed ?? '').split('')
              : gameState?.display ?? []
            ).map((ch, i) => (
              <div key={i} className="flex flex-col items-center">
                <span className={`text-xl font-bold font-mono min-w-[1.4rem] text-center ${
                  ch === '_' ? 'text-transparent' : 'text-white'
                }`}>
                  {ch === '_' ? '_' : ch}
                </span>
                <div className="w-5 h-0.5 bg-zinc-600 mt-0.5" />
              </div>
            ))}
          </div>

          {/* Win / loss message */}
          {phase === 'won' && (
            <p className="text-pink-400 font-semibold text-center">
              {isWordOwner ? 'Ninguém adivinhou — você venceu!' : 'Parabéns! A palavra foi adivinhada!'}
            </p>
          )}
          {phase === 'lost' && (
            <p className="text-zinc-400 font-semibold text-center">
              {isWordOwner ? 'Eles adivinharam! Você perdeu.' : 'Que pena... a forca foi completada.'}
            </p>
          )}

          {/* Wrong letters */}
          {gameState && gameState.wrong_letters.length > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-center">
              {gameState.wrong_letters.map(l => (
                <span key={l} className="text-red-500 font-mono font-bold text-sm bg-zinc-900 border border-red-900 rounded px-1.5 py-0.5">
                  {l}
                </span>
              ))}
            </div>
          )}

          {/* Letter keyboard (guessers only, while playing) */}
          {phase === 'playing' && !isWordOwner && (
            <div className="flex flex-wrap justify-center gap-1.5 mt-1">
              {ALPHABET.map(letter => {
                const guessed = gameState?.guessed_letters.includes(letter) ?? false
                const wrong   = gameState?.wrong_letters.includes(letter) ?? false
                const correct = guessed && !wrong
                return (
                  <button
                    key={letter}
                    onClick={() => guessLetter(letter)}
                    disabled={guessed}
                    className={[
                      'w-8 h-8 rounded font-mono font-bold text-sm transition-all border',
                      guessed
                        ? correct
                          ? 'bg-green-950 border-green-700 text-green-400 cursor-default'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-700 cursor-default'
                        : 'bg-zinc-900 border-zinc-700 hover:border-pink-600 hover:text-pink-300 text-zinc-200 cursor-pointer',
                    ].join(' ')}
                  >
                    {letter}
                  </button>
                )
              })}
            </div>
          )}

          {/* Word-owner waiting during playing */}
          {phase === 'playing' && isWordOwner && (
            <p className="text-zinc-600 text-sm text-center animate-pulse">
              Aguardando os palpites...
            </p>
          )}

          {/* Restart voting */}
          {gameOver && (
            <div className="w-full flex flex-col gap-2 mt-1">
              {!iVoted ? (
                <Button onClick={voteRestart} className="w-full">Jogar de novo</Button>
              ) : !theyVoted ? (
                <p className="text-center text-zinc-500 text-sm py-2">
                  Aguardando os outros aceitarem...
                </p>
              ) : null}
              {theyVoted && !iVoted && (
                <p className="text-center text-pink-400 text-sm animate-pulse">
                  Alguém quer jogar de novo!
                </p>
              )}
            </div>
          )}
        </>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  )
}
