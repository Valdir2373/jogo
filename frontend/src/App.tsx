import { useState, useEffect } from 'react'
import { getUserId } from './userId'
import { TicTacToe } from './games/TicTacToe'

const userId = getUserId()

type ActiveGame = { roomId: string; gameType: string }

interface ActiveRoom {
  room_id: string
  game_type: string
  game_name: string
  ready: boolean
}

export default function App() {
  const [active, setActive]           = useState<ActiveGame | null>(null)
  const [activeRooms, setActiveRooms] = useState<ActiveRoom[]>([])

  const fetchRooms = () => {
    fetch(`/api/rooms?user_id=${encodeURIComponent(userId)}`)
      .then(r => r.json())
      .then(d => setActiveRooms(d.rooms ?? []))
      .catch(() => {})
  }

  useEffect(() => { fetchRooms() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const enterGame = (gameType: string, roomId?: string) => {
    setActive({ gameType, roomId: roomId ?? '' })
  }

  const backToMenu = () => {
    setActive(null)
    fetchRooms()
  }

  const handleGameChanged = (roomId: string, gameType: string) => {
    setActive({ gameType, roomId })
  }

  if (active?.gameType === 'tic_tac_toe') {
    return (
      <Layout>
        <TicTacToe
          userId={userId}
          resumeRoomId={active.roomId || null}
          onBack={backToMenu}
          onGameChanged={handleGameChanged}
        />
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex flex-col items-center gap-8 w-full max-w-sm">
        <p className="text-pink-400 text-sm text-center">
          Jogos feitos com amor, só pra você, Mel 💕
        </p>

        {activeRooms.length > 0 && (
          <div className="w-full">
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Continuar</p>
            <div className="flex flex-col gap-2">
              {activeRooms.map(room => (
                <button key={room.room_id}
                  onClick={() => enterGame(room.game_type, room.room_id)}
                  className="w-full bg-zinc-900 border border-zinc-800 hover:border-pink-700 rounded-xl px-5 py-3 text-left transition-all group">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono text-pink-400 font-bold tracking-widest text-sm">
                        {room.room_id}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {room.game_name} · {room.ready ? 'Em andamento' : 'Aguardando jogador'}
                      </div>
                    </div>
                    <span className="text-zinc-600 group-hover:text-pink-500 transition-colors">→</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="w-full">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Jogos</p>
          <button onClick={() => enterGame('tic_tac_toe')}
            className="w-full bg-zinc-900 border border-zinc-800 hover:border-pink-700 rounded-xl px-5 py-4 text-left transition-all group">
            <div className="flex items-center gap-4">
              <span className="text-2xl font-bold text-pink-500 group-hover:scale-110 transition-transform inline-block">X O</span>
              <div>
                <div className="font-semibold text-white">Jogo da Velha</div>
                <div className="text-sm text-zinc-500">2 jogadores</div>
              </div>
              <span className="ml-auto text-zinc-600 group-hover:text-pink-500 transition-colors">→</span>
            </div>
          </button>
        </div>
      </div>
    </Layout>
  )
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      {children}
    </div>
  )
}
