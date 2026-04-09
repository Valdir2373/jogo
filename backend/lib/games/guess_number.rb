class GuessNumber
  MIN = 1
  MAX = 100

  def self.handle(room, user_id, data)
    case data['action']
    when 'join'          then handle_join(room, user_id)
    when 'set_number'    then handle_set_number(room, user_id, data)
    when 'guess'         then handle_guess(room, user_id, data)
    when 'restart_vote'  then handle_restart_vote(room, user_id)
    else { error: 'unknown action' }
    end
  end

  def self.initial_state
    {
      phase:         'choosing',  # choosing | playing | won
      hint:          nil,         # 'maior' | 'menor' | nil
      chooser:       nil,
      winner:        nil,
      players:       [],
      scores:        {},
      guesses:       [],          # { player:, number: }
      word_length:   0,
      restart_votes: []
    }
  end

  private

  def self.handle_join(room, user_id)
    players = room[:players]
    players << user_id unless players.include?(user_id)
    room[:state][:chooser] ||= players[0]
    room[:state][:scores][user_id] ||= 0
    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_set_number(room, user_id, data)
    state = room[:state]
    return { error: 'not your turn to choose' } unless state[:chooser] == user_id
    return { error: 'game not in choosing phase' } unless state[:phase] == 'choosing'

    n = data['number'].to_i
    return { error: "number must be #{MIN}-#{MAX}" } unless (MIN..MAX).include?(n)

    room[:secret_number] = n
    state[:phase]    = 'playing'
    state[:hint]     = nil
    state[:guesses]  = []
    state[:winner]   = nil

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_guess(room, user_id, data)
    state = room[:state]
    return { error: 'game not in playing phase' } unless state[:phase] == 'playing'
    return { error: 'the chooser cannot guess' }  if state[:chooser] == user_id

    n = data['number'].to_i
    return { error: "number must be #{MIN}-#{MAX}" } unless (MIN..MAX).include?(n)

    secret = room[:secret_number]
    state[:guesses] << { player: user_id, number: n }

    if n == secret
      state[:phase]  = 'won'
      state[:winner] = user_id
      state[:hint]   = 'correto'
      state[:scores][user_id] = (state[:scores][user_id] || 0) + 1
    elsif n < secret
      state[:hint] = 'maior'
    else
      state[:hint] = 'menor'
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_restart_vote(room, user_id)
    state   = room[:state]
    players = room[:players]
    return { error: 'not a player' }           unless players.include?(user_id)
    return { error: 'game still in progress' } unless %w[won].include?(state[:phase])

    state[:restart_votes] << user_id unless state[:restart_votes].include?(user_id)

    if state[:restart_votes].length >= players.length
      scores = state[:scores].dup
      idx    = players.index(state[:chooser]) || 0
      new_chooser = players[(idx + 1) % players.length]
      room[:state] = initial_state
      room[:state][:scores]  = scores
      room[:state][:chooser] = new_chooser
      room[:state][:players] = players.dup
      players.each { |p| room[:state][:scores][p] ||= 0 }
      room[:secret_number] = nil
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.public_payload(room, _viewer)
    state = room[:state]
    {
      phase:         state[:phase],
      hint:          state[:hint],
      chooser:       state[:chooser],
      winner:        state[:winner],
      players:       room[:players],
      scores:        state[:scores],
      guesses:       state[:guesses],
      restart_votes: state[:restart_votes],
      ready:         room[:players].length >= 2,
      range:         [MIN, MAX]
    }
  end
end
