import { useState, useEffect } from 'react'
import { getUserId } from './userId'
import { GAMES, PERSON_NAME } from './GAMES'
import { TicTacToe }   from './games/TicTacToe'
import { Hangman }     from './games/Hangman'
import { GuessNumber } from './games/GuessNumber'
import { Rps }         from './games/Rps'
import { MemoryGame }  from './games/MemoryGame'
import { Telepathy }   from './games/Telepathy'
import { WordChain }   from './games/WordChain'
import { TimeBomb }    from './games/TimeBomb'
import { LetterRace }  from './games/LetterRace'
import { WhoAmI }      from './games/WhoAmI'
import { StopGame }    from './games/StopGame'
import { Blackjack }   from './games/Blackjack'
import { Quiz }        from './games/Quiz'
import { TruthDare }   from './games/TruthDare'

const userId = getUserId()

type ActiveGame = { roomId: string; gameType: string }

interface ActiveRoom {
  room_id: string
  room_name: string
  game_type: string
  game_name: string
  ready: boolean
}

// ── Settings (localStorage) ───────────────────────────────────────────────────

const THEMES = [
  { id: 'pink',   label: 'Rosa',   bg: 'bg-black',       accent: 'text-pink-400',   border: 'border-pink-700',   dot: 'bg-pink-500'   },
  { id: 'blue',   label: 'Azul',   bg: 'bg-zinc-950',    accent: 'text-blue-400',   border: 'border-blue-700',   dot: 'bg-blue-500'   },
  { id: 'purple', label: 'Roxo',   bg: 'bg-zinc-950',    accent: 'text-purple-400', border: 'border-purple-700', dot: 'bg-purple-500' },
  { id: 'green',  label: 'Verde',  bg: 'bg-zinc-950',    accent: 'text-emerald-400',border: 'border-emerald-700',dot: 'bg-emerald-500'},
  { id: 'orange', label: 'Laranja',bg: 'bg-zinc-950',    accent: 'text-orange-400', border: 'border-orange-700', dot: 'bg-orange-500' },
  { id: 'custom', label: 'Personalizado', bg: 'bg-black', accent: 'text-primary-accent', border: 'border-primary-border', dot: 'bg-primary' },
]

function loadSettings() {
  return {
    displayName: localStorage.getItem('display_name') ?? '',
    themeId:     localStorage.getItem('color_theme')  ?? 'pink',
    customColor: localStorage.getItem('custom_color') ?? '#ec4899',
  }
}

