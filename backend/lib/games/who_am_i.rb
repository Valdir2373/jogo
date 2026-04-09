class WhoAmI
  MAX_QUESTIONS = 20

  def self.handle(room, user_id, data)
    case data['action']
    when 'join'           then handle_join(room, user_id)
    when 'assign_words'   then handle_assign(room, user_id, data)
    when 'ask_question'   then handle_ask(room, user_id, data)
    when 'answer'         then handle_answer(room, user_id, data)
    when 'guess_word'     then handle_guess(room, user_id, data)
    when 'restart_vote'   then handle_restart_vote(room, user_id)
    else { error: 'unknown action' }
    end
  end

  def self.initial_state
    {
      phase:          'assigning',   # assigning | playing | won
      words:          {},            # user_id => word (private — not in public payload for that user)
      questions:      [],            # { asker:, text:, answer: nil|'sim'|'não' }
      pending_q:      nil,
      guesser_index:  0,             # whose turn to ask questions
      solved:         {},            # user_id => true/false
      winner:         nil,
      assigner:       nil,
      players:        [],
      restart_votes:  []
    }
  end

  private

  def self.handle_join(room, user_id)
    players = room[:players]
    players << user_id unless players.include?(user_id)
    state = room[:state]
    state[:assigner] ||= user_id
    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_assign(room, user_id, data)
    state = room[:state]
    return { error: 'not the assigner' }      unless state[:assigner] == user_id
    return { error: 'wrong phase' }           unless state[:phase] == 'assigning'

    words_raw = data['words']
    return { error: 'words must be a hash' }  unless words_raw.is_a?(Hash)

    players = room[:players]
    # Assign words to all players (assigner may include themselves)
    players.each do |p|
      w = words_raw[p].to_s.strip.slice(0, 40)
      return { error: "missing word for #{p}" } if w.empty?
      state[:words][p] = w
    end

    state[:phase]          = 'playing'
    state[:guesser_index]  = 0
    state[:solved]         = Hash[players.map { |p| [p, false] }]

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_ask(room, user_id, data)
    state   = room[:state]
    players = room[:players]
    return { error: 'wrong phase' }    unless state[:phase] == 'playing'
    return { error: 'not your turn' }  unless players[state[:guesser_index]] == user_id
    return { error: 'question pending' } if state[:pending_q]
    return { error: 'max questions reached' } if state[:questions].length >= MAX_QUESTIONS

    text = data['question'].to_s.strip.slice(0, 120)
    return { error: 'question empty' } if text.empty?

    q = { asker: user_id, text: text, answer: nil }
    state[:questions] << q
    state[:pending_q] = state[:questions].length - 1

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_answer(room, user_id, data)
    state   = room[:state]
    return { error: 'wrong phase' }     unless state[:phase] == 'playing'
    return { error: 'not the assigner' } unless state[:assigner] == user_id
    return { error: 'no pending question' } unless state[:pending_q]

    ans = data['answer'].to_s.strip.downcase
    return { error: "answer must be 'sim' or 'não'" } unless %w[sim não nao].include?(ans)
    ans = 'não' if ans == 'nao'

    state[:questions][state[:pending_q]][:answer] = ans
    state[:pending_q] = nil

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_guess(room, user_id, data)
    state   = room[:state]
    players = room[:players]
    return { error: 'wrong phase' }    unless state[:phase] == 'playing'
    return { error: 'not your turn' }  unless players[state[:guesser_index]] == user_id

    guess = data['guess'].to_s.strip.downcase
    my_word = state[:words][user_id].to_s.downcase

    if guess == my_word
      state[:solved][user_id] = true
      # Check if all solved
      if state[:solved].values.all?
        state[:phase]  = 'won'
        state[:winner] = 'everyone'
      else
        advance_guesser(state, players)
      end
    else
      # Wrong guess — next player
      advance_guesser(state, players)
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_restart_vote(room, user_id)
    state   = room[:state]
    players = room[:players]
    return { error: 'not a player' }  unless players.include?(user_id)
    return { error: 'game ongoing' }  unless state[:phase] == 'won'

    state[:restart_votes] << user_id unless state[:restart_votes].include?(user_id)

    if state[:restart_votes].length >= players.length
      room[:state] = initial_state
      room[:state][:assigner] = players[0]
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.advance_guesser(state, players)
    unsolved = players.reject { |p| state[:solved][p] }
    return if unsolved.empty?
    current = players[state[:guesser_index]]
    next_unsolved = unsolved.select { |p| p != current }.first || unsolved.first
    state[:guesser_index] = players.index(next_unsolved) || 0
  end

  def self.public_payload(room, viewer_id)
    state   = room[:state]
    players = room[:players]

    # Words: show others' words but NOT viewer's own word (unless game is over)
    visible_words = if state[:phase] == 'won'
      state[:words]
    else
      state[:words].reject { |uid, _| uid == viewer_id }
    end

    {
      phase:          state[:phase],
      words:          visible_words,
      questions:      state[:questions],
      pending_q:      state[:pending_q],
      current_guesser: players[state[:guesser_index]],
      solved:         state[:solved],
      winner:         state[:winner],
      assigner:       state[:assigner],
      players:        players,
      restart_votes:  state[:restart_votes],
      ready:          players.length >= 3
    }
  end
end
