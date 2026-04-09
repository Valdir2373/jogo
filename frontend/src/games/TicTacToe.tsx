import { useState, useEffect, useCallback } from 'react'
import { GameLobby, WaitingRoom, GameHeader, RestartVoting } from '../components/GameLobby'
import { useWebSocket } from '../useWebSocket'

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

interface TicTacToeProps {
  userId: string
  resumeRoomId: string | null
  onBack: () => void
  onGameChanged: (roomId: string, gameType: string) => void
}

type Screen = 'lobby' | 'waiting' | 'game'

export function TicTacToe({ userId, resumeRoomId, onBack, onGameChanged }: TicTacToeProps) {
  const [screen,    setScreen]    = useState<Screen>('lobby')
  const [roomId,    setRoomId]    = useState(resumeRoomId ?? '')
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [error,     setError]     = useState('')
  const [gameVotes, setGameVotes] = useState<GameVotes>({})
  const [opponentOnline, setOpponentOnline] = useState(true)

  const mySymbol = gameState
    ? gameState.players[0] === userId ? 'X'
    : gameState.players[1] === userId ? 'O'
    : null
    : null

  const gameOver = !!(gameState?.winner || gameState?.draw)
  const iVoted   = gameState?.restart_votes.includes(userId) ?? false
  const theyVoted= gameState?.restart_votes.some(id => id !== userId) ?? false

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
        setGameVotes({})
        if (state.ready) setScreen('game')
        break
      }
      case 'game_vote_pending':
        setGameVotes(payload.game_votes as GameVotes)
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

  const createRoom = (opts?: { roomName?: string; maxPlayers?: number }) => {
    setError('')
    send({ action: 'create_room', game_type: 'tic_tac_toe', room_name: opts?.roomName ?? '', max_players: opts?.maxPlayers ?? 0 })
  }

  const makeMove = (index: number) => {
    if (!gameState?.ready || gameState.current_turn !== userId) return
    if (gameState.board[index] || gameState.winner || gameState.draw) return
    send({ action: 'move', room_id: roomId, index })
  }

  const voteRestart = () => { if (!iVoted) send({ action: 'restart_vote', room_id: roomId }) }
  const voteGame    = (gt: string) => send({ action: 'game_vote', room_id: roomId, game_type: gt })

  const isMyTurn = gameState?.current_turn === userId

  const statusText = () => {
    if (!gameState) return ''
    if (!opponentOnline) return 'Adversário desconectado — aguardando reconexão...'
    if (gameState.winner) return gameState.winner === userId ? 'Você ganhou!' : 'Você perdeu.'
    if (gameState.draw)   return 'Empate!'
    if (!gameState.ready) return 'Aguardando o outro jogador...'
    return isMyTurn ? 'Sua vez' : 'Vez do adversário...'
  }

  if (screen === 'lobby') {
    return (
      <GameLobby title="Jogo da Velha" gameType="tic_tac_toe" error={error}
        onCreateRoom={createRoom}
        onBack={onBack} />
    )
  }

  if (screen === 'waiting') {
    return <WaitingRoom roomId={roomId} onBack={onBack} />
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      <GameHeader
        roomId={roomId}
        gameName="Jogo da Velha"
        opponentOnline={opponentOnline}
        gameVotes={gameVotes}
        myUserId={userId}
        onVoteGame={voteGame}
        onBack={onBack}
        rightSlot={<span className="text-sm font-bold text-pink-500">{mySymbol ?? '?'}</span>}
      />

      <p className={`text-sm font-medium min-h-[1.25rem] ${
        !opponentOnline ? 'text-yellow-500'
        : gameState?.winner === userId ? 'text-pink-400'
        : gameState?.winner ? 'text-zinc-400'
        : gameState?.draw   ? 'text-zinc-400'
        : isMyTurn ? 'text-white'
        : 'text-zinc-500'
      }`}>{statusText()}</p>

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

      {gameOver && (
        <RestartVoting iVoted={iVoted} theyVoted={theyVoted} onVote={voteRestart} />
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  )
}
