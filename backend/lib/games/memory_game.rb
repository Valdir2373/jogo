class MemoryGame
  PAIR_COUNTS = { 2 => 8, 3 => 9, 4 => 10 }.freeze  # players => pairs

  EMOJIS = %w[
    🍎 🍊 🍋 🍇 🍓 🍒 🥝 🍑
    🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼
    🌸 🌻 🌈 ⭐ 🎵 💎 🎈 🎭
  ].freeze

  def self.handle(room, user_id, data)
    case data['action']
    when 'join'         then handle_join(room, user_id)
    when 'flip'         then handle_flip(room, user_id, data)
    when 'restart_vote' then handle_restart_vote(room, user_id)
    else { error: 'unknown action' }
    end
  end

  def self.initial_state
    {
      phase:          'waiting',   # waiting | playing | won
      grid:           [],          # { emoji:, owner: nil|uid, face_up: bool }
      flipped:        [],          # indices currently face-up (max 2)
      current_player: nil,
      scores:         {},
      players:        [],
      restart_votes:  []
    }
  end

  private

  def self.handle_join(room, user_id)
    players = room[:players]
    players << user_id unless players.include?(user_id)
    state = room[:state]
    state[:scores][user_id] ||= 0

    if players.length >= 2 && state[:phase] == 'waiting'
      pairs = PAIR_COUNTS[players.length] || 8
      emojis = EMOJIS.first(pairs)
      deck   = (emojis + emojis).shuffle
      state[:grid] = deck.map { |e| { emoji: e, owner: nil, face_up: false } }
      state[:current_player] = players[0]
      state[:phase] = 'playing'
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_flip(room, user_id, data)
    state = room[:state]
    return { error: 'not playing' }          unless state[:phase] == 'playing'
    return { error: 'not your turn' }        unless state[:current_player] == user_id
    return { error: 'already 2 face-up' }    if state[:flipped].length >= 2

    idx = data['index'].to_i
    grid = state[:grid]
    return { error: 'invalid index' }        unless idx.between?(0, grid.length - 1)
    return { error: 'already matched' }      if grid[idx][:owner]
    return { error: 'already flipped' }      if state[:flipped].include?(idx)

    state[:flipped] << idx
    grid[idx][:face_up] = true

    if state[:flipped].length == 2
      a, b = state[:flipped]
      if grid[a][:emoji] == grid[b][:emoji]
        # Match!
        grid[a][:owner] = user_id
        grid[b][:owner] = user_id
        state[:scores][user_id] = (state[:scores][user_id] || 0) + 1
        state[:flipped] = []
        # Check if all matched
        if grid.all? { |c| c[:owner] }
          state[:phase] = 'won'
        end
        # Same player goes again
      else
        # No match — flip back after a brief reveal (server keeps face_up until next flip action)
        # Next player's turn
        players = room[:players]
        idx_cur = players.index(user_id) || 0
        state[:current_player] = players[(idx_cur + 1) % players.length]
        state[:flipped] = ['pending_flip_back', a, b]
      end
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_restart_vote(room, user_id)
    state   = room[:state]
    players = room[:players]
    return { error: 'not a player' }           unless players.include?(user_id)
    return { error: 'game still in progress' } unless state[:phase] == 'won'

    state[:restart_votes] << user_id unless state[:restart_votes].include?(user_id)

    if state[:restart_votes].length >= players.length
      scores = state[:scores].dup
      room[:state] = initial_state
      room[:state][:scores]  = scores
      room[:state][:players] = players.dup
      players.each { |p| room[:state][:scores][p] ||= 0 }

      # Re-setup grid immediately
      pairs = PAIR_COUNTS[players.length] || 8
      emojis = EMOJIS.first(pairs)
      deck   = (emojis + emojis).shuffle
      room[:state][:grid] = deck.map { |e| { emoji: e, owner: nil, face_up: false } }
      room[:state][:current_player] = players[0]
      room[:state][:phase] = 'playing'
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.public_payload(room, _viewer)
    state = room[:state]
    grid  = state[:grid]

    # Resolve pending flip-back: if flipped starts with 'pending_flip_back', hide those cards
    flipped = state[:flipped]
    display_grid = if flipped.first == 'pending_flip_back'
      a, b = flipped[1], flipped[2]
      grid.map.with_index do |card, i|
        if (i == a || i == b) && !card[:owner]
          { emoji: nil, owner: nil, face_up: false }
        else
          { emoji: card[:owner] ? card[:emoji] : (card[:face_up] ? card[:emoji] : nil),
            owner: card[:owner], face_up: card[:face_up] }
        end
      end
    else
      grid.map do |card|
        { emoji: card[:owner] ? card[:emoji] : (card[:face_up] ? card[:emoji] : nil),
          owner: card[:owner], face_up: card[:face_up] }
      end
    end

    pending_back = flipped.first == 'pending_flip_back'

    {
      phase:          state[:phase],
      grid:           display_grid,
      flipped:        pending_back ? [] : flipped,
      pending_flip_back: pending_back,
      current_player: state[:current_player],
      scores:         state[:scores],
      players:        room[:players],
      restart_votes:  state[:restart_votes],
      ready:          room[:players].length >= 2
    }
  end
end
