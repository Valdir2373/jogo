import { useState, useEffect, useCallback } from 'react'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { useWebSocket } from '../useWebSocket'

interface GameState {
  board: (string | null)[]
  current_turn: string | null
  winner: string | null
  draw: boolean
  winning_combo: number[] | null
  players: string[]
  ready: boolean
}

interface TicTacToeProps {
  userId: string
  resumeRoomId: string | null
  onBack: () => void
}

type Screen = 'lobby' | 'waiting' | 'game' | 'ended'

export function TicTacToe({ userId, resumeRoomId, onBack }: TicTacToeProps) {
  const [screen, setScreen]       = useState<Screen>('lobby')
  const [roomId, setRoomId]       = useState(resumeRoomId ?? '')
  const [joinInput, setJoinInput] = useState('')
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [error, setError]         = useState('')
  const [copied, setCopied]       = useState(false)
  const [endReason, setEndReason] = useState('')

  const mySymbol = gameState
    ? gameState.players[0] === userId ? 'X'
    : gameState.players[1] === userId ? 'O'
    : null
    : null

  const handleMessage = useCallback((msg: Record<string, unknown>) => {
    const event   = msg.event as string
    const payload = msg.payload as Record<string, unknown>

    if (event === 'room_created') {
      setRoomId(payload.room_id as string)
      setScreen('waiting')
    } else if (event === 'state') {
      const state = payload as unknown as GameState
      setGameState(state)
      if (state.ready) setScreen('game')
    } else if (event === 'opponent_left') {
      setEndReason((payload.message as string) || 'O outro jogador saiu.')
      setScreen('ended')
    } else if (event === 'error') {
      setError((payload.message as string) || 'Algo deu errado.')
    }
  }, [])

  const { send } = useWebSocket(userId, handleMessage)

  // Auto-join on create (waiting) or resume
  useEffect(() => {
    if (screen === 'waiting' && roomId) {
      send({ action: 'join', room_id: roomId })
    }
  }, [screen, roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resume: jump straight to join
  useEffect(() => {
    if (resumeRoomId) {
      setRoomId(resumeRoomId)
      send({ action: 'join', room_id: resumeRoomId })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const createRoom = () => {
    setError('')
    send({ action: 'create_room', game_type: 'tic_tac_toe' })
  }

  const joinRoom = () => {
    const id = joinInput.trim().toUpperCase()
    if (!id) return
    setError('')
    setRoomId(id)
    send({ action: 'join', room_id: id })
  }

  const makeMove = (index: number) => {
    if (!gameState?.ready) return
    if (gameState.current_turn !== userId) return
    if (gameState.board[index]) return
    if (gameState.winner || gameState.draw) return
    send({ action: 'move', room_id: roomId, index })
  }

  const restart = () => send({ action: 'restart', room_id: roomId })

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = roomId
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isMyTurn = gameState?.current_turn === userId

  const statusText = () => {
    if (!gameState) return ''
    if (gameState.winner) return gameState.winner === userId ? 'Você ganhou!' : 'Você perdeu.'
    if (gameState.draw)   return 'Empate!'
    if (!gameState.ready) return 'Aguardando o outro jogador...'
    return isMyTurn ? 'Sua vez' : 'Vez do outro jogador...'
  }

  // ── Lobby ────────────────────────────────────────────────────────────────────
  if (screen === 'lobby') {
    return (
      <div className="flex flex-col items-center gap-5 w-full max-w-sm">
        <h2 className="text-xl font-bold text-white">Tic-Tac-Toe</h2>

        <Button onClick={createRoom} className="w-full">
          Criar sala
        </Button>

        <div className="flex gap-2 w-full">
          <Input
            className="flex-1"
            placeholder="Código da sala"
            value={joinInput}
            onChange={e => setJoinInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && joinRoom()}
            maxLength={6}
          />
          <Button variant="secondary" onClick={joinRoom}>
            Entrar
          </Button>
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
          <span className="text-3xl font-mono font-bold tracking-widest text-pink-400">
            {roomId}
          </span>
          <button
            onClick={copyRoomId}
            className="text-zinc-500 hover:text-pink-400 transition-colors text-sm ml-1"
          >
            {copied ? '✓' : '⎘'}
          </button>
        </div>

        <p className="text-zinc-600 text-sm animate-pulse">Aguardando o outro jogador...</p>

        <Button variant="ghost" onClick={onBack}>← Cancelar</Button>
      </div>
    )
  }

  // ── Ended (opponent left) ────────────────────────────────────────────────────
  if (screen === 'ended') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-sm text-center">
        <h2 className="text-xl font-bold text-white">Sala encerrada</h2>
        <p className="text-zinc-400 text-sm">{endReason}</p>
        <Button onClick={onBack}>Voltar ao menu</Button>
      </div>
    )
  }

  // ── Game ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      {/* Header */}
      <div className="flex justify-between items-center w-full">
        <Button variant="ghost" onClick={onBack} className="text-sm px-3 py-1.5">←</Button>
        <span className="font-mono text-xs text-zinc-600">{roomId}</span>
        <span className="text-sm font-bold text-pink-500">
          {mySymbol ?? '?'}
        </span>
      </div>

      {/* Status */}
      <p className={`text-sm font-medium min-h-[1.25rem] ${
        gameState?.winner === userId ? 'text-pink-400'
        : gameState?.winner ? 'text-zinc-400'
        : gameState?.draw ? 'text-zinc-400'
        : isMyTurn ? 'text-white'
        : 'text-zinc-500'
      }`}>
        {statusText()}
      </p>

      {/* Board */}
      <div className="grid grid-cols-3 gap-1.5 w-full aspect-square max-w-[280px]">
        {Array.from({ length: 9 }).map((_, i) => {
          const cell       = gameState?.board[i] ?? null
          const isWinning  = gameState?.winning_combo?.includes(i) ?? false
          const clickable  = !cell && !gameState?.winner && !gameState?.draw && gameState?.ready && isMyTurn

          return (
            <button
              key={i}
              onClick={() => makeMove(i)}
              disabled={!clickable}
              className={[
                'aspect-square rounded-xl text-3xl font-black flex items-center justify-center transition-all duration-100 border focus:outline-none select-none',
                isWinning
                  ? 'bg-pink-950 border-pink-500'
                  : 'bg-zinc-900 border-zinc-800',
                clickable ? 'hover:border-pink-700 hover:bg-zinc-800 cursor-pointer' : 'cursor-default',
                cell === 'X' ? 'text-pink-400' : 'text-white',
              ].join(' ')}
            >
              {cell ?? ''}
            </button>
          )
        })}
      </div>

      {/* Restart */}
      {(gameState?.winner || gameState?.draw) && (
        <Button onClick={restart} className="w-full mt-2">
          Jogar de novo
        </Button>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  )
}
