class StopGame
  TIME_LIMIT  = 30   # seconds (client-side)
  CATEGORIES  = ['Nome', 'Animal', 'Comida', 'Cidade', 'Objeto', 'Marca'].freeze

  def self.handle(room, user_id, data)
    case data['action']
    when 'join'          then handle_join(room, user_id)
    when 'stop'          then handle_stop(room, user_id, data)
    when 'next_round'    then handle_next_round(room, user_id)
    when 'restart_vote'  then handle_restart_vote(room, user_id)
    else { error: 'unknown action' }
    end
  end

  def self.initial_state
    {
      phase:         'playing',   # playing | review
      letter:        nil,
      round:         1,
      scores:        {},
      submitted:     {},          # user_id => { category => answer }
      stopper:       nil,         # who called stop
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
    state[:letter] ||= pick_letter if players.length >= 2
    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_stop(room, user_id, data)
    state = room[:state]
    return { error: 'not in playing phase' }  unless state[:phase] == 'playing'
    return { error: 'not a player' }          unless room[:players].include?(user_id)
    return { error: 'already submitted' }     if state[:submitted].key?(user_id)

    answers = {}
    CATEGORIES.each do |cat|
      val = data.dig('answers', cat).to_s.strip.slice(0, 40)
      answers[cat] = val
    end

    state[:submitted][user_id] = answers
    state[:stopper] ||= user_id

    # When stopper submits or all submitted → review
    if state[:submitted].key?(state[:stopper]) || room[:players].all? { |p| state[:submitted].key?(p) }
      # Give 5 extra seconds (client-side handles this — here we just move to review after all submit)
      if room[:players].all? { |p| state[:submitted].key?(p) }
        review_round(state, room[:players])
      end
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_next_round(room, user_id)
    state = room[:state]
    return { error: 'not in review phase' } unless state[:phase] == 'review'
    return { error: 'not a player' }        unless room[:players].include?(user_id)

    state[:round]        += 1
    state[:submitted]     = {}
    state[:stopper]       = nil
    state[:round_results] = nil
    state[:letter]        = pick_letter
    state[:phase]         = 'playing'
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
      room[:state][:letter] = pick_letter
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.review_round(state, players)
    state[:phase] = 'review'
    letter = state[:letter].downcase
    results = {}

    CATEGORIES.each do |cat|
      answers_for_cat = players.map { |p| [p, state[:submitted].dig(p, cat).to_s.downcase.strip] }
      valid_answers = answers_for_cat.reject { |_, a| a.empty? || !a.start_with?(letter) }
      answer_texts = valid_answers.map { |_, a| a }

      answers_for_cat.each do |p, ans|
        pts = if ans.empty? || !ans.start_with?(letter)
          0
        elsif answer_texts.count(ans) == 1
          10  # unique valid answer
        else
          5   # duplicate valid answer
        end
        results[p] ||= {}
        results[p][cat] = { answer: ans, points: pts }
        state[:scores][p] = (state[:scores][p] || 0) + pts
      end
    end

    state[:round_results] = results
  end

  def self.pick_letter
    # Common consonants + vowels, skip uncommon Portuguese letters
    ('A'..'Z').to_a.reject { |l| %w[K W Y].include?(l) }.sample
  end

  def self.public_payload(room, viewer_id)
    state = room[:state]
    {
      phase:         state[:phase],
      letter:        state[:letter],
      categories:    CATEGORIES,
      round:         state[:round],
      scores:        state[:scores],
      stopper:       state[:stopper],
      submitted_ids: state[:submitted].keys,
      round_results: state[:round_results],
      all_answers:   state[:phase] == 'review' ? state[:submitted] : nil,
      my_answers:    state[:submitted][viewer_id],
      time_limit:    TIME_LIMIT,
      players:       room[:players],
      restart_votes: state[:restart_votes],
      ready:         room[:players].length >= 2
    }
  end
end
