class Hangman
  MAX_WRONG  = 6
  VALID_WORD = /\A[A-Z]{1,20}\z/
  ALPHABET   = ('A'..'Z').to_a.freeze

  def self.handle(room, user_id, data)
    case data['action']
    when 'join'         then handle_join(room, user_id, data)
    when 'set_word'     then handle_set_word(room, user_id, data)
    when 'guess'        then handle_guess(room, user_id, data)
    when 'restart_vote' then handle_restart_vote(room, user_id)
    else { error: 'unknown action' }
    end
  end

  def self.initial_state
    {
      theme:           nil,
      display:         [],
      guessed_letters: [],
      wrong_letters:   [],
      phase:           'choosing',   # choosing | playing | won | lost
      winner:          nil,          # 'guessers' | 'word_owner'
      word_length:     0,
      word_revealed:   nil,          # set only when game ends
      restart_votes:   []
    }
  end

  private

  def self.handle_join(room, user_id, _data)
    players = room[:players]
    players << user_id unless players.include?(user_id)

    # First player is the word owner for the current round
    room[:word_owner_index] ||= 0

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_set_word(room, user_id, data)
    return { error: 'not your turn to set word' } unless word_owner(room) == user_id
    return { error: 'game not in choosing phase' } unless room[:state][:phase] == 'choosing'

    raw_word  = data['word'].to_s.strip.upcase.gsub(/\s+/, '')
    raw_theme = data['theme'].to_s.strip.slice(0, 30)

    return { error: 'invalid word — use A-Z only, 1-20 letters' } unless raw_word.match?(VALID_WORD)
    return { error: 'theme required' } if raw_theme.empty?

    room[:secret_word] = raw_word

    state = room[:state]
    state[:theme]           = raw_theme
    state[:word_length]     = raw_word.length
    state[:display]         = Array.new(raw_word.length, '_')
    state[:guessed_letters] = []
    state[:wrong_letters]   = []
    state[:phase]           = 'playing'
    state[:word_revealed]   = nil

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_guess(room, user_id, data)
    state   = room[:state]
    players = room[:players]

    return { error: 'game not in playing phase' }  unless state[:phase] == 'playing'
    return { error: 'word owner cannot guess' }     if word_owner(room) == user_id
    return { error: 'not a player' }                unless players.include?(user_id)

    letter = data['letter'].to_s.strip.upcase.slice(0, 1)
    return { error: 'invalid letter' } unless ALPHABET.include?(letter)
    return { error: 'already guessed' } if state[:guessed_letters].include?(letter)

    state[:guessed_letters] << letter
    word = room[:secret_word]

    if word.include?(letter)
      word.chars.each_with_index do |ch, i|
        state[:display][i] = ch if ch == letter
      end
    else
      state[:wrong_letters] << letter
    end

    if state[:display].none? { |c| c == '_' }
      state[:phase]         = 'won'
      state[:winner]        = 'guessers'
      state[:word_revealed] = word
    elsif state[:wrong_letters].length >= MAX_WRONG
      state[:phase]         = 'lost'
      state[:winner]        = 'word_owner'
      state[:word_revealed] = word
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_restart_vote(room, user_id)
    state   = room[:state]
    players = room[:players]

    return { error: 'not a player' }           unless players.include?(user_id)
    return { error: 'game still in progress' } unless %w[won lost].include?(state[:phase])

    state[:restart_votes] << user_id unless state[:restart_votes].include?(user_id)

    if state[:restart_votes].length >= players.length
      # Rotate word owner
      room[:word_owner_index] = (room[:word_owner_index] + 1) % players.length
      room[:state]            = initial_state
      room[:secret_word]      = nil
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.word_owner(room)
    idx = room[:word_owner_index] || 0
    room[:players][idx]
  end

  # Public payload — NEVER includes the secret word
  def self.public_payload(room, _viewer_id)
    state = room[:state]
    {
      theme:           state[:theme],
      display:         state[:display],
      guessed_letters: state[:guessed_letters],
      wrong_letters:   state[:wrong_letters],
      max_wrong:       MAX_WRONG,
      phase:           state[:phase],
      winner:          state[:winner],
      word_length:     state[:word_length],
      word_revealed:   state[:word_revealed],
      word_owner:      word_owner(room),
      players:         room[:players],
      restart_votes:   state[:restart_votes],
      ready:           room[:players].length >= 2
    }
  end
end
