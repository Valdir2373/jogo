require 'minitest/autorun'
require_relative '../../lib/games/tic_tac_toe'

class TestTicTacToe < Minitest::Test
  def make_room
    {
      id: 'TEST01',
      type: 'tic_tac_toe',
      players: [],
      state: TicTacToe.initial_state,
      last_activity: Time.now
    }
  end

  # --- initial_state ---

  def test_initial_state_has_empty_board
    state = TicTacToe.initial_state
    assert_equal Array.new(9, nil), state[:board]
  end

  def test_initial_state_no_winner
    state = TicTacToe.initial_state
    assert_nil state[:winner]
    refute state[:draw]
  end

  # --- join ---

  def test_first_player_joins
    room = make_room
    result = TicTacToe.handle(room, 'player1', { 'action' => 'join' })
    assert_equal 'state', result[:event]
    assert_includes result[:payload][:players], 'player1'
    refute result[:payload][:ready]
  end

  def test_two_players_join_makes_room_ready
    room = make_room
    TicTacToe.handle(room, 'player1', { 'action' => 'join' })
    result = TicTacToe.handle(room, 'player2', { 'action' => 'join' })
    assert result[:payload][:ready]
    assert_equal 2, result[:payload][:players].length
  end

  def test_third_player_cannot_join
    room = make_room
    TicTacToe.handle(room, 'player1', { 'action' => 'join' })
    TicTacToe.handle(room, 'player2', { 'action' => 'join' })
    result = TicTacToe.handle(room, 'player3', { 'action' => 'join' })
    assert result[:error]
  end

  def test_first_player_gets_symbol_X
    room = make_room
    result = TicTacToe.handle(room, 'player1', { 'action' => 'join' })
    assert_equal 'X', result[:payload][:your_symbol]
  end

  def test_second_player_gets_symbol_O
    room = make_room
    TicTacToe.handle(room, 'player1', { 'action' => 'join' })
    result = TicTacToe.handle(room, 'player2', { 'action' => 'join' })
    assert_equal 'O', result[:payload][:your_symbol]
  end

  def test_first_turn_goes_to_first_player
    room = make_room
    TicTacToe.handle(room, 'player1', { 'action' => 'join' })
    result = TicTacToe.handle(room, 'player2', { 'action' => 'join' })
    assert_equal 'player1', result[:payload][:current_turn]
  end

  # --- move ---

  def setup_ready_room
    room = make_room
    TicTacToe.handle(room, 'player1', { 'action' => 'join' })
    TicTacToe.handle(room, 'player2', { 'action' => 'join' })
    room
  end

  def test_valid_move_places_symbol
    room = setup_ready_room
    result = TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 0 })
    assert_equal 'X', result[:payload][:board][0]
  end

  def test_move_switches_turn
    room = setup_ready_room
    result = TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 0 })
    assert_equal 'player2', result[:payload][:current_turn]
  end

  def test_cannot_move_out_of_turn
    room = setup_ready_room
    result = TicTacToe.handle(room, 'player2', { 'action' => 'move', 'index' => 0 })
    assert result[:error]
  end

  def test_cannot_move_to_taken_cell
    room = setup_ready_room
    TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 4 })
    result = TicTacToe.handle(room, 'player2', { 'action' => 'move', 'index' => 4 })
    assert result[:error]
  end

  def test_cannot_move_with_invalid_index
    room = setup_ready_room
    result = TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 9 })
    assert result[:error]
  end

  # --- win detection ---

  def test_row_win_detected
    room = setup_ready_room
    # player1: 0,1,2 — player2: 3,4
    TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 0 })
    TicTacToe.handle(room, 'player2', { 'action' => 'move', 'index' => 3 })
    TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 1 })
    TicTacToe.handle(room, 'player2', { 'action' => 'move', 'index' => 4 })
    result = TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 2 })
    assert_equal 'player1', result[:payload][:winner]
    assert_equal [0, 1, 2], result[:payload][:winning_combo]
  end

  def test_column_win_detected
    room = setup_ready_room
    # player1: 0,3,6 — player2: 1,2
    TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 0 })
    TicTacToe.handle(room, 'player2', { 'action' => 'move', 'index' => 1 })
    TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 3 })
    TicTacToe.handle(room, 'player2', { 'action' => 'move', 'index' => 2 })
    result = TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 6 })
    assert_equal 'player1', result[:payload][:winner]
    assert_equal [0, 3, 6], result[:payload][:winning_combo]
  end

  def test_diagonal_win_detected
    room = setup_ready_room
    # player1: 0,4,8 — player2: 1,2
    TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 0 })
    TicTacToe.handle(room, 'player2', { 'action' => 'move', 'index' => 1 })
    TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 4 })
    TicTacToe.handle(room, 'player2', { 'action' => 'move', 'index' => 2 })
    result = TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 8 })
    assert_equal 'player1', result[:payload][:winner]
    assert_equal [0, 4, 8], result[:payload][:winning_combo]
  end

  def test_draw_detected
    room = setup_ready_room
    # X O X
    # X X O
    # O X O
    moves = [
      ['player1', 0], ['player2', 1], ['player1', 2],
      ['player1', 3], # wait — turns alternate
    ]
    # Proper draw sequence:
    # p1:0, p2:1, p1:2, p2:5, p1:3, p2:6, p1:4, p2:8, p1:7
    TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 0 })
    TicTacToe.handle(room, 'player2', { 'action' => 'move', 'index' => 1 })
    TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 2 })
    TicTacToe.handle(room, 'player2', { 'action' => 'move', 'index' => 5 })
    TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 3 })
    TicTacToe.handle(room, 'player2', { 'action' => 'move', 'index' => 6 })
    TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 4 })
    TicTacToe.handle(room, 'player2', { 'action' => 'move', 'index' => 8 })
    result = TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 7 })
    assert result[:payload][:draw]
    assert_nil result[:payload][:winner]
  end

  def test_cannot_move_after_game_over
    room = setup_ready_room
    TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 0 })
    TicTacToe.handle(room, 'player2', { 'action' => 'move', 'index' => 3 })
    TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 1 })
    TicTacToe.handle(room, 'player2', { 'action' => 'move', 'index' => 4 })
    TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 2 }) # player1 wins
    result = TicTacToe.handle(room, 'player2', { 'action' => 'move', 'index' => 5 })
    assert result[:error]
  end

  # --- restart ---

  def test_restart_resets_board
    room = setup_ready_room
    TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 0 })
    result = TicTacToe.handle(room, 'player1', { 'action' => 'restart' })
    assert_equal Array.new(9, nil), result[:payload][:board]
    assert_nil result[:payload][:winner]
    refute result[:payload][:draw]
  end

  def test_restart_sets_first_player_turn
    room = setup_ready_room
    TicTacToe.handle(room, 'player1', { 'action' => 'move', 'index' => 0 })
    TicTacToe.handle(room, 'player2', { 'action' => 'move', 'index' => 1 })
    TicTacToe.handle(room, 'player1', { 'action' => 'restart' })
    assert_equal 'player1', room[:state][:current_turn]
  end
end
