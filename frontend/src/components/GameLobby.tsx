import { useState } from 'react'
import { Button } from './Button'
import { Input } from './Input'
import { GAMES, findGame } from '../GAMES'

interface GameLobbyProps {
  title: string
  gameType: string
  error: string
  onCreateRoom: (opts: { roomName: string; maxPlayers: number }) => void
  onJoinRoom: (id: string) => void
  onBack: () => void
}

interface WaitingProps {
  roomId: string
  onBack: () => void
}

interface GameHeaderProps {
  roomId: string
  gameName: string
  opponentOnline: boolean
  gameVotes: Record<string, string>
  myUserId: string
  onVoteGame: (gameType: string) => void
  onBack: () => void
  rightSlot?: React.ReactNode
}

// ── Lobby ────────────────────────────────────────────────────────────────────

export function GameLobby({ title, gameType, error, onCreateRoom, onJoinRoom, onBack }: GameLobbyProps) {
  const [joinInput, setJoinInput]   = useState('')
  const [roomName,  setRoomName]    = useState('')
  const [maxP,      setMaxP]        = useState(0)
  const [showOpts,  setShowOpts]    = useState(false)
  const meta = findGame(gameType)

  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-sm">
      <h2 className="text-xl font-bold text-white">{title}</h2>

      {/* Create room */}
      <div className="w-full flex flex-col gap-2">
        {showOpts && (
          <>
            <Input
              placeholder="Nome da sala (opcional)"
              value={roomName}
              onChange={e => setRoomName(e.target.value)}
              maxLength={30}
            />
            {meta?.variable && (
              <select
                value={maxP || ''}
                onChange={e => setMaxP(Number(e.target.value))}
                className="w-full bg-zinc-900 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-pink-600"
              >
                <option value="">Limite padrão ({meta.maxPlayers} jogadores)</option>
                {Array.from({ length: meta.maxPlayers - meta.minPlayers + 1 }, (_, i) => meta.minPlayers + i)
                  .map(n => <option key={n} value={n}>{n} jogadores</option>)
                }
              </select>
            )}
          </>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => onCreateRoom({ roomName, maxPlayers: maxP })}>
            Criar sala
          </Button>
          <button
            onClick={() => setShowOpts(v => !v)}
            className="px-3 py-2 bg-zinc-900 border border-zinc-700 hover:border-pink-700 rounded-lg text-zinc-400 text-sm transition-colors"
            title="Opções"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Join room */}
      <div className="flex gap-2 w-full">
        <Input
          className="flex-1"
          placeholder="Código da sala"
          value={joinInput}
          onChange={e => setJoinInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onJoinRoom(joinInput)}
          maxLength={6}
        />
        <Button variant="secondary" onClick={() => onJoinRoom(joinInput)}>Entrar</Button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      <Button variant="ghost" onClick={onBack}>← Voltar</Button>
    </div>
  )
}

// ── Waiting ──────────────────────────────────────────────────────────────────

export function WaitingRoom({ roomId, onBack }: WaitingProps) {
  const [copied, setCopied] = useState(false)

  const copyRoomId = async () => {
    try { await navigator.clipboard.writeText(roomId) } catch {
      const ta = document.createElement('textarea')
      ta.value = roomId; document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

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

// ── Game Header (top bar with back, room code, game picker, status dot) ──────

export function GameHeader({ roomId, gameName, opponentOnline, gameVotes, myUserId, onVoteGame, onBack, rightSlot }: GameHeaderProps) {
  const [showPicker, setShowPicker] = useState(false)
  const myVote    = gameVotes[myUserId]
  const theirVote = Object.entries(gameVotes).find(([id]) => id !== myUserId)?.[1]

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="flex justify-between items-center w-full">
        <Button variant="ghost" onClick={onBack} className="text-sm px-3 py-1.5">←</Button>
        <div className="flex flex-col items-center gap-0.5">
          <span className="font-mono text-xs text-zinc-600">{roomId}</span>
          <button
            onClick={() => setShowPicker(v => !v)}
            className="text-xs text-zinc-500 hover:text-pink-400 transition-colors"
          >
            {gameName} ↕
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${opponentOnline ? 'bg-green-500' : 'bg-red-500'}`} />
          {rightSlot}
        </div>
      </div>

      {showPicker && (
        <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex flex-col gap-1.5">
          <p className="text-xs text-zinc-500 mb-1">Propor troca (ambos devem concordar):</p>
          {GAMES.map(g => {
            const iV = myVote === g.type
            const tV = theirVote === g.type
            return (
              <button key={g.type} onClick={() => { onVoteGame(g.type); setShowPicker(false) }}
                className={[
                  'w-full text-left px-3 py-2 rounded-lg text-sm transition-all border',
                  iV ? 'border-pink-600 bg-pink-950 text-pink-300'
                     : 'border-zinc-700 hover:border-pink-700 text-zinc-300',
                ].join(' ')}>
                <div className="flex justify-between items-center">
                  <span>{g.icon} {g.name} <span className="text-zinc-600 text-xs">({g.description})</span></span>
                  <span className="text-xs text-zinc-600">
                    {iV && '✓ você'}{tV && !iV && '✓ eles'}
                  </span>
                </div>
              </button>
            )
          })}
          {myVote && !theirVote && (
            <p className="text-xs text-zinc-500 text-center pt-1 animate-pulse">Aguardando concordar...</p>
          )}
          {theirVote && !myVote && (
            <p className="text-xs text-pink-400 text-center pt-1 animate-pulse">
              Querem mudar para {GAMES.find(g => g.type === theirVote)?.name}!
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Restart voting ────────────────────────────────────────────────────────────

interface RestartVotingProps {
  iVoted: boolean
  theyVoted: boolean
  onVote: () => void
  label?: string
}

export function RestartVoting({ iVoted, theyVoted, onVote, label = 'Jogar de novo' }: RestartVotingProps) {
  return (
    <div className="w-full flex flex-col gap-2 mt-2">
      {!iVoted ? (
        <Button onClick={onVote} className="w-full">{label}</Button>
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
  )
}
