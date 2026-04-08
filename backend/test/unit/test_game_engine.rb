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

  def win_p1(room_id, uid1: 'u1', uid2: 'u2')
    @engine.process_event(uid1, { 'action' => 'move', 'room_id' => room_id, 'index' => 0 })
    @engine.process_event(uid2, { 'action' => 'move', 'room_id' => room_id, 'index' => 3 })
    @engine.process_event(uid1, { 'action' => 'move', 'room_id' => room_id, 'index' => 1 })
    @engine.process_event(uid2, { 'action' => 'move', 'room_id' => room_id, 'index' => 4 })
    @engine.process_event(uid1, { 'action' => 'move', 'room_id' => room_id, 'index' => 2 })
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

  def test_create_room_unknown_game_type_rejected
    result = @engine.process_event('u1', { 'action' => 'create_room', 'game_type' => 'chess' })
    assert result[:error]
  end

  def test_create_room_unique_ids
    ids = 10.times.map { @engine.process_event('u1', { 'action' => 'create_room' })[:payload][:room_id] }
    assert_equal ids.uniq.length, ids.length
  end

  def test_room_has_game_votes_initialized
    room_id = @engine.process_event('u1', { 'action' => 'create_room' })[:payload][:room_id]
    room = @engine.get_room(room_id)
    assert_equal({}, room[:game_votes])
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

  def test_restart_vote_after_win
    room_id = create_and_join_two
    win_p1(room_id)
    result = @engine.process_event('u1', { 'action' => 'restart_vote', 'room_id' => room_id })
    assert_equal 'state', result[:event]
    assert_equal ['u1'], result[:payload][:restart_votes]
  end

  # ── game_vote ────────────────────────────────────────────────────────────────

  def test_game_vote_unknown_game_rejected
    room_id = create_and_join_two
    result  = @engine.process_event('u1', { 'action' => 'game_vote', 'room_id' => room_id, 'game_type' => 'chess' })
    assert result[:error]
  end

  def test_game_vote_non_player_rejected
    room_id = create_and_join_two
    result  = @engine.process_event('outsider', { 'action' => 'game_vote', 'room_id' => room_id, 'game_type' => 'tic_tac_toe' })
    assert result[:error]
  end

  def test_game_vote_one_vote_pending
    room_id = create_and_join_two
    result  = @engine.process_event('u1', { 'action' => 'game_vote', 'room_id' => room_id, 'game_type' => 'tic_tac_toe' })
    assert_equal 'game_vote_pending', result[:event]
    assert_equal({ 'u1' => 'tic_tac_toe' }, result[:payload][:game_votes])
  end

  def test_game_vote_both_same_triggers_game_changed
    room_id = create_and_join_two
    @engine.process_event('u1', { 'action' => 'game_vote', 'room_id' => room_id, 'game_type' => 'tic_tac_toe' })
    result = @engine.process_event('u2', { 'action' => 'game_vote', 'room_id' => room_id, 'game_type' => 'tic_tac_toe' })
    assert result[:game_changed], 'Expected game_changed flag'
    assert_equal 'game_changed', result[:event]
    assert_equal 'tic_tac_toe', result[:payload][:game_type]
  end

  def test_game_vote_resets_state_on_switch
    room_id = create_and_join_two
    win_p1(room_id)
    @engine.process_event('u1', { 'action' => 'game_vote', 'room_id' => room_id, 'game_type' => 'tic_tac_toe' })
    @engine.process_event('u2', { 'action' => 'game_vote', 'room_id' => room_id, 'game_type' => 'tic_tac_toe' })
    room = @engine.get_room(room_id)
    assert_equal Array.new(9, nil), room[:state][:board]
    assert_nil room[:state][:winner]
    assert_equal({}, room[:game_votes])
  end

  def test_game_vote_clears_votes_after_switch
    room_id = create_and_join_two
    @engine.process_event('u1', { 'action' => 'game_vote', 'room_id' => room_id, 'game_type' => 'tic_tac_toe' })
    @engine.process_event('u2', { 'action' => 'game_vote', 'room_id' => room_id, 'game_type' => 'tic_tac_toe' })
    room = @engine.get_room(room_id)
    assert_equal({}, room[:game_votes])
  end

  # ── trim_players ─────────────────────────────────────────────────────────────

  def test_trim_players_no_kick_when_within_limit
    room_id = create_and_join_two
    # 2 players, tic_tac_toe max is 2 — no one kicked
    @engine.process_event('u1', { 'action' => 'game_vote', 'room_id' => room_id, 'game_type' => 'tic_tac_toe' })
    result = @engine.process_event('u2', { 'action' => 'game_vote', 'room_id' => room_id, 'game_type' => 'tic_tac_toe' })
    assert_equal [], result[:kicked]
  end

  def test_trim_players_keeps_owner_and_most_recent
    # Simulate a room with 3 players switching to tic_tac_toe (max 2)
    room_id = @engine.process_event('owner', { 'action' => 'create_room' })[:payload][:room_id]
    @engine.process_event('owner', { 'action' => 'join', 'room_id' => room_id })
    @engine.process_event('p2',    { 'action' => 'join', 'room_id' => room_id })

    # Manually add a 3rd player to simulate future multi-player game
    room = @engine.get_room(room_id)
    room[:players] << 'p3'

    # Switch to tic_tac_toe (max 2) — should keep owner + p3 (most recent)
    @engine.process_event('owner', { 'action' => 'game_vote', 'room_id' => room_id, 'game_type' => 'tic_tac_toe' })
    result = @engine.process_event('p2',   { 'action' => 'game_vote', 'room_id' => room_id, 'game_type' => 'tic_tac_toe' })

    room_after = @engine.get_room(room_id)
    assert_equal ['owner', 'p3'], room_after[:players]
    assert_equal ['p2'], result[:kicked]
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
