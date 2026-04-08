import { useState, useEffect, useCallback } from 'react'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
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
  onBack: () => void
}

type Screen = 'lobby' | 'waiting' | 'game'

export function TicTacToe({ userId, onBack }: TicTacToeProps) {
  const [screen, setScreen] = useState<Screen>('lobby')
  const [roomId, setRoomId] = useState('')
  const [joinInput, setJoinInput] = useState('')
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const mySymbol = gameState
    ? gameState.players[0] === userId
      ? 'X'
      : gameState.players[1] === userId
      ? 'O'
      : null
    : null

  const handleMessage = useCallback(
    (msg: Record<string, unknown>) => {
      const event = msg.event as string
      const payload = msg.payload as Record<string, unknown>

      if (event === 'room_created') {
        setRoomId(payload.room_id as string)
        setScreen('waiting')
      } else if (event === 'state') {
        const state = payload as unknown as GameState
        setGameState(state)
        if (state.ready && screen !== 'game') {
          setScreen('game')
        }
      } else if (event === 'error') {
        setError((payload.message as string) || 'Algo deu errado 😢')
      }
    },
    [screen]
  )

  const { send } = useWebSocket(userId, handleMessage)

  const createRoom = () => {
    send({ action: 'create_room', game_type: 'tic_tac_toe' })
  }

  const joinRoom = () => {
    const id = joinInput.trim().toUpperCase()
    if (!id) return
    setRoomId(id)
    send({ action: 'join', room_id: id })
  }

  // Auto-join after creating a room
  useEffect(() => {
    if (screen === 'waiting' && roomId) {
      send({ action: 'join', room_id: roomId })
    }
  }, [screen, roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  const makeMove = (index: number) => {
    if (!gameState?.ready) return
    if (gameState.current_turn !== userId) return
    if (gameState.board[index]) return
    if (gameState.winner || gameState.draw) return
    send({ action: 'move', room_id: roomId, index })
  }

  const restart = () => {
    send({ action: 'restart', room_id: roomId })
  }

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = roomId
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // silent
      }
    }
  }

  const isMyTurn = gameState?.current_turn === userId
  const statusText = () => {
    if (!gameState) return ''
    if (gameState.winner) {
      return gameState.winner === userId
        ? '🎉 Você ganhou, amor!'
        : '💔 Você perdeu dessa vez...'
    }
    if (gameState.draw) return '🤝 Empate! Vão tentar de novo?'
    if (!gameState.ready) return '⏳ Aguardando o amor chegar...'
    return isMyTurn ? '💕 Sua vez, vai!' : '⌛ Esperando sua cara-metade...'
  }

  if (screen === 'lobby') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        <h2 className="text-2xl font-bold text-pink-600">Tic-Tac-Love 💕</h2>
        <p className="text-pink-400 text-center text-sm">
          Crie uma sala ou entre na sala do seu amor
        </p>
        <Button onClick={createRoom} className="w-full">
          Criar sala
        </Button>
        <div className="flex gap-2 w-full">
          <Input
            className="flex-1"
            placeholder="Código da sala"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
            maxLength={6}
          />
          <Button variant="secondary" onClick={joinRoom}>
            Entrar
          </Button>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <Button variant="ghost" onClick={onBack}>
          ← Voltar
        </Button>
      </div>
    )
  }

  if (screen === 'waiting') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-sm text-center">
        <h2 className="text-2xl font-bold text-pink-600">Sala criada! 🥰</h2>
        <p className="text-pink-400 text-sm">Manda o código para seu amor entrar:</p>
        <div className="flex items-center gap-3 bg-white/80 border-2 border-pink-200 rounded-xl px-5 py-3">
          <span className="text-3xl font-mono font-bold tracking-widest text-pink-600">
            {roomId}
          </span>
          <button
            onClick={copyRoomId}
            className="text-pink-400 hover:text-pink-600 transition-colors text-sm"
          >
            {copied ? '✓' : '📋'}
          </button>
        </div>
        <div className="flex gap-2 items-center text-pink-300 animate-pulse">
          <span>⏳</span>
          <span className="text-sm">Aguardando o outro jogador...</span>
        </div>
        <Button variant="ghost" onClick={onBack}>
          ← Cancelar
        </Button>
      </div>
    )
  }

  // Game screen
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      <div className="flex justify-between items-center w-full">
        <Button variant="ghost" onClick={onBack} className="text-sm px-3 py-1.5">
          ←
        </Button>
        <div className="text-center">
          <span className="text-xs text-pink-300">Sala: </span>
          <span className="text-sm font-mono font-bold text-pink-500">{roomId}</span>
        </div>
        <div className="text-right">
          <span className="text-sm font-bold text-pink-500">
            Você: {mySymbol ?? '?'}
          </span>
        </div>
      </div>

      <p className="text-pink-600 font-medium text-center min-h-[1.5rem]">{statusText()}</p>

      {/* Board */}
      <div className="grid grid-cols-3 gap-2 w-full aspect-square max-w-[300px]">
        {Array.from({ length: 9 }).map((_, i) => {
          const cell = gameState?.board[i] ?? null
          const isWinning = gameState?.winning_combo?.includes(i) ?? false
          const clickable =
            !cell &&
            !gameState?.winner &&
            !gameState?.draw &&
            gameState?.ready &&
            isMyTurn

          return (
            <button
              key={i}
              onClick={() => makeMove(i)}
              disabled={!clickable}
              className={[
                'aspect-square rounded-2xl text-4xl font-bold flex items-center justify-center transition-all duration-150',
                'border-2 focus:outline-none',
                isWinning
                  ? 'bg-pink-100 border-pink-400 scale-105'
                  : 'bg-white/70 border-pink-200',
                clickable ? 'hover:bg-pink-50 hover:border-pink-400 cursor-pointer' : 'cursor-default',
                cell === 'X' ? 'text-pink-500' : 'text-red-400',
              ].join(' ')}
            >
              {cell === 'X' ? '♡' : cell === 'O' ? '★' : ''}
            </button>
          )
        })}
      </div>

      {(gameState?.winner || gameState?.draw) && (
        <Button onClick={restart} className="w-full mt-2">
          Jogar de novo 💕
        </Button>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  )
}
