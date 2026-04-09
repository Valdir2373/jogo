class Telepathy
  TARGET_SCORE = 10

  CATEGORIES = [
    'Frutas', 'Animais', 'Cores', 'Países', 'Filmes', 'Profissões',
    'Esportes', 'Marcas', 'Comidas', 'Músicas', 'Celebridades', 'Jogos',
    'Flores', 'Instrumentos musicais', 'Meios de transporte', 'Superpoderes'
  ].freeze

  def self.handle(room, user_id, data)
    case data['action']
    when 'join'         then handle_join(room, user_id)
    when 'submit'       then handle_submit(room, user_id, data)
    when 'next_round'   then handle_next_round(room, user_id)
    when 'restart_vote' then handle_restart_vote(room, user_id)
    else { error: 'unknown action' }
    end
  end

  def self.initial_state
    {
      phase:         'answering',   # answering | revealed | won
      category:      nil,
      round:         1,
      score:         0,
      submitted:     {},            # user_id => answer
      matches:       [],            # pairs of matching answers
      players:       [],
      winner:        nil,
      restart_votes: []
    }
  end

  private

  def self.handle_join(room, user_id)
    players = room[:players]
    players << user_id unless players.include?(user_id)
    state = room[:state]
    state[:category] ||= pick_category(state)
    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_submit(room, user_id, data)
    state = room[:state]
    return { error: 'not in answering phase' } unless state[:phase] == 'answering'
    return { error: 'not a player' }           unless room[:players].include?(user_id)
    return { error: 'already submitted' }      if state[:submitted].key?(user_id)

    answer = data['answer'].to_s.strip.downcase.slice(0, 40)
    return { error: 'answer cannot be empty' } if answer.empty?

    state[:submitted][user_id] = answer

    # All submitted → reveal
    if room[:players].all? { |p| state[:submitted].key?(p) }
      # Find matches (same answer, case-insensitive)
      answers = state[:submitted]
      matches = []
      room[:players].combination(2).each do |a, b|
        matches << [a, b] if answers[a] == answers[b]
      end
      state[:matches] = matches
      state[:score]  += matches.length
      state[:phase]   = 'revealed'

      if state[:score] >= TARGET_SCORE
        state[:phase]  = 'won'
        state[:winner] = 'team'
      end
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_next_round(room, user_id)
    state = room[:state]
    return { error: 'not revealed yet' } unless state[:phase] == 'revealed'
    return { error: 'not a player' }     unless room[:players].include?(user_id)

    state[:round]     += 1
    state[:submitted]  = {}
    state[:matches]    = []
    state[:category]   = pick_category(state)
    state[:phase]      = 'answering'

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
      room[:state][:category] = pick_category(room[:state])
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.pick_category(state)
    used = state[:used_categories] || []
    available = CATEGORIES - used
    available = CATEGORIES if available.empty?
    cat = available.sample
    (state[:used_categories] ||= []) << cat
    cat
  end

  def self.public_payload(room, viewer_id)
    state = room[:state]
    # Only show your own answer during answering phase
    my_answer = state[:phase] == 'answering' ? state[:submitted][viewer_id] : nil

    {
      phase:         state[:phase],
      category:      state[:category],
      round:         state[:round],
      score:         state[:score],
      target:        TARGET_SCORE,
      my_answer:     my_answer,
      submitted_ids: state[:submitted].keys,
      revealed:      state[:phase] != 'answering' ? state[:submitted] : nil,
      matches:       state[:matches],
      players:       room[:players],
      winner:        state[:winner],
      restart_votes: state[:restart_votes],
      ready:         room[:players].length >= 2
    }
  end
end
