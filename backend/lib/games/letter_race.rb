class LetterRace
  TIME_LIMIT = 60  # seconds (enforced client-side, server just accepts submissions)

  CATEGORIES = [
    'Frutas', 'Animais', 'Países', 'Cidades do Brasil', 'Marcas famosas',
    'Comidas', 'Profissões', 'Filmes', 'Músicas', 'Personagens de filme',
    'Esportes', 'Flores', 'Instrumentos', 'Sobrenomes famosos', 'Palavras que rimam com amor'
  ].freeze

  def self.handle(room, user_id, data)
    case data['action']
    when 'join'          then handle_join(room, user_id)
    when 'submit_words'  then handle_submit(room, user_id, data)
    when 'next_round'    then handle_next_round(room, user_id)
    when 'restart_vote'  then handle_restart_vote(room, user_id)
    else { error: 'unknown action' }
    end
  end

  def self.initial_state
    {
      phase:         'playing',   # playing | review | done
      letter:        nil,
      category:      nil,
      round:         1,
      scores:        {},
      submitted:     {},          # user_id => [words]
      round_results: nil,
      players:       [],
      restart_votes: []
    }
  end

  private

  def self.handle_join(room, user_id)
    players = room[:players]
    players << user_id unless players.include?(user_id)
    state = room[:state]
    state[:scores][user_id] ||= 0

    if state[:letter].nil? && players.length >= 2
      pick_round(state)
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_submit(room, user_id, data)
    state = room[:state]
    return { error: 'not in playing phase' }  unless state[:phase] == 'playing'
    return { error: 'not a player' }          unless room[:players].include?(user_id)
    return { error: 'already submitted' }     if state[:submitted].key?(user_id)

    raw_words = Array(data['words']).map { |w| w.to_s.strip.downcase }.reject(&:empty?).first(20)
    state[:submitted][user_id] = raw_words

    if room[:players].all? { |p| state[:submitted].key?(p) }
      review_round(state, room[:players])
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_next_round(room, user_id)
    state = room[:state]
    return { error: 'not in review phase' } unless state[:phase] == 'review'
    return { error: 'not a player' }        unless room[:players].include?(user_id)

    state[:round]        += 1
    state[:submitted]     = {}
    state[:round_results] = nil
    pick_round(state)
    state[:phase] = 'playing'

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_restart_vote(room, user_id)
    state   = room[:state]
    players = room[:players]
    return { error: 'not a player' } unless players.include?(user_id)

    state[:restart_votes] << user_id unless state[:restart_votes].include?(user_id)

    if state[:restart_votes].length >= players.length
      scores = state[:scores].dup
      room[:state] = initial_state
      room[:state][:scores]  = scores
      room[:state][:players] = players.dup
      players.each { |p| room[:state][:scores][p] ||= 0 }
      pick_round(room[:state])
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.pick_round(state)
    letter = ('A'..'Z').to_a.sample
    # Avoid vowel-only round starts if category is generic
    state[:letter]   = letter
    state[:category] = CATEGORIES.sample
    state[:phase]    = 'playing'
  end

  def self.review_round(state, players)
    state[:phase] = 'review'
    letter = state[:letter].downcase

    # Find words that only one player submitted (unique) and start with the letter
    all_words = state[:submitted].values.flatten
    duplicates = all_words.select { |w| all_words.count(w) > 1 }.uniq

    results = {}
    players.each do |p|
      words  = state[:submitted][p] || []
      valid  = words.select { |w| w.start_with?(letter) && !duplicates.include?(w) }
      half   = words.select { |w| w.start_with?(letter) && duplicates.include?(w) }
      pts    = valid.length + (half.length * 0.5).floor
      state[:scores][p] = (state[:scores][p] || 0) + pts
      results[p] = { words: words, valid: valid, duplicates: half, points: pts }
    end
    state[:round_results] = results
  end

  def self.public_payload(room, viewer_id)
    state = room[:state]
    {
      phase:         state[:phase],
      letter:        state[:letter],
      category:      state[:category],
      round:         state[:round],
      scores:        state[:scores],
      submitted_ids: state[:submitted].keys,
      round_results: state[:round_results],
      my_words:      state[:submitted][viewer_id],
      time_limit:    TIME_LIMIT,
      players:       room[:players],
      restart_votes: state[:restart_votes],
      ready:         room[:players].length >= 2
    }
  end
end
