require 'minitest/autorun'
require_relative '../../lib/games/hangman'

class TestHangman < Minitest::Test
  def make_room(players: [])
    {
      id: 'HMTEST', type: 'hangman',
      players: players.dup,
      state: Hangman.initial_state,
      word_owner_index: 0,
      last_activity: Time.now
    }
  end

  def setup_room_with_players
    room = make_room
    Hangman.handle(room, 'owner', { 'action' => 'join' })
    Hangman.handle(room, 'guesser', { 'action' => 'join' })
    room
  end

  def set_word(room, word: 'RUBY', theme: 'Linguagens')
    Hangman.handle(room, 'owner', { 'action' => 'set_word', 'word' => word, 'theme' => theme })
  end

  # ── initial_state ──────────────────────────────────────────────────────────

  def test_initial_state_phase_is_choosing
    assert_equal 'choosing', Hangman.initial_state[:phase]
  end

  def test_initial_state_empty_display
    assert_equal [], Hangman.initial_state[:display]
  end

  def test_initial_state_no_winner
    assert_nil Hangman.initial_state[:winner]
  end

  # ── join ──────────────────────────────────────────────────────────────────

  def test_join_adds_player
    room = make_room
    Hangman.handle(room, 'p1', { 'action' => 'join' })
    assert_includes room[:players], 'p1'
  end

  def test_join_does_not_duplicate
    room = make_room
    Hangman.handle(room, 'p1', { 'action' => 'join' })
    Hangman.handle(room, 'p1', { 'action' => 'join' })
    assert_equal 1, room[:players].count('p1')
  end

  def test_join_up_to_six_players
    room = make_room
    6.times { |i| Hangman.handle(room, "p#{i}", { 'action' => 'join' }) }
    assert_equal 6, room[:players].length
  end

  def test_join_seventh_player_rejected
    room = make_room
    6.times { |i| Hangman.handle(room, "p#{i}", { 'action' => 'join' }) }
    result = Hangman.handle(room, 'p6_extra', { 'action' => 'join' })
    assert result[:error]
  end

  def test_join_returns_state_event
    room = make_room
    result = Hangman.handle(room, 'p1', { 'action' => 'join' })
    assert_equal 'state', result[:event]
  end

  def test_join_existing_player_allowed_past_6
    room = make_room
    6.times { |i| Hangman.handle(room, "p#{i}", { 'action' => 'join' }) }
    result = Hangman.handle(room, 'p0', { 'action' => 'join' })
    assert_equal 'state', result[:event]
    refute result[:error]
  end

  # ── set_word ──────────────────────────────────────────────────────────────

  def test_set_word_sets_phase_to_playing
    room = setup_room_with_players
    set_word(room)
    assert_equal 'playing', room[:state][:phase]
  end

  def test_set_word_creates_display_blanks
    room = setup_room_with_players
    set_word(room, word: 'RUBY')
    assert_equal %w[_ _ _ _], room[:state][:display]
  end

  def test_set_word_stores_word_length
    room = setup_room_with_players
    set_word(room, word: 'HELLO')
    assert_equal 5, room[:state][:word_length]
  end

  def test_set_word_stores_theme
    room = setup_room_with_players
    set_word(room, word: 'CAT', theme: 'Animais')
    assert_equal 'Animais', room[:state][:theme]
  end

  def test_set_word_not_in_payload
    room = setup_room_with_players
    result = set_word(room)
    # payload must not contain the secret word
    refute result[:payload].key?(:secret_word)
    refute result[:payload].key?(:word)
  end

  def test_set_word_invalid_characters_rejected
    room = setup_room_with_players
    result = Hangman.handle(room, 'owner', { 'action' => 'set_word', 'word' => 'ABC1', 'theme' => 'T' })
    assert result[:error]
    assert_equal 'choosing', room[:state][:phase]
  end

  def test_set_word_too_long_rejected
    room = setup_room_with_players
    result = Hangman.handle(room, 'owner', { 'action' => 'set_word', 'word' => 'A' * 21, 'theme' => 'T' })
    assert result[:error]
  end

  def test_set_word_empty_rejected
    room = setup_room_with_players
    result = Hangman.handle(room, 'owner', { 'action' => 'set_word', 'word' => '', 'theme' => 'T' })
    assert result[:error]
  end

  def test_set_word_no_theme_rejected
    room = setup_room_with_players
    result = Hangman.handle(room, 'owner', { 'action' => 'set_word', 'word' => 'CAT', 'theme' => '' })
    assert result[:error]
  end

  def test_set_word_by_non_owner_rejected
    room = setup_room_with_players
    result = Hangman.handle(room, 'guesser', { 'action' => 'set_word', 'word' => 'CAT', 'theme' => 'T' })
    assert result[:error]
  end

  def test_set_word_lowercased_input_normalized
    room = setup_room_with_players
    result = Hangman.handle(room, 'owner', { 'action' => 'set_word', 'word' => 'ruby', 'theme' => 'T' })
    assert_equal 'playing', room[:state][:phase]
    refute result[:error]
  end

  def test_set_word_strips_spaces
    room = setup_room_with_players
    result = Hangman.handle(room, 'owner', { 'action' => 'set_word', 'word' => '  RUBY  ', 'theme' => 'T' })
    assert_equal 'playing', room[:state][:phase]
    refute result[:error]
  end

  # ── guess ─────────────────────────────────────────────────────────────────

  def test_guess_correct_letter_reveals_in_display
    room = setup_room_with_players
    set_word(room, word: 'RUBY')
    Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'R' })
    assert_equal 'R', room[:state][:display][0]
  end

  def test_guess_wrong_letter_added_to_wrong_letters
    room = setup_room_with_players
    set_word(room, word: 'RUBY')
    Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'Z' })
    assert_includes room[:state][:wrong_letters], 'Z'
  end

  def test_guess_correct_letter_not_in_wrong_letters
    room = setup_room_with_players
    set_word(room, word: 'RUBY')
    Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'R' })
    refute_includes room[:state][:wrong_letters], 'R'
  end

  def test_guess_letter_added_to_guessed_letters
    room = setup_room_with_players
    set_word(room, word: 'RUBY')
    Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'R' })
    assert_includes room[:state][:guessed_letters], 'R'
  end

  def test_guess_duplicate_rejected
    room = setup_room_with_players
    set_word(room, word: 'RUBY')
    Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'R' })
    result = Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'R' })
    assert result[:error]
  end

  def test_guess_by_word_owner_rejected
    room = setup_room_with_players
    set_word(room)
    result = Hangman.handle(room, 'owner', { 'action' => 'guess', 'letter' => 'A' })
    assert result[:error]
  end

  def test_guess_invalid_letter_rejected
    room = setup_room_with_players
    set_word(room)
    result = Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => '1' })
    assert result[:error]
  end

  def test_guess_in_choosing_phase_rejected
    room = setup_room_with_players
    result = Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'A' })
    assert result[:error]
  end

  def test_guess_win_when_all_revealed
    room = setup_room_with_players
    set_word(room, word: 'AB')
    Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'A' })
    Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'B' })
    assert_equal 'won', room[:state][:phase]
    assert_equal 'guessers', room[:state][:winner]
    assert_equal 'AB', room[:state][:word_revealed]
  end

  def test_guess_lose_after_max_wrong
    room = setup_room_with_players
    set_word(room, word: 'Z')
    %w[A B C D E F].each do |l|
      Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => l })
    end
    assert_equal 'lost', room[:state][:phase]
    assert_equal 'word_owner', room[:state][:winner]
    assert_equal 'Z', room[:state][:word_revealed]
  end

  def test_guess_reveals_all_occurrences
    room = setup_room_with_players
    set_word(room, word: 'ABBA')
    Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'B' })
    assert_equal %w[_ B B _], room[:state][:display]
  end

  # ── restart_vote ──────────────────────────────────────────────────────────

  def test_restart_vote_rejected_while_playing
    room = setup_room_with_players
    set_word(room)
    result = Hangman.handle(room, 'guesser', { 'action' => 'restart_vote' })
    assert result[:error]
  end

  def test_restart_vote_recorded_after_game_over
    room = setup_room_with_players
    set_word(room, word: 'AB')
    Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'A' })
    Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'B' })
    Hangman.handle(room, 'guesser', { 'action' => 'restart_vote' })
    assert_includes room[:state][:restart_votes], 'guesser'
  end

  def test_restart_vote_resets_when_all_voted
    room = setup_room_with_players
    set_word(room, word: 'AB')
    Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'A' })
    Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'B' })
    Hangman.handle(room, 'owner',   { 'action' => 'restart_vote' })
    Hangman.handle(room, 'guesser', { 'action' => 'restart_vote' })
    assert_equal 'choosing', room[:state][:phase]
    assert_nil room[:secret_word]
  end

  def test_restart_vote_rotates_word_owner
    room = setup_room_with_players
    set_word(room, word: 'AB')
    Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'A' })
    Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'B' })
    Hangman.handle(room, 'owner',   { 'action' => 'restart_vote' })
    Hangman.handle(room, 'guesser', { 'action' => 'restart_vote' })
    # word_owner_index should have rotated from 0 to 1
    assert_equal 1, room[:word_owner_index]
  end

  def test_restart_vote_duplicate_ignored
    room = setup_room_with_players
    set_word(room, word: 'AB')
    Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'A' })
    Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'B' })
    Hangman.handle(room, 'guesser', { 'action' => 'restart_vote' })
    Hangman.handle(room, 'guesser', { 'action' => 'restart_vote' })
    assert_equal 1, room[:state][:restart_votes].count('guesser')
    assert_equal 'won', room[:state][:phase]  # not reset yet
  end

  def test_restart_vote_by_non_player_rejected
    room = setup_room_with_players
    set_word(room, word: 'AB')
    Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'A' })
    Hangman.handle(room, 'guesser', { 'action' => 'guess', 'letter' => 'B' })
    result = Hangman.handle(room, 'stranger', { 'action' => 'restart_vote' })
    assert result[:error]
  end

  # ── public_payload security ───────────────────────────────────────────────

  def test_payload_never_includes_secret_word
    room = setup_room_with_players
    room[:secret_word] = 'SECRET'
    result = Hangman.handle(room, 'guesser', { 'action' => 'join' })
    payload = result[:payload]
    refute payload.key?(:secret_word)
    refute payload.values.include?('SECRET')
  end
end
