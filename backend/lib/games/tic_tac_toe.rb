class TicTacToe
  WINNING_COMBOS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ].freeze

  def self.handle(room, user_id, data)
    action = data['action']

    case action
    when 'join'
      handle_join(room, user_id, data)
    when 'move'
      handle_move(room, user_id, data)
    when 'restart'
      handle_restart(room, user_id)
    else
      { error: 'unknown action' }
    end
  end

  def self.initial_state
    {
      board: Array.new(9, nil),
      current_turn: nil,
      winner: nil,
      draw: false,
      winning_combo: nil
    }
  end

  private

  def self.handle_join(room, user_id, data)
    state = room[:state]
    players = room[:players]

    return { error: 'room full' } if players.length >= 2 && !players.include?(user_id)

    unless players.include?(user_id)
      players << user_id
    end

    if players.length == 2 && state[:current_turn].nil?
      state[:current_turn] = players[0]
    end

    symbol = players.index(user_id) == 0 ? 'X' : 'O'

    {
      broadcast: true,
      event: 'state',
      payload: {
        board: state[:board],
        current_turn: state[:current_turn],
        winner: state[:winner],
        draw: state[:draw],
        winning_combo: state[:winning_combo],
        players: players,
        your_symbol: symbol,
        player_joined: user_id,
        ready: players.length == 2
      }
    }
  end

  def self.handle_move(room, user_id, data)
    state = room[:state]
    players = room[:players]
    index = data['index']&.to_i

    return { error: 'not your turn' } unless state[:current_turn] == user_id
    return { error: 'game over' } if state[:winner] || state[:draw]
    return { error: 'invalid index' } unless index&.between?(0, 8)
    return { error: 'cell taken' } if state[:board][index]

    symbol = players.index(user_id) == 0 ? 'X' : 'O'
    state[:board][index] = symbol

    winner_combo = check_winner(state[:board])
    if winner_combo
      state[:winner] = user_id
      state[:winning_combo] = winner_combo
    elsif state[:board].none?(&:nil?)
      state[:draw] = true
    else
      state[:current_turn] = players.find { |p| p != user_id }
    end

    {
      broadcast: true,
      event: 'state',
      payload: {
        board: state[:board],
        current_turn: state[:current_turn],
        winner: state[:winner],
        draw: state[:draw],
        winning_combo: state[:winning_combo],
        players: players,
        ready: true
      }
    }
  end

  def self.handle_restart(room, user_id)
    room[:state] = initial_state
    players = room[:players]
    room[:state][:current_turn] = players[0] if players.length == 2

    {
      broadcast: true,
      event: 'state',
      payload: {
        board: room[:state][:board],
        current_turn: room[:state][:current_turn],
        winner: nil,
        draw: false,
        winning_combo: nil,
        players: players,
        ready: players.length == 2
      }
    }
  end

  def self.check_winner(board)
    WINNING_COMBOS.each do |combo|
      a, b, c = combo
      next unless board[a] && board[a] == board[b] && board[a] == board[c]
      return combo
    end
    nil
  end
end
