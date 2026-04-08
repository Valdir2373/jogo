require 'minitest/autorun'
require 'json'
require 'net/http'
require 'securerandom'
require 'websocket-client-simple'

# Integration tests against the running server on localhost:8080.

class TestWebSocketIntegration < Minitest::Test
  SERVER  = 'ws://localhost:8080/ws'
  TIMEOUT = 6

  # Unique per test run — prevents USER_ROOM state from a previous run
  # leaking into reconnect detection for the same logical user name.
  RUN_ID = SecureRandom.hex(4)
  def uid(name) = "#{RUN_ID}-#{name}"

  def ws_connect(user_id)
    messages = []
    ws = WebSocket::Client::Simple.connect("#{SERVER}?user_id=#{user_id}")
    ws.on(:message) { |m| messages << JSON.parse(m.data) rescue nil }
    ws.on(:error)   { |_| nil }
    sleep 0.3
    [ws, messages]
  end

  def wait_for(messages, count, timeout = TIMEOUT)
    deadline = Time.now + timeout
    sleep 0.05 while messages.length < count && Time.now < deadline
    raise "Timeout: expected #{count} messages, got #{messages.length}" if messages.length < count
  end

  def wait_event(messages, event_name, timeout = TIMEOUT)
    deadline = Time.now + timeout
    sleep 0.05 until messages.any? { |m| m['event'] == event_name } || Time.now > deadline
    messages.find { |m| m['event'] == event_name }
  end

  def setup_game(u1, u2)
    ws1, msgs1 = ws_connect(u1)
    ws1.send(JSON.generate({ action: 'create_room' }))
    wait_for(msgs1, 1)
    room_id = msgs1[0]['payload']['room_id']

    ws1.send(JSON.generate({ action: 'join', room_id: room_id }))
    wait_for(msgs1, 2)

    ws2, msgs2 = ws_connect(u2)
    ws2.send(JSON.generate({ action: 'join', room_id: room_id }))
    wait_for(msgs2, 1); wait_for(msgs1, 3)

    [ws1, msgs1, ws2, msgs2, room_id]
  end

  # p1: cells 0,1,2  p2: cells 3,4  → p1 wins top row
  # Sends one move at a time, waits for ws1 to receive the broadcast
  # before sending the next — avoids race conditions.
  def win_game(ws1, msgs1, ws2, room_id)
    [[ws1, 0], [ws2, 3], [ws1, 1], [ws2, 4], [ws1, 2]].each do |ws, idx|
      before = msgs1.length
      ws.send(JSON.generate({ action: 'move', room_id: room_id, index: idx }))
      wait_for(msgs1, before + 1)
    end
  end

  # ── create_room ─────────────────────────────────────────────────────────────

  def test_create_room
    ws, msgs = ws_connect(uid('create'))
    ws.send(JSON.generate({ action: 'create_room', game_type: 'tic_tac_toe' }))
    wait_for(msgs, 1)

    assert_equal 'room_created', msgs[0]['event']
    assert msgs[0]['payload']['room_id']
    ws.close
  end

  # ── join ────────────────────────────────────────────────────────────────────

  def test_two_players_both_see_ready
    ws1, msgs1, ws2, msgs2, _room = setup_game(uid('j1'), uid('j2'))

    # Assert before closing to avoid race with message delivery
    ready2 = msgs2.find { |m| m['event'] == 'state' && m['payload']['ready'] }
    ready1 = msgs1.find { |m| m['event'] == 'state' && m['payload']['ready'] }
    ws1.close; ws2.close

    refute_nil ready2, 'Player 2 must receive a ready state'
    refute_nil ready1, 'Player 1 must receive a ready state'
  end

  def test_join_invalid_room_returns_error
    ws, msgs = ws_connect(uid('jbad'))
    ws.send(JSON.generate({ action: 'join', room_id: 'BADROOM' }))
    wait_for(msgs, 1)
    ws.close

    assert_equal 'error', msgs[0]['event']
  end

  # ── move ────────────────────────────────────────────────────────────────────

  def test_move_broadcasts_to_both
    ws1, msgs1, ws2, msgs2, room_id = setup_game(uid('mv1'), uid('mv2'))
    b1 = msgs1.length; b2 = msgs2.length

    ws1.send(JSON.generate({ action: 'move', room_id: room_id, index: 4 }))
    wait_for(msgs1, b1 + 1); wait_for(msgs2, b2 + 1)
    ws1.close; ws2.close

    assert_equal 'X', msgs1.last['payload']['board'][4]
    assert_equal msgs1.last['payload']['board'], msgs2.last['payload']['board']
  end

  def test_out_of_turn_returns_error
    ws1, _m1, ws2, msgs2, room_id = setup_game(uid('oot1'), uid('oot2'))
    before = msgs2.length

    ws2.send(JSON.generate({ action: 'move', room_id: room_id, index: 0 }))
    wait_for(msgs2, before + 1)
    ws1.close; ws2.close

    assert_equal 'error', msgs2.last['event']
  end

  # ── restart_vote ─────────────────────────────────────────────────────────────

  def test_one_vote_does_not_reset_game
    u1 = uid('rv1a'); u2 = uid('rv2a')
    ws1, msgs1, ws2, msgs2, room_id = setup_game(u1, u2)
    win_game(ws1, msgs1, ws2, room_id)

    before = msgs1.length
    ws1.send(JSON.generate({ action: 'restart_vote', room_id: room_id }))
    wait_for(msgs1, before + 1)
    ws1.close; ws2.close

    state = msgs1.last['payload']
    refute_nil state['winner'], 'Winner must still be set after one vote'
    assert_equal [u1], state['restart_votes']
  end

  def test_both_votes_reset_game
    ws1, msgs1, ws2, msgs2, room_id = setup_game(uid('rv1b'), uid('rv2b'))
    win_game(ws1, msgs1, ws2, room_id)

    # p1 votes
    b1 = msgs1.length
    ws1.send(JSON.generate({ action: 'restart_vote', room_id: room_id }))
    wait_for(msgs1, b1 + 1)

    # p2 votes — both receive the reset state
    b1 = msgs1.length; b2 = msgs2.length
    ws2.send(JSON.generate({ action: 'restart_vote', room_id: room_id }))
    wait_for(msgs1, b1 + 1); wait_for(msgs2, b2 + 1)

    state = msgs1.last['payload']
    assert_equal Array.new(9, nil), state['board']
    assert_nil   state['winner']
    refute       state['draw']
    assert_equal [], state['restart_votes']
    ws1.close; ws2.close
  end

  def test_duplicate_vote_ignored
    u1 = uid('rv1c'); u2 = uid('rv2c')
    ws1, msgs1, ws2, msgs2, room_id = setup_game(u1, u2)
    win_game(ws1, msgs1, ws2, room_id)

    ws1.send(JSON.generate({ action: 'restart_vote', room_id: room_id }))
    wait_for(msgs1, msgs1.length + 1)

    before = msgs1.length
    ws1.send(JSON.generate({ action: 'restart_vote', room_id: room_id })) # duplicate
    wait_for(msgs1, before + 1)
    ws1.close; ws2.close

    state = msgs1.last['payload']
    assert_equal [u1], state['restart_votes'], 'Duplicate vote must not be counted'
    refute_nil state['winner'], 'Game must not reset from duplicate vote'
  end

  # ── disconnect / reconnect ──────────────────────────────────────────────────

  def test_disconnect_notifies_remaining_player
    u2 = uid('dc2')
    ws1, msgs1, ws2, _msgs2, _room = setup_game(uid('dc1'), u2)

    ws2.close
    evt = wait_event(msgs1, 'player_disconnected')
    ws1.close

    refute_nil evt, 'Expected player_disconnected event'
    assert_equal u2, evt['payload']['user_id']
  end

  def test_room_persists_after_disconnect
    u1 = uid('rp1')
    ws1, msgs1, ws2, _msgs2, room_id = setup_game(u1, uid('rp2'))

    ws2.close
    wait_event(msgs1, 'player_disconnected')

    uri  = URI("http://localhost:8080/api/rooms?user_id=#{u1}")
    body = JSON.parse(Net::HTTP.get_response(uri).body)
    ws1.close

    assert body['rooms'].any? { |r| r['room_id'] == room_id },
           "Room must persist after opponent disconnects: #{body.inspect}"
  end

  def test_reconnect_notifies_remaining_player
    u2 = uid('rc2')
    ws1, msgs1, ws2, _msgs2, room_id = setup_game(uid('rc1'), u2)

    ws2.close
    wait_event(msgs1, 'player_disconnected')

    ws2b, _msgs2b = ws_connect(u2)
    ws2b.send(JSON.generate({ action: 'join', room_id: room_id }))

    evt = wait_event(msgs1, 'player_reconnected')
    ws1.close; ws2b.close

    refute_nil evt, 'Expected player_reconnected event'
    assert_equal u2, evt['payload']['user_id']
  end

  def test_room_persists_for_api_after_reconnect
    u2 = uid('ra2')
    ws1, msgs1, ws2, _msgs2, room_id = setup_game(uid('ra1'), u2)

    ws2.close
    wait_event(msgs1, 'player_disconnected')

    ws2b, _msgs2b = ws_connect(u2)
    ws2b.send(JSON.generate({ action: 'join', room_id: room_id }))
    wait_event(msgs1, 'player_reconnected')

    uri  = URI("http://localhost:8080/api/rooms?user_id=#{u2}")
    body = JSON.parse(Net::HTTP.get_response(uri).body)
    ws1.close; ws2b.close

    assert body['rooms'].any? { |r| r['room_id'] == room_id },
           "Room must be present in API after reconnect: #{body.inspect}"
  end

  # ── api/rooms ───────────────────────────────────────────────────────────────

  def test_api_rooms_reflects_active_room
    u1 = uid('api1')
    ws1, msgs1, ws2, _msgs2, room_id = setup_game(u1, uid('api2'))
    wait_for(msgs1, 3)

    uri  = URI("http://localhost:8080/api/rooms?user_id=#{u1}")
    body = JSON.parse(Net::HTTP.get_response(uri).body)

    assert body['rooms'].any? { |r| r['room_id'] == room_id }
  ensure
    ws2&.close rescue nil; ws1&.close rescue nil
  end

  # ── game_vote ─────────────────────────────────────────────────────────────

  def test_one_game_vote_broadcasts_pending
    ws1, msgs1, ws2, msgs2, room_id = setup_game(uid('gv1a'), uid('gv2a'))

    # Capture lengths BEFORE sending to avoid race with async delivery
    b1 = msgs1.length; b2 = msgs2.length
    ws1.send(JSON.generate({ action: 'game_vote', room_id: room_id, game_type: 'tic_tac_toe' }))
    wait_for(msgs1, b1 + 1); wait_for(msgs2, b2 + 1)
    ws1.close; ws2.close

    evt = msgs1.last
    assert_equal 'game_vote_pending', evt['event']
    refute_nil evt['payload']['game_votes']
  end

  def test_both_game_votes_trigger_game_changed
    ws1, msgs1, ws2, msgs2, room_id = setup_game(uid('gv1b'), uid('gv2b'))

    ws1.send(JSON.generate({ action: 'game_vote', room_id: room_id, game_type: 'tic_tac_toe' }))
    wait_for(msgs1, msgs1.length + 1)

    b1 = msgs1.length; b2 = msgs2.length
    ws2.send(JSON.generate({ action: 'game_vote', room_id: room_id, game_type: 'tic_tac_toe' }))
    wait_for(msgs1, b1 + 1); wait_for(msgs2, b2 + 1)
    ws1.close; ws2.close

    assert_equal 'game_changed', msgs1.last['event']
    assert_equal 'tic_tac_toe', msgs1.last['payload']['game_type']
    assert_equal [], msgs1.last['payload']['kicked']
  end

  def test_game_vote_unknown_game_returns_error
    ws1, msgs1, ws2, msgs2, room_id = setup_game(uid('gve1'), uid('gve2'))

    before = msgs1.length
    ws1.send(JSON.generate({ action: 'game_vote', room_id: room_id, game_type: 'chess' }))
    wait_for(msgs1, before + 1)
    ws1.close; ws2.close

    assert_equal 'error', msgs1.last['event']
  end

  def test_game_changed_resets_board
    ws1, msgs1, ws2, msgs2, room_id = setup_game(uid('gcr1'), uid('gcr2'))
    win_game(ws1, msgs1, ws2, room_id)  # finish a game first

    ws1.send(JSON.generate({ action: 'game_vote', room_id: room_id, game_type: 'tic_tac_toe' }))
    wait_for(msgs1, msgs1.length + 1)

    b1 = msgs1.length
    ws2.send(JSON.generate({ action: 'game_vote', room_id: room_id, game_type: 'tic_tac_toe' }))
    wait_for(msgs1, b1 + 1)
    ws1.close; ws2.close

    payload = msgs1.last['payload']
    assert_equal Array.new(9, nil), payload['state']['board']
    assert_nil payload['state']['winner']
  end
end
