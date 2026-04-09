class TimeBomb
  LIVES_START  = 3
  FUSE_MIN     = 8   # minimum fuse seconds
  FUSE_MAX     = 25  # maximum fuse seconds
  PASS_MIN     = 1.0
  PASS_MAX     = 3.0

  def self.handle(room, user_id, data)
    case data['action']
    when 'join'          then handle_join(room, user_id)
    when 'bomb_exploded' then handle_exploded(room)
    when 'restart_vote'  then handle_restart_vote(room, user_id)
    else { error: 'unknown action' }
    end
  end

  def self.initial_state
    {
      phase:          'waiting',  # waiting | playing | over
      holder_index:   0,
      lives:          {},
      round:          1,
      fuse_started:   nil,
      fuse_duration:  nil,
      pass_interval:  nil,
      exploded_at:    nil,
      winner:         nil,
      players:        [],
      restart_votes:  []
    }
  end

  private

  def self.handle_join(room, user_id)
    players = room[:players]
    players << user_id unless players.include?(user_id)
    state = room[:state]
    state[:lives][user_id] ||= LIVES_START

    if players.length >= 3 && state[:phase] == 'waiting'
      start_round(room)
    end

    { broadcast: true, event: 'state', payload: public_payload(room),
      start_timer: state[:pass_interval],
      timer_room_id: room[:id],
      timer_token: state[:timer_token],
      timer_data: { 'action' => 'pass_bomb', 'room_id' => room[:id] } }
  end

  def self.start_round(room)
    state   = room[:state]
    players = room[:players]
    state[:holder_index]   = rand(players.length)
    state[:fuse_duration]  = rand(FUSE_MIN..FUSE_MAX)
    state[:pass_interval]  = PASS_MIN + rand * (PASS_MAX - PASS_MIN)
    state[:fuse_started]   = Time.now.to_f
    state[:exploded_at]    = nil
    state[:phase]          = 'playing'
    token = SecureRandom.hex(4)
    state[:timer_token] = token
  end

  def self.handle_exploded(room)
    state   = room[:state]
    players = room[:players]
    return { error: 'not playing' } unless state[:phase] == 'playing'

    holder = players[state[:holder_index]]
    state[:lives][holder] = (state[:lives][holder] || 1) - 1
    state[:exploded_at] = state[:holder_index]

    if state[:lives][holder] <= 0
      players.delete(holder)
      if players.length <= 1
        state[:phase]  = 'over'
        state[:winner] = players.first
        return { broadcast: true, event: 'state', payload: public_payload(room) }
      end
      # Recalculate holder index after removal
      state[:holder_index] = state[:holder_index] % players.length
    end

    state[:round] += 1
    start_round(room)

    { broadcast: true, event: 'state', payload: public_payload(room),
      start_timer: state[:pass_interval],
      timer_room_id: room[:id],
      timer_token: state[:timer_token],
      timer_data: { 'action' => 'pass_bomb', 'room_id' => room[:id] } }
  end

  def self.handle_restart_vote(room, user_id)
    state   = room[:state]
    players = room[:players]
    return { error: 'not a player' }  unless room[:players].include?(user_id)
    return { error: 'game ongoing' }  unless state[:phase] == 'over'

    state[:restart_votes] << user_id unless state[:restart_votes].include?(user_id)

    if state[:restart_votes].length >= players.length
      lives = Hash[players.map { |p| [p, LIVES_START] }]
      room[:state] = initial_state
      room[:state][:lives]   = lives
      room[:state][:players] = players.dup
      start_round(room)
    end

    { broadcast: true, event: 'state', payload: public_payload(room),
      start_timer: state[:pass_interval],
      timer_room_id: room[:id],
      timer_token: state[:timer_token],
      timer_data: { 'action' => 'pass_bomb', 'room_id' => room[:id] } }
  end

  def self.public_payload(room)
    state   = room[:state]
    players = room[:players]
    now     = Time.now.to_f

    time_left = if state[:fuse_started] && state[:fuse_duration]
      remaining = state[:fuse_duration] - (now - state[:fuse_started])
      remaining.clamp(0, state[:fuse_duration]).round(1)
    end

    {
      phase:         state[:phase],
      holder:        players[state[:holder_index]],
      lives:         state[:lives],
      round:         state[:round],
      time_left:     time_left,
      fuse_duration: state[:fuse_duration],
      exploded_at:   state[:exploded_at] ? players[state[:exploded_at]] : nil,
      winner:        state[:winner],
      players:       players,
      restart_votes: state[:restart_votes],
      ready:         players.length >= 3
    }
  end
end
