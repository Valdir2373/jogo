class Rps
  CHOICES = %w[pedra papel tesoura lagarto spock].freeze

  # pedra > tesoura, lagarto
  # papel > pedra, spock
  # tesoura > papel, lagarto
  # lagarto > papel, spock
  # spock > pedra, tesoura
  BEATS = {
    'pedra'   => %w[tesoura lagarto],
    'papel'   => %w[pedra spock],
    'tesoura' => %w[papel lagarto],
    'lagarto' => %w[papel spock],
    'spock'   => %w[pedra tesoura]
  }.freeze

  def self.handle(room, user_id, data)
    case data['action']
    when 'join'         then handle_join(room, user_id)
    when 'pick'         then handle_pick(room, user_id, data)
    when 'restart_vote' then handle_restart_vote(room, user_id)
    else { error: 'unknown action' }
    end
  end

  def self.initial_state
    {
      phase:         'picking',   # picking | revealed
      picks:         {},          # user_id => choice (private until reveal)
      revealed:      {},          # user_id => choice (public after reveal)
      scores:        {},
      round:         1,
      results:       [],          # [{ winner: uid, draw: bool }]
      restart_votes: [],
      players:       []
    }
  end

  private

  def self.handle_join(room, user_id)
    players = room[:players]
    players << user_id unless players.include?(user_id)
    state = room[:state]
    state[:scores][user_id] ||= 0
    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_pick(room, user_id, data)
    state = room[:state]
    return { error: 'game not in picking phase' } unless state[:phase] == 'picking'
    return { error: 'not a player' } unless room[:players].include?(user_id)

    choice = data['choice'].to_s.downcase
    return { error: 'invalid choice' } unless CHOICES.include?(choice)

    state[:picks][user_id] = choice

    # All players picked → reveal
    if room[:players].all? { |p| state[:picks].key?(p) }
      state[:revealed] = state[:picks].dup
      state[:picks]    = {}
      state[:phase]    = 'revealed'

      # Calculate scores: each player vs every other
      players = room[:players]
      round_winners = []
      players.combination(2).each do |a, b|
        ca = state[:revealed][a]; cb = state[:revealed][b]
        if ca == cb
          # draw — no points
        elsif BEATS[ca]&.include?(cb)
          state[:scores][a] = (state[:scores][a] || 0) + 1
          round_winners << a
        else
          state[:scores][b] = (state[:scores][b] || 0) + 1
          round_winners << b
        end
      end
      state[:results] << {
        round:   state[:round],
        choices: state[:revealed].dup,
        winners: round_winners.uniq
      }
      state[:round] += 1
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_restart_vote(room, user_id)
    state   = room[:state]
    players = room[:players]
    return { error: 'not a player' } unless players.include?(user_id)
    return { error: 'round still in progress' } unless state[:phase] == 'revealed'

    state[:restart_votes] << user_id unless state[:restart_votes].include?(user_id)

    if state[:restart_votes].length >= players.length
      scores = state[:scores].dup
      rounds = state[:round]
      room[:state] = initial_state
      room[:state][:scores]  = scores
      room[:state][:round]   = rounds
      players.each { |p| room[:state][:scores][p] ||= 0 }
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.public_payload(room, viewer_id)
    state = room[:state]
    # Only show your own pending pick (not others') — revealed shows all
    my_pick = state[:picks][viewer_id]
    {
      phase:         state[:phase],
      my_pick:       my_pick,                          # only viewer's pending pick
      picks_pending: state[:picks].keys,               # who has already picked (no choice revealed)
      revealed:      state[:revealed],
      scores:        state[:scores],
      round:         state[:round],
      results:       state[:results].last(3),
      restart_votes: state[:restart_votes],
      players:       room[:players],
      ready:         room[:players].length >= 2,
      choices:       CHOICES
    }
  end
end
