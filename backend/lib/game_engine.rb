require_relative 'games/tic_tac_toe'

class GameEngine
  ROOM_TIMEOUT = 30 * 60 # 30 minutes

  def initialize
    @rooms = {}
    @mutex = Mutex.new
    start_cleanup_thread
  end

  def process_event(user_id, data)
    action = data['action']

    case action
    when 'create_room'
      create_room(user_id, data)
    when 'join', 'move', 'restart_vote'
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
    room_id = generate_room_id

    @mutex.synchronize do
      @rooms[room_id] = {
        id: room_id,
        type: game_type,
        players: [],
        state: initial_state_for(game_type),
        last_activity: Time.now
      }
    end

    { event: 'room_created', payload: { room_id: room_id, game_type: game_type } }
  end

  def room_action(user_id, data)
    room_id = data['room_id']
    return { error: 'missing room_id' } unless room_id

    room = @mutex.synchronize { @rooms[room_id] }
    return { error: 'room not found' } unless room

    @mutex.synchronize { room[:last_activity] = Time.now }

    result = dispatch(room, user_id, data)
    result
  end

  def dispatch(room, user_id, data)
    case room[:type]
    when 'tic_tac_toe'
      TicTacToe.handle(room, user_id, data)
    else
      { error: 'unknown game type' }
    end
  end

  def initial_state_for(game_type)
    case game_type
    when 'tic_tac_toe'
      TicTacToe.initial_state
    else
      {}
    end
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
        sleep 3600 # 1 hour
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
