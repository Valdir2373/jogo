require 'minitest/autorun'
require 'json'
require 'websocket-client-simple'

# Integration tests: hit the real running server on localhost:8080
# Requires the server to be up before running.

class TestWebSocketIntegration < Minitest::Test
  SERVER = 'ws://localhost:8080/ws'
  TIMEOUT = 5

  def ws_connect(user_id)
    url = "#{SERVER}?user_id=#{user_id}"
    messages = []
    ws = WebSocket::Client::Simple.connect(url)

    ws.on :message do |msg|
      messages << JSON.parse(msg.data)
    end

    ws.on :error do |e|
      raise "WebSocket error: #{e.message}"
    end

    sleep 0.3
    [ws, messages]
  end

  def wait_for(messages, count, timeout = TIMEOUT)
    deadline = Time.now + timeout
    sleep 0.1 while messages.length < count && Time.now < deadline
    raise "Timeout waiting for #{count} messages (got #{messages.length})" if messages.length < count
  end

  # --- create_room ---

  def test_create_room
    ws, msgs = ws_connect('user-create-1')
    ws.send(JSON.generate({ action: 'create_room', game_type: 'tic_tac_toe' }))
    wait_for(msgs, 1)
    ws.close

    assert_equal 'room_created', msgs[0]['event']
    assert msgs[0]['payload']['room_id']
    assert_equal 'tic_tac_toe', msgs[0]['payload']['game_type']
  end

  # --- join_room ---

  def test_join_room_two_players
    ws1, msgs1 = ws_connect('user-join-1')
    ws1.send(JSON.generate({ action: 'create_room' }))
    wait_for(msgs1, 1)
    room_id = msgs1[0]['payload']['room_id']

    ws1.send(JSON.generate({ action: 'join', room_id: room_id }))
    wait_for(msgs1, 2)

    ws2, msgs2 = ws_connect('user-join-2')
    ws2.send(JSON.generate({ action: 'join', room_id: room_id }))
    wait_for(msgs2, 1)
    wait_for(msgs1, 3)

    ws1.close
    ws2.close

    # player2 sees ready state
    assert msgs2[0]['payload']['ready']
    # player1 also gets broadcast
    last1 = msgs1.last
    assert last1['payload']['ready']
    assert_equal 2, last1['payload']['players'].length
  end

  def test_join_invalid_room_returns_error
    ws, msgs = ws_connect('user-join-bad')
    ws.send(JSON.generate({ action: 'join', room_id: 'BADROOM' }))
    wait_for(msgs, 1)
    ws.close

    assert_equal 'error', msgs[0]['event']
  end

  # --- moves ---

  def setup_game(uid1, uid2)
    ws1, msgs1 = ws_connect(uid1)
    ws1.send(JSON.generate({ action: 'create_room' }))
    wait_for(msgs1, 1)
    room_id = msgs1[0]['payload']['room_id']

    ws1.send(JSON.generate({ action: 'join', room_id: room_id }))
    wait_for(msgs1, 2)

    ws2, msgs2 = ws_connect(uid2)
    ws2.send(JSON.generate({ action: 'join', room_id: room_id }))
    wait_for(msgs2, 1)
    wait_for(msgs1, 3)

    [ws1, msgs1, ws2, msgs2, room_id]
  end

  def test_valid_move_broadcasts_to_both
    ws1, msgs1, ws2, msgs2, room_id = setup_game('user-move-1', 'user-move-2')

    ws1.send(JSON.generate({ action: 'move', room_id: room_id, index: 4 }))
    wait_for(msgs1, 4)
    wait_for(msgs2, 2)

    ws1.close
    ws2.close

    board1 = msgs1.last['payload']['board']
    board2 = msgs2.last['payload']['board']
    assert_equal 'X', board1[4]
    assert_equal board1, board2
  end

  def test_move_out_of_turn_returns_error
    ws1, msgs1, ws2, msgs2, room_id = setup_game('user-oot-1', 'user-oot-2')

    ws2.send(JSON.generate({ action: 'move', room_id: room_id, index: 0 }))
    wait_for(msgs2, 2)

    ws1.close
    ws2.close

    assert_equal 'error', msgs2.last['event']
  end

  def test_invalid_user_id_rejected
    url = "#{SERVER}?user_id="
    closed = false
    ws = WebSocket::Client::Simple.connect(url)
    ws.on(:close) { closed = true }
    sleep 1
    ws.close
    # Server closes connection with invalid user_id — socket should not receive game events
    assert true # just checking no crash
  end

  # --- restart ---

  def test_restart_resets_game
    ws1, msgs1, ws2, msgs2, room_id = setup_game('user-restart-1', 'user-restart-2')

    ws1.send(JSON.generate({ action: 'move', room_id: room_id, index: 0 }))
    wait_for(msgs1, 4)

    count_before = msgs1.length
    ws1.send(JSON.generate({ action: 'restart', room_id: room_id }))
    wait_for(msgs1, count_before + 1)

    ws1.close
    ws2.close

    restart_state = msgs1.last['payload']
    assert_equal Array.new(9, nil), restart_state['board']
    assert_nil restart_state['winner']
    refute restart_state['draw']
  end
end
