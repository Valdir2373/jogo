class WordChain
  TURN_TIME   = 10  # seconds per turn
  LIVES_START = 3
  MIN_LENGTH  = 2   # word must be at least 2 letters

  def self.handle(room, user_id, data)
    case data['action']
    when 'join'           then handle_join(room, user_id)
    when 'submit_word'    then handle_submit(room, user_id, data)
    when 'turn_expired'   then handle_turn_expired(room, user_id)
    when 'restart_vote'   then handle_restart_vote(room, user_id)
    else { error: 'unknown action' }
    end
  end

  def self.initial_state
    {
      phase:          'waiting',   # waiting | playing | over
      current_word:   nil,
      current_player: nil,
      last_letter:    nil,
      lives:          {},
      used_words:     [],
      history:        [],          # { player:, word: }
      winner:         nil,
      players:        [],
      turn_started_at: nil,
      restart_votes:  []
    }
  end

  private

  def self.handle_join(room, user_id)
    players = room[:players]
    players << user_id unless players.include?(user_id)
    state = room[:state]
    state[:lives][user_id] ||= LIVES_START

    if players.length >= 2 && state[:phase] == 'waiting'
      start_game(room)
    end

    { broadcast: true, event: 'state', payload: public_payload(room) }
  end

  def self.start_game(room)
    state = room[:state]
    players = room[:players]
    players.each { |p| state[:lives][p] ||= LIVES_START }

    # Start with a random 3-letter word as seed
    seeds = %w[mão pé sol mar rio céu paz amor mel luz lei cor fim fé voo ato]
    seed = seeds.sample
    state[:current_word]   = seed
    state[:last_letter]    = seed[-1]
    state[:history]        = [{ player: 'game', word: seed }]
    state[:used_words]     = [seed]
    state[:current_player] = players[0]
    state[:phase]          = 'playing'
    state[:turn_started_at] = Time.now.to_i
  end

  def self.handle_submit(room, user_id, data)
    state = room[:state]
    return { error: 'game not playing' }   unless state[:phase] == 'playing'
    return { error: 'not your turn' }      unless state[:current_player] == user_id

    # Check time limit
    if state[:turn_started_at] && (Time.now.to_i - state[:turn_started_at]) > TURN_TIME + 2
      return { error: 'tempo esgotado' }
    end

    word = data['word'].to_s.strip.downcase.gsub(/\s+/, '')
    return { error: 'palavra muito curta' }   if word.length < MIN_LENGTH
    return { error: 'apenas letras' }         unless word.match?(/\A[a-záàâãéêíóôõúüçñ]+\z/i)
    return { error: 'palavra já usada' }      if state[:used_words].include?(word)

    first = normalize(word[0])
    last  = normalize(state[:last_letter])
    return { error: "palavra deve começar com '#{state[:last_letter].upcase}'" } unless first == last

    state[:used_words] << word
    state[:history] << { player: user_id, word: word }
    state[:current_word]    = word
    state[:last_letter]     = word[-1]
    state[:turn_started_at] = Time.now.to_i

    next_player(room)

    { broadcast: true, event: 'state',
      payload: public_payload(room),
      start_timer: TURN_TIME,
      timer_room_id: room[:id],
      timer_token: state[:timer_token],
      timer_data: { 'action' => 'turn_expired', 'room_id' => room[:id], 'player' => state[:current_player] } }
  end

  def self.handle_turn_expired(room, user_id)
    state   = room[:state]
    players = room[:players]
    return { error: 'not playing' } unless state[:phase] == 'playing'

    # Deduct life from current player
    current = state[:current_player]
    state[:lives][current] = (state[:lives][current] || 1) - 1
    state[:history] << { player: current, word: '⏱ tempo esgotado' }

    if state[:lives][current] <= 0
      # Remove from game
      players.delete(current)
      if players.length <= 1
        state[:phase]  = 'over'
        state[:winner] = players.first
        return { broadcast: true, event: 'state', payload: public_payload(room) }
      end
    end

    state[:turn_started_at] = Time.now.to_i
    next_player(room)

    { broadcast: true, event: 'state',
      payload: public_payload(room),
      start_timer: TURN_TIME,
      timer_room_id: room[:id],
      timer_token: state[:timer_token],
      timer_data: { 'action' => 'turn_expired', 'room_id' => room[:id], 'player' => state[:current_player] } }
  end

  def self.handle_restart_vote(room, user_id)
    state   = room[:state]
    players = room[:players]
    return { error: 'not a player' }  unless room[:players].include?(user_id)
    return { error: 'game ongoing' }  unless state[:phase] == 'over'

    state[:restart_votes] << user_id unless state[:restart_votes].include?(user_id)

    if state[:restart_votes].length >= players.length
      room[:state] = initial_state
      room[:state][:players] = players.dup
      players.each { |p| room[:state][:lives][p] = LIVES_START }
      start_game(room)
    end

    { broadcast: true, event: 'state', payload: public_payload(room) }
  end

  def self.next_player(room)
    state   = room[:state]
    players = room[:players]
    current_idx = players.index(state[:current_player]) || 0
    token = SecureRandom.hex(4)
    state[:timer_token]     = token
    state[:current_player]  = players[(current_idx + 1) % players.length]
  end

  def self.normalize(ch)
    ch.downcase
      .tr('áàâãä', 'a').tr('éèêë', 'e').tr('íìîï', 'i')
      .tr('óòôõö', 'o').tr('úùûü', 'u').tr('ç', 'c')
  end

  def self.public_payload(room)
    state = room[:state]
    {
      phase:          state[:phase],
      current_word:   state[:current_word],
      last_letter:    state[:last_letter]&.upcase,
      current_player: state[:current_player],
      lives:          state[:lives],
      history:        state[:history].last(10),
      winner:         state[:winner],
      players:        room[:players],
      restart_votes:  state[:restart_votes],
      ready:          room[:players].length >= 2,
      turn_time:      TURN_TIME
    }
  end
end
