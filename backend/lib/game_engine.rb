require 'securerandom'
require 'cgi'
require_relative 'games/tic_tac_toe'
require_relative 'games/hangman'
require_relative 'games/guess_number'
require_relative 'games/rps'
require_relative 'games/memory_game'
require_relative 'games/telepathy'
require_relative 'games/word_chain'
require_relative 'games/time_bomb'
require_relative 'games/letter_race'
require_relative 'games/who_am_i'
require_relative 'games/stop_game'
require_relative 'games/blackjack'
require_relative 'games/quiz'
require_relative 'games/truth_dare'

class GameEngine
  ROOM_TIMEOUT = 30 * 60

  GAMES = {
    'tic_tac_toe'  => { name: 'Jogo da Velha',       min_players: 2, max_players: 2, variable: false, klass: TicTacToe   },
    'hangman'      => { name: 'Forca',                min_players: 2, max_players: 6, variable: true,  klass: Hangman     },
    'guess_number' => { name: 'Adivinhe o Número',    min_players: 2, max_players: 6, variable: true,  klass: GuessNumber },
    'rps'          => { name: 'Pedra Papel Tesoura',  min_players: 2, max_players: 6, variable: true,  klass: Rps         },
    'memory_game'  => { name: 'Jogo da Memória',      min_players: 2, max_players: 4, variable: true,  klass: MemoryGame  },
    'telepathy'    => { name: 'Telepatia',            min_players: 2, max_players: 4, variable: true,  klass: Telepathy   },
    'word_chain'   => { name: 'Palavras Encadeadas',  min_players: 2, max_players: 8, variable: true,  klass: WordChain   },
    'time_bomb'    => { name: 'Bomba Relógio',        min_players: 3, max_players: 8, variable: true,  klass: TimeBomb    },
    'letter_race'  => { name: 'Corrida de Letras',    min_players: 2, max_players: 8, variable: true,  klass: LetterRace  },
    'who_am_i'     => { name: 'Quem Sou Eu?',         min_players: 3, max_players: 6, variable: true,  klass: WhoAmI      },
    'stop_game'    => { name: 'Stop',                 min_players: 2, max_players: 8, variable: true,  klass: StopGame    },
    'blackjack'    => { name: 'Blackjack',            min_players: 2, max_players: 6, variable: true,  klass: Blackjack   },
    'quiz'         => { name: 'Quiz Relâmpago',       min_players: 2, max_players: 8, variable: true,  klass: Quiz        },
    'truth_dare'   => { name: 'Verdade ou Desafio',   min_players: 3, max_players: 8, variable: true,  klass: TruthDare   },
  }.freeze

  def self.game_info(game_type)
    GAMES[game_type]
  end

  def initialize
    @rooms      = {}
    @mutex      = Mutex.new
    @broadcaster = nil
    @private_messages = []
    @online_users = {}
    start_cleanup_thread
  end

  def online_users
    @mutex.synchronize { @online_users.dup }
  end

  def remove_online_user(user_id)
    @mutex.synchronize { @online_users.delete(user_id) }
  end

  def get_private_history(user_id)
    @mutex.synchronize do
      @private_messages.select { |m| m[:sender_id] == user_id || m[:recipient_id] == user_id }
    end
  end

  def set_broadcaster(&block)
    @broadcaster = block
  end

  def process_event(user_id, data)
    result = case data['action']
             when 'create_room'  then create_room(user_id, data)
             when 'game_vote'    then game_vote_action(user_id, data)
             when 'send_chat'    then send_chat_action(user_id, data)
             when 'announce'     then announce_presence(user_id, data)
             when 'send_private' then send_private_action(user_id, data)
             when 'join', 'move', 'restart_vote',
                  'set_word', 'guess',
                  'set_number', 'guess',
                  'pick', 'flip',
                  'submit', 'next_round',
                  'submit_word', 'turn_expired',
                  'bomb_exploded',
                  'submit_words',
                  'assign_words', 'ask_question', 'answer', 'guess_word',
                  'stop', 'hit', 'stand', 'new_hand',
                  'next_question', 'choose', 'vote_question', 'confirm_done', 'skip'
               room_action(user_id, data)
             else
               { error: 'unknown action' }
             end

    schedule_timer(result) if result[:start_timer]
    result
  end

  def get_room(room_id)
    @mutex.synchronize { @rooms[room_id] }
  end

  def close_room(room_id)
    @mutex.synchronize do
      room = @rooms[room_id]
      room[:timer_thread]&.kill if room
      @rooms.delete(room_id)
    end
  end

  def rooms_for_user(user_id)
    @mutex.synchronize do
      @rooms.select { |_, room| room[:players].include?(user_id) }
    end
  end

  private

  def create_room(user_id, data)
    game_type = data['game_type'].to_s
    game_type = 'tic_tac_toe' if game_type.empty?
    return { error: 'unknown game type' } unless GAMES.key?(game_type)

    info = GAMES[game_type]

    # Custom max players (clamped to game limits)
    req_max = data['max_players'].to_i
    max_players = if info[:variable] && req_max >= info[:min_players] && req_max <= info[:max_players]
      req_max
    else
      info[:max_players]
    end

    # Room name
    raw_name = data['room_name'].to_s.strip.slice(0, 30)

    room_id = generate_room_id
    @mutex.synchronize do
      idx = @rooms.count { |_, r| r[:players].include?(user_id) }
      name = raw_name.empty? ? "Sala #{idx + 1}" : raw_name

      @rooms[room_id] = {
        id:            room_id,
        name:          name,
        type:          game_type,
        players:       [],
        state:         initial_state_for(game_type),
        game_votes:    {},
        max_players:   max_players,
        last_activity: Time.now,
        timer_thread:  nil,
        timer_token:   nil,
      }
    end

    { event: 'room_created', payload: { room_id: room_id, game_type: game_type, room_name: @rooms[room_id][:name] } }
  end

  def game_vote_action(user_id, data)
    room_id  = data['room_id']
    new_game = data['game_type']&.to_s
    return { error: 'missing room_id' }   unless room_id
    return { error: 'unknown game type' } unless GAMES.key?(new_game)

    room = @mutex.synchronize { @rooms[room_id] }
    return { error: 'room not found' } unless room
    return { error: 'not a player' }   unless room[:players].include?(user_id)

    room[:game_votes][user_id] = new_game
    room[:last_activity] = Time.now

    votes = room[:game_votes]
    info  = GAMES[new_game]
    votes_needed = [room[:players].length, info[:max_players]].min
    votes_cast   = votes.count { |_, gt| gt == new_game }

    if votes_cast >= votes_needed
      kicked = trim_players(room, info[:max_players])
      room[:timer_thread]&.kill
      room[:type]       = new_game
      room[:state]      = initial_state_for(new_game)
      room[:game_votes] = {}
      room[:max_players] = info[:max_players]

      {
        game_changed: true,
        kicked:       kicked,
        event:        'game_changed',
        payload: {
          game_type:   new_game,
          game_name:   info[:name],
          max_players: info[:max_players],
          players:     room[:players],
          kicked:      kicked,
          state:       room[:state]
        }
      }
    else
      {
        broadcast: true,
        event:     'game_vote_pending',
        payload: {
          votes:      votes,
          game_votes: votes,
          game_type:  new_game,
          game_name:  info[:name],
          voted_by:   user_id
        }
      }
    end
  end

  def send_chat_action(user_id, data)
    room_id = data['room_id']
    text    = data['text'].to_s.strip
    name    = data['sender_name'].to_s.strip

    return { error: 'missing room_id' } unless room_id
    return { error: 'message too long' } if text.length > 500

    room = @mutex.synchronize { @rooms[room_id] }
    return { error: 'room not found' } unless room
    return { error: 'not in room' } unless room[:players].include?(user_id)

    escaped_text = CGI.escapeHTML(text)
    escaped_name = CGI.escapeHTML(name.empty? ? "Jogador #{user_id[0..3]}" : name)

    room[:chat_messages] ||= []
    msg = {
      id: SecureRandom.uuid,
      sender_id: user_id,
      sender_name: escaped_name,
      text: escaped_text,
      timestamp: Time.now.to_i
    }
    room[:chat_messages] << msg
    room[:chat_messages] = room[:chat_messages].last(100)
    room[:last_activity] = Time.now

    {
      broadcast: true,
      event: 'chat_message',
      payload: msg
    }
  end

  def announce_presence(user_id, data)
    name = data['name'].to_s.strip
    escaped_name = CGI.escapeHTML(name.empty? ? "Jogador #{user_id[0..3]}" : name)

    @mutex.synchronize do
      @online_users[user_id] = escaped_name
    end

    { event: 'presence_announced', payload: { user_id: user_id, name: escaped_name } }
  end


  def send_private_action(user_id, data)
    recipient_id = data['recipient_id'].to_s
    text         = data['text'].to_s.strip
    name         = data['sender_name'].to_s.strip

    return { error: 'missing recipient_id' } if recipient_id.empty?
    return { error: 'message too long' } if text.length > 500

    escaped_text = CGI.escapeHTML(text)
    escaped_name = CGI.escapeHTML(name.empty? ? "Jogador #{user_id[0..3]}" : name)

    msg = {
      id:           SecureRandom.uuid,
      sender_id:    user_id,
      sender_name:  escaped_name,
      recipient_id: recipient_id,
      text:         escaped_text,
      timestamp:    Time.now.to_i
    }

    @mutex.synchronize do
      @private_messages << msg
      @private_messages = @private_messages.last(1000)
    end

    {
      private_pm:   true,
      recipient_id: recipient_id,
      msg:          msg
    }
  end

  def room_action(user_id, data)
    room_id = data['room_id']
    return { error: 'missing room_id' } unless room_id

    room = @mutex.synchronize { @rooms[room_id] }
    return { error: 'room not found' } unless room

    room[:last_activity] = Time.now
    dispatch(room, user_id, data)
  end

  def dispatch(room, user_id, data)
    info = GAMES[room[:type]]
    return { error: 'unknown game type' } unless info

    # Centralised join capacity check
    if data['action'] == 'join'
      players = room[:players]
      max     = room[:max_players] || info[:max_players]
      return { error: 'room full' } if players.length >= max && !players.include?(user_id)
    end

    info[:klass].handle(room, user_id, data)
  end

  def schedule_timer(result)
    rid   = result[:timer_room_id]
    delay = result[:start_timer]
    tdata = result[:timer_data]
    token = result[:timer_token]
    return unless rid && delay && tdata

    room = @mutex.synchronize { @rooms[rid] }
    return unless room

    room[:timer_thread]&.kill
    room[:timer_token] = token

    room[:timer_thread] = Thread.new do
      sleep delay.to_f
      @mutex.synchronize do
        r = @rooms[rid]
        next unless r
        next if token && r[:timer_token] != token

        timer_result = dispatch(r, '__timer__', tdata)
        if timer_result[:broadcast] && @broadcaster
          @broadcaster.call(rid, timer_result[:event], timer_result[:payload])
          schedule_timer(timer_result) if timer_result[:start_timer]
        end
      end
    end
  end

  def initial_state_for(game_type)
    info = GAMES[game_type]
    info ? info[:klass].initial_state : {}
  end

  def trim_players(room, max_players)
    players = room[:players]
    return [] if players.length <= max_players
    kept   = [players[0]] + players[1..].last(max_players - 1)
    kicked = players - kept
    room[:players] = kept
    kicked
  end

  def generate_room_id
    loop do
      id = SecureRandom.alphanumeric(6).upcase
      return id unless @rooms.key?(id)
    end
  end

  def start_cleanup_thread
    Thread.new do
      loop do
        sleep 3600
        cleanup_rooms
      end
    end
  end

  def cleanup_rooms
    cutoff = Time.now - ROOM_TIMEOUT
    @mutex.synchronize do
      @rooms.delete_if { |_, room| room[:last_activity] < cutoff }
    end
  end
end
