require_relative 'games/tic_tac_toe'
require_relative 'games/hangman'

class GameEngine
  ROOM_TIMEOUT = 30 * 60 # 30 minutes

  # Central registry: game_type => { name, max_players, class }
  GAMES = {
    'tic_tac_toe' => { name: 'Jogo da Velha', max_players: 2, klass: TicTacToe },
    'hangman'     => { name: 'Forca',          max_players: 6, klass: Hangman }
  }.freeze

  def self.game_info(game_type)
    GAMES[game_type]
  end

  def initialize
    @rooms = {}
    @mutex = Mutex.new
    start_cleanup_thread
  end

  def process_event(user_id, data)
    case data['action']
    when 'create_room'  then create_room(user_id, data)
    when 'game_vote'    then game_vote_action(user_id, data)
    when 'join', 'move', 'restart_vote', 'set_word', 'guess'
      room_action(user_id, data)
    else
      { error: 'unknown action' }
    end
  end

  def get_room(room_id)
    @mutex.synchronize { @rooms[room_id] }
  end

  def close_room(room_id)
    @mutex.synchronize { @rooms.delete(room_id) }
  end

  private

  def create_room(user_id, data)
    game_type = data['game_type'] || 'tic_tac_toe'
    return { error: 'unknown game type' } unless GAMES.key?(game_type)

    room_id = generate_room_id
    @mutex.synchronize do
      @rooms[room_id] = {
        id:            room_id,
        type:          game_type,
        players:       [],
        state:         initial_state_for(game_type),
        game_votes:    {},   # user_id => game_type they voted for
        last_activity: Time.now
      }
    end

    { event: 'room_created', payload: { room_id: room_id, game_type: game_type } }
  end

  def game_vote_action(user_id, data)
    room_id      = data['room_id']
    new_game     = data['game_type']&.to_s
    return { error: 'missing room_id' }   unless room_id
    return { error: 'unknown game type' } unless GAMES.key?(new_game)

    room = @mutex.synchronize { @rooms[room_id] }
    return { error: 'room not found' } unless room
    return { error: 'not a player' }   unless room[:players].include?(user_id)

    room[:game_votes][user_id] = new_game
    room[:last_activity] = Time.now

    votes = room[:game_votes]

    # Switch when enough players agreed: min(current_players, new_max_players)
    votes_needed = [room[:players].length, GAMES[new_game][:max_players]].min
    votes_cast   = votes.count { |_, gt| gt == new_game }

    if votes_cast >= votes_needed

      kicked  = trim_players(room, GAMES[new_game][:max_players])
      room[:type]        = new_game
      room[:state]       = initial_state_for(new_game)
      room[:game_votes]  = {}

      # Re-trigger turn setup if enough players
      if room[:players].length == GAMES[new_game][:max_players]
        room[:state][:current_turn] = room[:players][0]
      end

      {
        game_changed: true,
        kicked:       kicked,
        event:        'game_changed',
        payload: {
          game_type:    new_game,
          game_name:    GAMES[new_game][:name],
          max_players:  GAMES[new_game][:max_players],
          players:      room[:players],
          kicked:       kicked,
          state:        room[:state]
        }
      }
    else
      # Still waiting for the other player's vote
      {
        broadcast: true,
        event:     'game_vote_pending',
        payload: {
          votes:       votes,
          game_votes:  votes,
          game_type:   new_game,
          game_name:   GAMES[new_game][:name],
          voted_by:    user_id
        }
      }
    end
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

    info[:klass].handle(room, user_id, data)
  end

  def initial_state_for(game_type)
    info = GAMES[game_type]
    info ? info[:klass].initial_state : {}
  end

  # Keep owner (index 0) + most recently joined up to max_players.
  # Returns array of kicked user_ids.
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
