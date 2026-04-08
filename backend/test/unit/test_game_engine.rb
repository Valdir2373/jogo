require 'minitest/autorun'
require_relative '../../lib/game_engine'

class TestGameEngine < Minitest::Test
  def setup
    @engine = GameEngine.new
  end

  def create_and_join_two(uid1: 'u1', uid2: 'u2')
    room_id = @engine.process_event(uid1, { 'action' => 'create_room' })[:payload][:room_id]
    @engine.process_event(uid1, { 'action' => 'join', 'room_id' => room_id })
    @engine.process_event(uid2, { 'action' => 'join', 'room_id' => room_id })
    room_id
  end

  # ── create_room ─────────────────────────────────────────────────────────────

  def test_create_room_event
    result = @engine.process_event('u1', { 'action' => 'create_room', 'game_type' => 'tic_tac_toe' })
    assert_equal 'room_created', result[:event]
  end

  def test_create_room_has_room_id
    result = @engine.process_event('u1', { 'action' => 'create_room' })
    refute_nil result[:payload][:room_id]
  end

  def test_create_room_stored
    result  = @engine.process_event('u1', { 'action' => 'create_room' })
    room_id = result[:payload][:room_id]
    refute_nil @engine.get_room(room_id)
  end

  def test_create_room_default_game_type
    result = @engine.process_event('u1', { 'action' => 'create_room' })
    assert_equal 'tic_tac_toe', result[:payload][:game_type]
  end

  def test_create_room_unique_ids
    ids = 10.times.map { @engine.process_event('u1', { 'action' => 'create_room' })[:payload][:room_id] }
    assert_equal ids.uniq.length, ids.length
  end

  # ── join ────────────────────────────────────────────────────────────────────

  def test_join_missing_room_id
    result = @engine.process_event('u1', { 'action' => 'join' })
    assert result[:error]
  end

  def test_join_nonexistent_room
    result = @engine.process_event('u1', { 'action' => 'join', 'room_id' => 'NOPE99' })
    assert result[:error]
  end

  def test_join_existing_room
    room_id = @engine.process_event('u1', { 'action' => 'create_room' })[:payload][:room_id]
    result  = @engine.process_event('u1', { 'action' => 'join', 'room_id' => room_id })
    assert_equal 'state', result[:event]
  end

  # ── move ────────────────────────────────────────────────────────────────────

  def test_move_on_valid_room
    room_id = create_and_join_two
    result  = @engine.process_event('u1', { 'action' => 'move', 'room_id' => room_id, 'index' => 0 })
    assert_equal 'state', result[:event]
    assert_equal 'X', result[:payload][:board][0]
  end

  # ── restart_vote ─────────────────────────────────────────────────────────────

  def test_restart_vote_rejected_mid_game
    room_id = create_and_join_two
    result  = @engine.process_event('u1', { 'action' => 'restart_vote', 'room_id' => room_id })
    assert result[:error]
  end

  def test_restart_vote_routed_correctly
    room_id = create_and_join_two
    # Make p1 win
    @engine.process_event('u1', { 'action' => 'move', 'room_id' => room_id, 'index' => 0 })
    @engine.process_event('u2', { 'action' => 'move', 'room_id' => room_id, 'index' => 3 })
    @engine.process_event('u1', { 'action' => 'move', 'room_id' => room_id, 'index' => 1 })
    @engine.process_event('u2', { 'action' => 'move', 'room_id' => room_id, 'index' => 4 })
    @engine.process_event('u1', { 'action' => 'move', 'room_id' => room_id, 'index' => 2 })

    result = @engine.process_event('u1', { 'action' => 'restart_vote', 'room_id' => room_id })
    assert_equal 'state', result[:event]
    assert_equal ['u1'], result[:payload][:restart_votes]
  end

  # ── close_room ───────────────────────────────────────────────────────────────

  def test_close_room_removes_it
    room_id = @engine.process_event('u1', { 'action' => 'create_room' })[:payload][:room_id]
    @engine.close_room(room_id)
    assert_nil @engine.get_room(room_id)
  end

  # ── unknown action ───────────────────────────────────────────────────────────

  def test_unknown_action
    result = @engine.process_event('u1', { 'action' => 'blah' })
    assert result[:error]
  end
end
