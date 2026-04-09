import { useState, useEffect, useCallback } from 'react'
import { useWebSocket } from './useWebSocket'

export interface UseGameRoomOptions {
  userId: string
  gameType: string
  resumeRoomId: string | null
  onGameChanged: (roomId: string, gameType: string) => void
  onBack: () => void
  onState: (state: Record<string, unknown>) => void
  onEvent?: (event: string, payload: Record<string, unknown>) => void
}

export type GameScreen = 'lobby' | 'waiting' | 'game'

export interface UseGameRoomResult {
  roomId: string
  screen: GameScreen
  error: string
  opponentOnline: boolean
  gameVotes: Record<string, string>
  send: (data: Record<string, unknown>) => void
  createRoom: (opts?: { roomName?: string; maxPlayers?: number }) => void
  joinRoom: (id: string) => void
  voteRestart: () => void
  voteGame: (gameType: string) => void
  setError: (msg: string) => void
}

export function useGameRoom({
  userId,
  gameType,
  resumeRoomId,
  onGameChanged,
  onBack,
  onState,
  onEvent,
}: UseGameRoomOptions): UseGameRoomResult {
  const [screen,         setScreen]         = useState<GameScreen>('lobby')
  const [roomId,         setRoomId]         = useState(resumeRoomId ?? '')
  const [error,          setError]          = useState('')
  const [opponentOnline, setOpponentOnline] = useState(true)
  const [gameVotes,      setGameVotes]      = useState<Record<string, string>>({})

  const handleMessage = useCallback((msg: Record<string, unknown>) => {
    const event   = msg.event as string
    const payload = msg.payload as Record<string, unknown>

    switch (event) {
      case 'room_created':
        setRoomId(payload.room_id as string)
        setScreen('waiting')
        break
      case 'state': {
        onState(payload)
        setGameVotes({})
        const state = payload as { ready?: boolean }
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
        onEvent?.('player_disconnected', payload)
        break
      case 'player_reconnected':
        if ((payload.user_id as string) !== userId) setOpponentOnline(true)
        onEvent?.('player_reconnected', payload)
        break
      case 'error':
        setError((payload.message as string) || 'Algo deu errado.')
        break
      default:
        onEvent?.(event, payload)
    }
  }, [userId, roomId, onGameChanged, onBack, onState, onEvent]) // eslint-disable-line react-hooks/exhaustive-deps

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
    send({
      action:      'create_room',
      game_type:   gameType,
      room_name:   opts?.roomName ?? '',
      max_players: opts?.maxPlayers ?? 0,
    })
  }

  const joinRoom = (id: string) => {
    const clean = id.trim().toUpperCase()
    if (!clean) return
    setError('')
    setRoomId(clean)
    send({ action: 'join', room_id: clean })
  }

  const voteRestart = () => { send({ action: 'restart_vote', room_id: roomId }) }

  const voteGame = (type: string) => {
    send({ action: 'game_vote', room_id: roomId, game_type: type })
  }

  return { roomId, screen, error, opponentOnline, gameVotes, send, createRoom, joinRoom, voteRestart, voteGame, setError }
}
