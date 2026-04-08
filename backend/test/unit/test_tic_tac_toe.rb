require 'minitest/autorun'
require_relative '../../lib/games/tic_tac_toe'

class TestTicTacToe < Minitest::Test
  def make_room
    {
      id: 'TEST01', type: 'tic_tac_toe',
      players: [], state: TicTacToe.initial_state, last_activity: Time.now
    }
  end

  def setup_ready_room
    room = make_room
    TicTacToe.handle(room, 'p1', { 'action' => 'join' })
    TicTacToe.handle(room, 'p2', { 'action' => 'join' })
    room
  end

  def win_for_p1(room)
    # p1: 0,1,2  p2: 3,4
    TicTacToe.handle(room, 'p1', { 'action' => 'move', 'index' => 0 })
    TicTacToe.handle(room, 'p2', { 'action' => 'move', 'index' => 3 })
    TicTacToe.handle(room, 'p1', { 'action' => 'move', 'index' => 1 })
    TicTacToe.handle(room, 'p2', { 'action' => 'move', 'index' => 4 })
    TicTacToe.handle(room, 'p1', { 'action' => 'move', 'index' => 2 })
  end

  # ── initial_state ──────────────────────────────────────────────────────────

  def test_initial_state_empty_board
    assert_equal Array.new(9, nil), TicTacToe.initial_state[:board]
  end

  def test_initial_state_no_winner_no_draw
    state = TicTacToe.initial_state
    assert_nil state[:winner]
    refute state[:draw]
  end

  def test_initial_state_has_restart_votes_empty
    assert_equal [], TicTacToe.initial_state[:restart_votes]
  end

  # ── join ───────────────────────────────────────────────────────────────────

  def test_first_player_joins
    room   = make_room
    result = TicTacToe.handle(room, 'p1', { 'action' => 'join' })
    assert_equal 'state', result[:event]
    assert_includes result[:payload][:players], 'p1'
    refute result[:payload][:ready]
  end

  def test_two_players_ready
    room   = make_room
    TicTacToe.handle(room, 'p1', { 'action' => 'join' })
    result = TicTacToe.handle(room, 'p2', { 'action' => 'join' })
    assert result[:payload][:ready]
    assert_equal 2, result[:payload][:players].length
  end

  def test_third_player_rejected
    room = setup_ready_room
    result = TicTacToe.handle(room, 'p3', { 'action' => 'join' })
    assert result[:error]
  end

  def test_first_player_is_X
    room   = make_room
    result = TicTacToe.handle(room, 'p1', { 'action' => 'join' })
    assert_equal 'X', result[:payload][:your_symbol]
  end

  def test_second_player_is_O
    room = make_room
    TicTacToe.handle(room, 'p1', { 'action' => 'join' })
    result = TicTacToe.handle(room, 'p2', { 'action' => 'join' })
    assert_equal 'O', result[:payload][:your_symbol]
  end

  def test_first_turn_is_first_player
    room = setup_ready_room
    assert_equal 'p1', room[:state][:current_turn]
  end

  def test_existing_player_can_rejoin
    room = setup_ready_room
    result = TicTacToe.handle(room, 'p1', { 'action' => 'join' })
    refute result[:error], "Rejoin should succeed"
  end

  # ── move ───────────────────────────────────────────────────────────────────

  def test_valid_move_places_symbol
    room   = setup_ready_room
    result = TicTacToe.handle(room, 'p1', { 'action' => 'move', 'index' => 0 })
    assert_equal 'X', result[:payload][:board][0]
  end

  def test_move_switches_turn
    room   = setup_ready_room
    result = TicTacToe.handle(room, 'p1', { 'action' => 'move', 'index' => 0 })
    assert_equal 'p2', result[:payload][:current_turn]
  end

  def test_out_of_turn_rejected
    room = setup_ready_room
    result = TicTacToe.handle(room, 'p2', { 'action' => 'move', 'index' => 0 })
    assert result[:error]
  end

  def test_taken_cell_rejected
    room = setup_ready_room
    TicTacToe.handle(room, 'p1', { 'action' => 'move', 'index' => 4 })
    result = TicTacToe.handle(room, 'p2', { 'action' => 'move', 'index' => 4 })
    assert result[:error]
  end

  def test_invalid_index_rejected
    room = setup_ready_room
    result = TicTacToe.handle(room, 'p1', { 'action' => 'move', 'index' => 9 })
    assert result[:error]
  end

  def test_move_after_game_over_rejected
    room = setup_ready_room
    win_for_p1(room)
    result = TicTacToe.handle(room, 'p2', { 'action' => 'move', 'index' => 5 })
    assert result[:error]
  end

  # ── win / draw ─────────────────────────────────────────────────────────────

  def test_row_win
    room   = setup_ready_room
    result = win_for_p1(room)
    assert_equal 'p1', result[:payload][:winner]
    assert_equal [0, 1, 2], result[:payload][:winning_combo]
  end

  def test_column_win
    room = setup_ready_room
    TicTacToe.handle(room, 'p1', { 'action' => 'move', 'index' => 0 })
    TicTacToe.handle(room, 'p2', { 'action' => 'move', 'index' => 1 })
    TicTacToe.handle(room, 'p1', { 'action' => 'move', 'index' => 3 })
    TicTacToe.handle(room, 'p2', { 'action' => 'move', 'index' => 2 })
    result = TicTacToe.handle(room, 'p1', { 'action' => 'move', 'index' => 6 })
    assert_equal 'p1', result[:payload][:winner]
    assert_equal [0, 3, 6], result[:payload][:winning_combo]
  end

  def test_diagonal_win
    room = setup_ready_room
    TicTacToe.handle(room, 'p1', { 'action' => 'move', 'index' => 0 })
    TicTacToe.handle(room, 'p2', { 'action' => 'move', 'index' => 1 })
    TicTacToe.handle(room, 'p1', { 'action' => 'move', 'index' => 4 })
    TicTacToe.handle(room, 'p2', { 'action' => 'move', 'index' => 2 })
    result = TicTacToe.handle(room, 'p1', { 'action' => 'move', 'index' => 8 })
    assert_equal 'p1', result[:payload][:winner]
    assert_equal [0, 4, 8], result[:payload][:winning_combo]
  end

  def test_draw
    room = setup_ready_room
    # p1:0 p2:1 p1:2 p2:5 p1:3 p2:6 p1:4 p2:8 p1:7
    [['p1',0],['p2',1],['p1',2],['p2',5],['p1',3],['p2',6],['p1',4],['p2',8]].each do |uid, idx|
      TicTacToe.handle(room, uid, { 'action' => 'move', 'index' => idx })
    end
    result = TicTacToe.handle(room, 'p1', { 'action' => 'move', 'index' => 7 })
    assert result[:payload][:draw]
    assert_nil result[:payload][:winner]
  end

  # ── restart_vote ───────────────────────────────────────────────────────────

  def test_restart_vote_rejected_during_active_game
    room   = setup_ready_room
    result = TicTacToe.handle(room, 'p1', { 'action' => 'restart_vote' })
    assert result[:error], 'Should reject vote when game is in progress'
  end

  def test_restart_vote_rejected_for_non_player
    room = setup_ready_room
    win_for_p1(room)
    result = TicTacToe.handle(room, 'outsider', { 'action' => 'restart_vote' })
    assert result[:error]
  end

  def test_one_vote_records_voter_and_game_not_reset
    room = setup_ready_room
    win_for_p1(room)
    result = TicTacToe.handle(room, 'p1', { 'action' => 'restart_vote' })
    assert_equal ['p1'], result[:payload][:restart_votes]
    assert_equal 'p1',   result[:payload][:winner], 'Game must not reset with only one vote'
  end

  def test_one_vote_does_not_clear_board
    room = setup_ready_room
    win_for_p1(room)
    TicTacToe.handle(room, 'p1', { 'action' => 'restart_vote' })
    refute room[:state][:board].all?(&:nil?), 'Board must not reset with only one vote'
  end

  def test_double_vote_same_player_does_not_count_twice
    room = setup_ready_room
    win_for_p1(room)
    TicTacToe.handle(room, 'p1', { 'action' => 'restart_vote' })
    result = TicTacToe.handle(room, 'p1', { 'action' => 'restart_vote' })
    assert_equal ['p1'], result[:payload][:restart_votes], 'Same player cannot vote twice'
    refute_nil result[:payload][:winner], 'Game must not reset'
  end

  def test_both_vote_resets_game
    room = setup_ready_room
    win_for_p1(room)
    TicTacToe.handle(room, 'p1', { 'action' => 'restart_vote' })
    result = TicTacToe.handle(room, 'p2', { 'action' => 'restart_vote' })
    assert_equal Array.new(9, nil), result[:payload][:board]
    assert_nil   result[:payload][:winner]
    refute       result[:payload][:draw]
    assert_equal [], result[:payload][:restart_votes]
  end

  def test_both_vote_sets_first_player_turn
    room = setup_ready_room
    win_for_p1(room)
    TicTacToe.handle(room, 'p1', { 'action' => 'restart_vote' })
    TicTacToe.handle(room, 'p2', { 'action' => 'restart_vote' })
    assert_equal 'p1', room[:state][:current_turn]
  end

  def test_restart_votes_included_in_state_payload
    room = setup_ready_room
    win_for_p1(room)
    result = TicTacToe.handle(room, 'p2', { 'action' => 'restart_vote' })
    assert result[:payload].key?(:restart_votes)
  end
end
