import { useState, useEffect, useCallback } from 'react'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { useWebSocket } from '../useWebSocket'
import { GAMES as ALL_GAMES } from '../GAMES'

interface GameState {
  board: (string | null)[]
  current_turn: string | null
  winner: string | null
  draw: boolean
  winning_combo: number[] | null
  restart_votes: string[]
  players: string[]
  ready: boolean
}

interface GameVotes { [userId: string]: string }

const AVAILABLE_GAMES = ALL_GAMES.map(g => ({ type: g.type, name: g.name, maxPlayers: g.maxPlayers }))

interface TicTacToeProps {
  userId: string
  resumeRoomId: string | null
  onBack: () => void
  onGameChanged: (roomId: string, gameType: string) => void
}

type Screen = 'lobby' | 'waiting' | 'game'

export function TicTacToe({ userId, resumeRoomId, onBack, onGameChanged }: TicTacToeProps) {
  const [screen, setScreen]             = useState<Screen>('lobby')
  const [roomId, setRoomId]             = useState(resumeRoomId ?? '')
  const [joinInput, setJoinInput]       = useState('')
  const [gameState, setGameState]       = useState<GameState | null>(null)
  const [error, setError]               = useState('')
  const [copied, setCopied]             = useState(false)
  const [opponentOnline, setOpponentOnline] = useState(true)
  const [showGamePicker, setShowGamePicker] = useState(false)
  const [gameVotes, setGameVotes]       = useState<GameVotes>({})

  const mySymbol = gameState
    ? gameState.players[0] === userId ? 'X'
    : gameState.players[1] === userId ? 'O'
    : null
    : null

  const gameOver  = !!(gameState?.winner || gameState?.draw)
  const iVoted    = gameState?.restart_votes.includes(userId) ?? false
  const theyVoted = gameState?.restart_votes.some(id => id !== userId) ?? false

  const myGameVote    = gameVotes[userId]
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
        const state = payload as unknown as GameState
        setGameState(state)
        setGameVotes({})          // clear game votes on any state update
        if (state.ready) setScreen('game')
        break
      }
      case 'game_vote_pending':
        setGameVotes(payload.game_votes as GameVotes)
        break
      case 'game_changed':
        // Server switched the game — hand control back to App
        onGameChanged(roomId, payload.game_type as string)
        break
      case 'player_kicked':
        // This player was removed because room switched to a smaller game
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

  const createRoom = () => { setError(''); send({ action: 'create_room', game_type: 'tic_tac_toe' }) }

  const joinRoom = () => {
    const id = joinInput.trim().toUpperCase()
    if (!id) return
    setError(''); setRoomId(id)
    send({ action: 'join', room_id: id })
  }

  const makeMove = (index: number) => {
    if (!gameState?.ready || gameState.current_turn !== userId) return
    if (gameState.board[index] || gameState.winner || gameState.draw) return
    send({ action: 'move', room_id: roomId, index })
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

  const isMyTurn = gameState?.current_turn === userId

  const statusText = () => {
    if (!gameState) return ''
    if (!opponentOnline) return 'Adversário desconectado — aguardando reconexão...'
    if (gameState.winner) return gameState.winner === userId ? 'Você ganhou!' : 'Você perdeu.'
    if (gameState.draw)   return 'Empate!'
    if (!gameState.ready) return 'Aguardando o outro jogador...'
    return isMyTurn ? 'Sua vez' : 'Vez do adversário...'
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────
  if (screen === 'lobby') {
    return (
      <div className="flex flex-col items-center gap-5 w-full max-w-sm">
        <h2 className="text-xl font-bold text-white">Jogo da Velha</h2>
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

  // ── Waiting ───────────────────────────────────────────────────────────────
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

  // ── Game ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      {/* Header */}
      <div className="flex justify-between items-center w-full">
        <Button variant="ghost" onClick={onBack} className="text-sm px-3 py-1.5">←</Button>
        <div className="flex flex-col items-center gap-0.5">
          <span className="font-mono text-xs text-zinc-600">{roomId}</span>
          <button
            onClick={() => setShowGamePicker(v => !v)}
            className="text-xs text-zinc-500 hover:text-pink-400 transition-colors"
          >
            Jogo da Velha ↕
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${opponentOnline ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm font-bold text-pink-500">{mySymbol ?? '?'}</span>
        </div>
      </div>

      {/* Game picker */}
      {showGamePicker && (
        <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-xs text-zinc-500 mb-1">Propor troca de jogo (ambos devem concordar):</p>
          {AVAILABLE_GAMES.map(g => {
            const iVotedThis  = myGameVote === g.type
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
              Aguardando o adversário concordar...
            </p>
          )}
          {theirGameVote && !myGameVote && (
            <p className="text-xs text-pink-400 text-center pt-1 animate-pulse">
              O adversário quer mudar para {AVAILABLE_GAMES.find(g => g.type === theirGameVote)?.name}!
            </p>
          )}
        </div>
      )}

      {/* Status */}
      <p className={`text-sm font-medium min-h-[1.25rem] ${
        !opponentOnline ? 'text-yellow-500'
        : gameState?.winner === userId ? 'text-pink-400'
        : gameState?.winner ? 'text-zinc-400'
        : gameState?.draw ? 'text-zinc-400'
        : isMyTurn ? 'text-white'
        : 'text-zinc-500'
      }`}>{statusText()}</p>

      {/* Board */}
      <div className="grid grid-cols-3 gap-1.5 w-full aspect-square max-w-[280px]">
        {Array.from({ length: 9 }).map((_, i) => {
          const cell      = gameState?.board[i] ?? null
          const isWinning = gameState?.winning_combo?.includes(i) ?? false
          const clickable = !cell && !gameState?.winner && !gameState?.draw
            && gameState?.ready && isMyTurn && opponentOnline
          return (
            <button key={i} onClick={() => makeMove(i)} disabled={!clickable}
              className={[
                'aspect-square rounded-xl text-3xl font-black flex items-center justify-center',
                'transition-all duration-100 border focus:outline-none select-none',
                isWinning ? 'bg-pink-950 border-pink-500' : 'bg-zinc-900 border-zinc-800',
                clickable ? 'hover:border-pink-700 hover:bg-zinc-800 cursor-pointer' : 'cursor-default',
                cell === 'X' ? 'text-pink-400' : 'text-white',
              ].join(' ')}>
              {cell ?? ''}
            </button>
          )
        })}
      </div>

      {/* Restart voting */}
      {gameOver && (
        <div className="w-full flex flex-col gap-2 mt-2">
          {!iVoted ? (
            <Button onClick={voteRestart} className="w-full">Jogar de novo</Button>
          ) : !theyVoted ? (
            <p className="text-center text-zinc-500 text-sm py-2">
              Aguardando o adversário aceitar...
            </p>
          ) : null}
          {theyVoted && !iVoted && (
            <p className="text-center text-pink-400 text-sm animate-pulse">
              O adversário quer jogar de novo!
            </p>
          )}
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  )
}