function saveSettings(displayName: string, themeId: string, customColor: string) {
  localStorage.setItem('display_name', displayName)
  localStorage.setItem('color_theme',  themeId)
  localStorage.setItem('custom_color', customColor)
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [active,       setActive]       = useState<ActiveGame | null>(null)
  const [activeRooms,  setActiveRooms]  = useState<ActiveRoom[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [settings,     setSettings]     = useState(loadSettings)
  const [nameInput,    setNameInput]    = useState(loadSettings().displayName)
  const [customColorInput, setCustomColorInput] = useState(loadSettings().customColor)
  const [joinCode,     setJoinCode]     = useState('')
  const [joinError,    setJoinError]    = useState('')

  const theme = THEMES.find(t => t.id === settings.themeId) ?? THEMES[0]

  const fetchRooms = () => {
    fetch(`/api/rooms?user_id=${encodeURIComponent(userId)}`)
      .then(r => r.json())
      .then(d => setActiveRooms(d.rooms ?? []))
      .catch(() => {})
  }

  useEffect(() => {
    fetchRooms()
    document.title = `Jogos ${PERSON_NAME} 💕`
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const root = document.documentElement
    const themeColors: Record<string, { main: string; accent: string; border: string; bg: string }> = {
      pink:   { main: '#ec4899', accent: '#f472b6', border: '#be185d', bg: '#500724' },
      blue:   { main: '#3b82f6', accent: '#60a5fa', border: '#1d4ed8', bg: '#172554' },
      purple: { main: '#a855f7', accent: '#c084fc', border: '#7e22ce', bg: '#3b0764' },
      green:  { main: '#10b981', accent: '#34d399', border: '#047857', bg: '#022c22' },
      orange: { main: '#f97316', accent: '#fb923c', border: '#c2410c', bg: '#431407' },
    }

    if (settings.themeId === 'custom') {
      const color = settings.customColor
      root.style.setProperty('--primary-color', color)
      root.style.setProperty('--primary-accent', `color-mix(in srgb, ${color} 90%, white)`)
      root.style.setProperty('--primary-border', `color-mix(in srgb, ${color} 70%, black)`)
      root.style.setProperty('--primary-bg', `color-mix(in srgb, ${color} 15%, black)`)
    } else {
      const colors = themeColors[settings.themeId] || themeColors.pink
      root.style.setProperty('--primary-color', colors.main)
      root.style.setProperty('--primary-accent', colors.accent)
      root.style.setProperty('--primary-border', colors.border)
      root.style.setProperty('--primary-bg', colors.bg)
    }
  }, [settings.themeId, settings.customColor])

  const enterGame = (gameType: string, roomId?: string) => setActive({ gameType, roomId: roomId ?? '' })

  const handleJoinByCode = async () => {
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    setJoinError('')
    try {
      const r = await fetch(`/api/room/${encodeURIComponent(code)}`)
      if (!r.ok) { setJoinError('Sala não encontrada.'); return }
      const data = await r.json()
      setJoinCode('')
      enterGame(data.game_type, code)
    } catch {
      setJoinError('Erro ao buscar sala.')
    }
  }
  const backToMenu = () => { setActive(null); fetchRooms() }
  const handleGameChanged = (roomId: string, gameType: string) => setActive({ gameType, roomId })

  const applySettings = () => {
    const s = { displayName: nameInput, themeId: settings.themeId, customColor: customColorInput }
    setSettings(s)
    saveSettings(s.displayName, s.themeId, s.customColor)
    setShowSettings(false)
  }

  const gameProps = (_gameType: string, roomId?: string) => ({
    userId,
    resumeRoomId: roomId ?? null,
    onBack:        backToMenu,
    onGameChanged: handleGameChanged,
  })

  // Route to the active game component
  if (active) {
    const props = gameProps(active.gameType, active.roomId)
    const map: Record<string, React.ReactNode> = {
      tic_tac_toe:  <TicTacToe  {...props} />,
      hangman:      <Hangman     {...props} />,
      guess_number: <GuessNumber {...props} />,
      rps:          <Rps         {...props} />,
      memory_game:  <MemoryGame  {...props} />,
      telepathy:    <Telepathy   {...props} />,
      word_chain:   <WordChain   {...props} />,
      time_bomb:    <TimeBomb    {...props} />,
      letter_race:  <LetterRace  {...props} />,
      who_am_i:     <WhoAmI      {...props} />,
      stop_game:    <StopGame    {...props} />,
      blackjack:    <Blackjack   {...props} />,
      quiz:         <Quiz        {...props} />,
      truth_dare:   <TruthDare   {...props} />,
    }
    const component = map[active.gameType]
    if (component) return <Layout bgClass={theme.bg}>{component}</Layout>
  }

  return (
    <Layout bgClass={theme.bg}>
      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        {/* Header */}
        <div className="flex justify-between items-center w-full">
          <div />
          <p className={`${theme.accent} text-sm text-center`}>
            Jogos feitos com amor, só pra você, {PERSON_NAME} 💕
          </p>
          <button onClick={() => { setNameInput(settings.displayName); setCustomColorInput(settings.customColor); setShowSettings(v => !v) }}
            className="text-zinc-500 hover:text-zinc-300 transition-colors text-lg">⚙</button>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-4 flex flex-col gap-3">
            <p className="text-white font-semibold text-sm">Configurações</p>
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-widest block mb-1">Seu nome</label>
              <input value={nameInput} onChange={e => setNameInput(e.target.value)} maxLength={20}
                placeholder="Como quer ser chamado?"
                className="w-full bg-zinc-800 border border-zinc-700 focus:border-primary rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-widest block mb-2">Tema de cores</label>
              <div className="flex gap-2 flex-wrap items-center">
                {THEMES.map(t => {
                  if (t.id === 'custom') {
                    return (
                      <div key={t.id} className="flex items-center gap-2">
                        <button onClick={() => setSettings(prev => ({ ...prev, themeId: t.id }))}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${settings.themeId === t.id ? 'border-zinc-400 text-white' : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'}`}>
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: customColorInput }} />
                          {t.label}
                        </button>
                        <input type="color" value={customColorInput}
                          onChange={e => {
                            setCustomColorInput(e.target.value)
                            setSettings(prev => ({ ...prev, themeId: 'custom', customColor: e.target.value }))
                          }}
                          className="w-8 h-8 rounded cursor-pointer border border-zinc-700 bg-zinc-900 p-0"
                          title="Escolher cor personalizada" />
                      </div>
                    )
                  }
                  return (
                    <button key={t.id} onClick={() => setSettings(prev => ({ ...prev, themeId: t.id }))}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${settings.themeId === t.id ? 'border-zinc-400 text-white' : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'}`}>
                      <span className={`w-2.5 h-2.5 rounded-full ${t.dot}`} />
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <button onClick={applySettings}
              className={`w-full py-2 rounded-lg text-sm font-semibold ${theme.accent} bg-zinc-800 hover:bg-zinc-700 transition-colors border ${theme.border}`}>
              Salvar
            </button>
          </div>
        )}

        {/* Active rooms (continue) */}
        {activeRooms.length > 0 && (
          <div className="w-full">
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Continuar</p>
            <div className="flex flex-col gap-2">
              {activeRooms.map(room => (
                <button key={room.room_id} onClick={() => enterGame(room.game_type, room.room_id)}
                  className={`w-full bg-zinc-900 border border-zinc-800 hover:${theme.border} rounded-xl px-5 py-3 text-left transition-all group`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`font-semibold ${theme.accent}`}>
                        {room.room_name || room.room_id}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {room.game_name} · {room.ready ? 'Em andamento' : 'Aguardando jogador'}
                      </div>
                    </div>
                    <span className="text-zinc-600 group-hover:text-zinc-300 transition-colors">→</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Join by code */}
        <div className="w-full">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">🔍 Achar sala</p>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError('') }}
              onKeyDown={e => e.key === 'Enter' && handleJoinByCode()}
              placeholder="Código da sala"
              maxLength={6}
              className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-primary rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none font-mono uppercase tracking-widest"
            />
            <button onClick={handleJoinByCode}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${theme.accent} bg-zinc-900 ${theme.border} hover:bg-zinc-800`}>
              Entrar
            </button>
          </div>
          {joinError && <p className="text-red-400 text-xs mt-1">{joinError}</p>}
        </div>

        {/* Game list */}
        <div className="w-full">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Jogos</p>
          <div className="flex flex-col gap-2">
            {GAMES.map(g => (
              <button key={g.type} onClick={() => enterGame(g.type)}
                className={`w-full bg-zinc-900 border border-zinc-800 hover:${theme.border} rounded-xl px-5 py-3 text-left transition-all group`}>
                <div className="flex items-center gap-3">
                  <span className="text-xl w-8 text-center">{g.icon}</span>
                  <div>
                    <div className="font-semibold text-white text-sm">{g.name}</div>
                    <div className="text-xs text-zinc-500">{g.description}</div>
                  </div>
                  <span className="ml-auto text-zinc-600 group-hover:text-zinc-300 transition-colors">→</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  )
}

function Layout({ children, bgClass }: { children: React.ReactNode; bgClass: string }) {
  return (
    <div className={`min-h-screen ${bgClass} flex flex-col items-center justify-center p-4`}>
      {children}
    </div>
  )
}
