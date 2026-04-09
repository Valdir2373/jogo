class Blackjack
  SUITS  = %w[♠ ♥ ♦ ♣].freeze
  VALUES = %w[A 2 3 4 5 6 7 8 9 10 J Q K].freeze

  def self.handle(room, user_id, data)
    case data['action']
    when 'join'         then handle_join(room, user_id)
    when 'hit'          then handle_hit(room, user_id)
    when 'stand'        then handle_stand(room, user_id)
    when 'new_hand'     then handle_new_hand(room, user_id)
    when 'restart_vote' then handle_restart_vote(room, user_id)
    else { error: 'unknown action' }
    end
  end

  def self.initial_state
    {
      phase:          'waiting',   # waiting | playing | dealer | over
      deck:           [],
      player_hands:   {},          # user_id => [cards]
      player_stands:  {},          # user_id => bool
      player_busted:  {},          # user_id => bool
      dealer_hand:    [],
      dealer_done:    false,
      scores:         {},
      current_turn:   nil,         # whose turn to hit/stand
      round_result:   nil,
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
      deal_new_hand(room)
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_hit(room, user_id)
    state = room[:state]
    return { error: 'not playing' }         unless state[:phase] == 'playing'
    return { error: 'not your turn' }       unless state[:current_turn] == user_id
    return { error: 'already standing' }    if state[:player_stands][user_id]

    card = draw(state[:deck])
    state[:player_hands][user_id] << card

    if hand_value(state[:player_hands][user_id]) > 21
      state[:player_busted][user_id] = true
      advance_turn(state, room[:players])
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_stand(room, user_id)
    state = room[:state]
    return { error: 'not playing' }   unless state[:phase] == 'playing'
    return { error: 'not your turn' } unless state[:current_turn] == user_id

    state[:player_stands][user_id] = true
    advance_turn(state, room[:players])

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_new_hand(room, user_id)
    state   = room[:state]
    players = room[:players]
    return { error: 'not a player' }     unless players.include?(user_id)
    return { error: 'hand in progress' } unless %w[over dealer].include?(state[:phase])

    state[:restart_votes] << user_id unless state[:restart_votes].include?(user_id)

    if state[:restart_votes].length >= players.length
      deal_new_hand(room)
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_restart_vote(room, user_id)
    handle_new_hand(room, user_id)
  end

  def self.deal_new_hand(room)
    state   = room[:state]
    players = room[:players]
    state[:deck]           = shuffled_deck
    state[:player_hands]   = {}
    state[:player_stands]  = {}
    state[:player_busted]  = {}
    state[:dealer_hand]    = []
    state[:dealer_done]    = false
    state[:round_result]   = nil
    state[:restart_votes]  = []

    players.each { |p| state[:player_hands][p] = [draw(state[:deck]), draw(state[:deck])] }
    state[:dealer_hand] = [draw(state[:deck]), draw(state[:deck])]
    state[:current_turn] = players[0]
    state[:phase] = 'playing'

    # Check for immediate naturals
    advance_if_done(state, players)
  end

  def self.advance_turn(state, players)
    # Move to next player who hasn't stood/busted
    remaining = players.reject { |p| state[:player_stands][p] || state[:player_busted][p] }
    if remaining.empty?
      # All done → dealer plays
      dealer_play(state)
      calculate_results(state, players)
    else
      idx = players.index(state[:current_turn]) || -1
      next_player = remaining.find { |p| players.index(p) > idx } || remaining.first
      state[:current_turn] = next_player
    end
  end

  def self.advance_if_done(state, players)
    # Check if everyone already busted or 21
    remaining = players.reject { |p| state[:player_stands][p] || state[:player_busted][p] }
    return if remaining.any?
    dealer_play(state)
    calculate_results(state, players)
  end

  def self.dealer_play(state)
    state[:phase] = 'dealer'
    while hand_value(state[:dealer_hand]) < 17
      state[:dealer_hand] << draw(state[:deck])
    end
    state[:dealer_done] = true
  end

  def self.calculate_results(state, players)
    dealer_val = hand_value(state[:dealer_hand])
    results    = {}
    players.each do |p|
      pval  = hand_value(state[:player_hands][p])
      busted = state[:player_busted][p]
      dbusted = dealer_val > 21

      outcome = if busted
        :bust
      elsif dbusted || pval > dealer_val
        :win
      elsif pval == dealer_val
        :push
      else
        :lose
      end

      state[:scores][p] = (state[:scores][p] || 0) + (outcome == :win ? 1 : 0)
      results[p] = { value: pval, outcome: outcome }
    end
    state[:round_result] = results
    state[:phase] = 'over'
  end

  def self.hand_value(hand)
    total = 0
    aces  = 0
    hand.each do |card|
      v = card[:value]
      if v == 'A'
        aces += 1
        total += 11
      elsif %w[J Q K].include?(v)
        total += 10
      else
        total += v.to_i
      end
    end
    aces.times { total -= 10 if total > 21 }
    total
  end

  def self.shuffled_deck
    deck = SUITS.flat_map { |s| VALUES.map { |v| { suit: s, value: v } } }
    deck.shuffle
  end

  def self.draw(deck)
    deck.pop || { suit: '?', value: '?' }
  end

  def self.public_payload(room, viewer_id)
    state = room[:state]
    {
      phase:         state[:phase],
      player_hands:  state[:player_hands],
      player_values: state[:player_hands].transform_values { |h| hand_value(h) },
      player_stands: state[:player_stands],
      player_busted: state[:player_busted],
      dealer_hand:   state[:phase] == 'playing' ?
        [state[:dealer_hand][0], { suit: '?', value: '?' }] :
        state[:dealer_hand],
      dealer_value:  state[:dealer_done] ? hand_value(state[:dealer_hand]) : nil,
      dealer_done:   state[:dealer_done],
      current_turn:  state[:current_turn],
      round_result:  state[:round_result],
      scores:        state[:scores],
      players:       room[:players],
      restart_votes: state[:restart_votes],
      ready:         room[:players].length >= 2
    }
  end
end
