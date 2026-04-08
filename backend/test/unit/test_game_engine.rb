require 'minitest/autorun'
require_relative '../../lib/game_engine'

class TestGameEngine < Minitest::Test
  def setup
    @engine = GameEngine.new
  end

  # --- create_room ---

  def test_create_room_returns_room_created_event
    result = @engine.process_event('user1', { 'action' => 'create_room', 'game_type' => 'tic_tac_toe' })
    assert_equal 'room_created', result[:event]
  end

  def test_create_room_returns_room_id
    result = @engine.process_event('user1', { 'action' => 'create_room' })
    refute_nil result[:payload][:room_id]
    assert result[:payload][:room_id].length > 0
  end

  def test_create_room_stores_room
    result = @engine.process_event('user1', { 'action' => 'create_room' })
    room_id = result[:payload][:room_id]
    room = @engine.get_room(room_id)
    refute_nil room
    assert_equal room_id, room[:id]
  end

  def test_create_room_defaults_to_tic_tac_toe
    result = @engine.process_event('user1', { 'action' => 'create_room' })
    assert_equal 'tic_tac_toe', result[:payload][:game_type]
  end

  def test_create_room_generates_unique_ids
    ids = 10.times.map do
      @engine.process_event('user1', { 'action' => 'create_room' })[:payload][:room_id]
    end
    assert_equal ids.uniq.length, ids.length
  end

  # --- join (room_action) ---

  def test_join_nonexistent_room_returns_error
    result = @engine.process_event('user1', { 'action' => 'join', 'room_id' => 'NOPE99' })
    assert result[:error]
  end

  def test_join_without_room_id_returns_error
    result = @engine.process_event('user1', { 'action' => 'join' })
    assert result[:error]
  end

  def test_join_existing_room_succeeds
    room_id = @engine.process_event('user1', { 'action' => 'create_room' })[:payload][:room_id]
    result = @engine.process_event('user1', { 'action' => 'join', 'room_id' => room_id })
    assert_equal 'state', result[:event]
  end

  # --- move ---

  def test_move_on_valid_room
    room_id = @engine.process_event('user1', { 'action' => 'create_room' })[:payload][:room_id]
    @engine.process_event('user1', { 'action' => 'join', 'room_id' => room_id })
    @engine.process_event('user2', { 'action' => 'join', 'room_id' => room_id })
    result = @engine.process_event('user1', { 'action' => 'move', 'room_id' => room_id, 'index' => 0 })
    assert_equal 'state', result[:event]
    assert_equal 'X', result[:payload][:board][0]
  end

  def test_unknown_action_returns_error
    result = @engine.process_event('user1', { 'action' => 'blah' })
    assert result[:error]
  end
end
