import { useState } from 'react'
import { getUserId } from './userId'
import { TicTacToe } from './games/TicTacToe'

const userId = getUserId()

type Game = 'menu' | 'tic_tac_toe'

export default function App() {
  const [game, setGame] = useState<Game>('menu')

  if (game === 'tic_tac_toe') {
    return (
      <Layout>
        <TicTacToe userId={userId} onBack={() => setGame('menu')} />
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex flex-col items-center gap-8 w-full max-w-sm">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-pink-600 mb-2">Tic-Tac-Love</h1>
          <p className="text-pink-400 text-sm">
            Jogos feitos com amor, só pra você, Veronica 💕
          </p>
        </div>

        <div className="flex flex-col gap-3 w-full">
          <GameCard
            title="Tic-Tac-Love"
            description="Jogo da velha com amor e simbolinhos fofos"
            emoji="♡"
            onClick={() => setGame('tic_tac_toe')}
          />
        </div>

        <p className="text-pink-200 text-xs text-center">
          Mais jogos chegando em breve... 🌸
        </p>
      </div>
    </Layout>
  )
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-red-50 flex flex-col items-center justify-center p-4">
      {children}
    </div>
  )
}

function GameCard({
  title,
  description,
  emoji,
  onClick,
}: {
  title: string
  description: string
  emoji: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white/80 hover:bg-white border-2 border-pink-100 hover:border-pink-300 rounded-2xl p-5 text-left transition-all duration-200 shadow-sm hover:shadow-md group"
    >
      <div className="flex items-center gap-4">
        <span className="text-3xl group-hover:scale-110 transition-transform">{emoji}</span>
        <div>
          <div className="font-bold text-pink-700">{title}</div>
          <div className="text-sm text-pink-400">{description}</div>
        </div>
        <span className="ml-auto text-pink-300 group-hover:text-pink-500 transition-colors">→</span>
      </div>
    </button>
  )
}
