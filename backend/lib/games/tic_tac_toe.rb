class TicTacToe
  WINNING_COMBOS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ].freeze

  def self.handle(room, user_id, data)
    case data['action']
    when 'join'         then handle_join(room, user_id, data)
    when 'move'         then handle_move(room, user_id, data)
    when 'restart_vote' then handle_restart_vote(room, user_id)
    else { error: 'unknown action' }
    end
  end

  def self.initial_state
    {
      board:         Array.new(9, nil),
      current_turn:  nil,
      winner:        nil,
      draw:          false,
      winning_combo: nil,
      restart_votes: []
    }
  end

  private

  def self.handle_join(room, user_id, _data)
    state   = room[:state]
    players = room[:players]

    return { error: 'room full' } if players.length >= 2 && !players.include?(user_id)

    players << user_id unless players.include?(user_id)

    state[:current_turn] = players[0] if players.length == 2 && state[:current_turn].nil?

    symbol = players.index(user_id) == 0 ? 'X' : 'O'

    {
      broadcast: true,
      event:     'state',
      payload:   full_payload(state, players).merge(your_symbol: symbol, player_joined: user_id)
    }
  end

  def self.handle_move(room, user_id, data)
    state   = room[:state]
    players = room[:players]
    index   = data['index']&.to_i

    return { error: 'not your turn' }   unless state[:current_turn] == user_id
    return { error: 'game over' }       if state[:winner] || state[:draw]
    return { error: 'invalid index' }   unless index&.between?(0, 8)
    return { error: 'cell taken' }      if state[:board][index]

    state[:board][index] = players.index(user_id) == 0 ? 'X' : 'O'

    combo = check_winner(state[:board])
    if combo
      state[:winner]        = user_id
      state[:winning_combo] = combo
    elsif state[:board].none?(&:nil?)
      state[:draw] = true
    else
      state[:current_turn] = players.find { |p| p != user_id }
    end

    { broadcast: true, event: 'state', payload: full_payload(state, players) }
  end

  def self.handle_restart_vote(room, user_id)
    state   = room[:state]
    players = room[:players]

    return { error: 'not a player' }           unless players.include?(user_id)
    return { error: 'game still in progress' } unless state[:winner] || state[:draw]

    state[:restart_votes] << user_id unless state[:restart_votes].include?(user_id)

    if state[:restart_votes].length == players.length
      # Both agreed — reset
      room[:state]                  = initial_state
      room[:state][:current_turn]   = players[0]
    end

    { broadcast: true, event: 'state', payload: full_payload(room[:state], players) }
  end

  def self.full_payload(state, players)
    {
      board:         state[:board],
      current_turn:  state[:current_turn],
      winner:        state[:winner],
      draw:          state[:draw],
      winning_combo: state[:winning_combo],
      restart_votes: state[:restart_votes],
      players:       players,
      ready:         players.length == 2
    }
  end

  def self.check_winner(board)
    WINNING_COMBOS.each do |combo|
      a, b, c = combo
      return combo if board[a] && board[a] == board[b] && board[a] == board[c]
    end
    nil
  end
end
