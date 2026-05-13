export const PERSON_NAME = 'Gege Amor'

export interface GameMeta {
  type: string
  name: string
  minPlayers: number
  maxPlayers: number
  variable: boolean   // owner can configure player limit
  description: string
  icon: string
}

export const GAMES: GameMeta[] = [
  { type: 'tic_tac_toe',  name: 'Jogo da Velha',       minPlayers: 2, maxPlayers: 2, variable: false, description: '2 jogadores', icon: 'X O' },
  { type: 'hangman',      name: 'Forca',                minPlayers: 2, maxPlayers: 6, variable: true,  description: '2–6 jogadores', icon: '🪢' },
  { type: 'guess_number', name: 'Adivinhe o Número',    minPlayers: 2, maxPlayers: 6, variable: true,  description: '2–6 jogadores', icon: '🔢' },
  { type: 'rps',          name: 'Pedra Papel Tesoura',  minPlayers: 2, maxPlayers: 6, variable: true,  description: '2–6 jogadores', icon: '✂️' },
  { type: 'memory_game',  name: 'Jogo da Memória',      minPlayers: 2, maxPlayers: 4, variable: true,  description: '2–4 jogadores', icon: '🃏' },
  { type: 'word_chain',   name: 'Palavras Encadeadas',  minPlayers: 2, maxPlayers: 8, variable: true,  description: '2–8 jogadores', icon: '🔗' },
  { type: 'time_bomb',    name: 'Bomba Relógio',        minPlayers: 3, maxPlayers: 8, variable: true,  description: '3–8 jogadores', icon: '💣' },
  { type: 'letter_race',  name: 'Corrida de Letras',    minPlayers: 2, maxPlayers: 8, variable: true,  description: '2–8 jogadores', icon: '🏁' },
  { type: 'telepathy',    name: 'Telepatia',            minPlayers: 2, maxPlayers: 4, variable: true,  description: '2–4 jogadores', icon: '🧠' },
  { type: 'who_am_i',    name: 'Quem Sou Eu?',         minPlayers: 3, maxPlayers: 6, variable: true,  description: '3–6 jogadores', icon: '🎭' },
  { type: 'stop_game',    name: 'Stop',                 minPlayers: 2, maxPlayers: 8, variable: true,  description: '2–8 jogadores', icon: '🛑' },
  { type: 'quiz',         name: 'Quiz Relâmpago',       minPlayers: 2, maxPlayers: 8, variable: true,  description: '2–8 jogadores', icon: '⚡' },
  { type: 'blackjack',    name: 'Blackjack',            minPlayers: 2, maxPlayers: 6, variable: true,  description: '2–6 jogadores', icon: '🎴' },
  { type: 'truth_dare',   name: 'Verdade ou Desafio',   minPlayers: 3, maxPlayers: 8, variable: true,  description: '3–8 jogadores', icon: '🎯' },
]

export function findGame(type: string) {
  return GAMES.find(g => g.type === type)
}
