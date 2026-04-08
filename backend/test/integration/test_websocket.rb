require 'minitest/autorun'
require 'json'
require 'websocket-client-simple'

# Integration tests: hit the real running server on localhost:8080
# Requires the server to be up before running.

class TestWebSocketIntegration < Minitest::Test
  SERVER  = 'ws://localhost:8080/ws'
  TIMEOUT = 5

  def ws_connect(user_id)
    url      = "#{SERVER}?user_id=#{user_id}"
    messages = []
    ws       = WebSocket::Client::Simple.connect(url)
    ws.on(:message) { |msg| messages << JSON.parse(msg.data) }
    ws.on(:error)   { |_e| nil } # suppress teardown noise
    sleep 0.3
    [ws, messages]
  end

  def wait_for(messages, count, timeout = TIMEOUT)
    deadline = Time.now + timeout
    sleep 0.05 while messages.length < count && Time.now < deadline
    raise "Timeout: expected #{count} messages, got #{messages.length}" if messages.length < count
  end

  # --- create_room ---

  def test_create_room
    ws, msgs = ws_connect('u-create-1')
    ws.send(JSON.generate({ action: 'create_room', game_type: 'tic_tac_toe' }))
    wait_for(msgs, 1)
    ws.close

    assert_equal 'room_created', msgs[0]['event']
    assert msgs[0]['payload']['room_id']
    assert_equal 'tic_tac_toe', msgs[0]['payload']['game_type']
  end

  # --- join ---

  def test_join_room_two_players_both_see_ready
    ws1, msgs1 = ws_connect('u-join-1')
    ws1.send(JSON.generate({ action: 'create_room' }))
    wait_for(msgs1, 1)
    room_id = msgs1[0]['payload']['room_id']

    ws1.send(JSON.generate({ action: 'join', room_id: room_id }))
    wait_for(msgs1, 2)

    ws2, msgs2 = ws_connect('u-join-2')
    ws2.send(JSON.generate({ action: 'join', room_id: room_id }))
    wait_for(msgs2, 1)
    wait_for(msgs1, 3)

    ws1.close; ws2.close

    assert msgs2[0]['payload']['ready']
    assert msgs1.last['payload']['ready']
    assert_equal 2, msgs1.last['payload']['players'].length
  end

  def test_join_invalid_room_returns_error
    ws, msgs = ws_connect('u-join-bad')
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
    wait_for(msgs2, 1); wait_for(msgs1, 3)

    [ws1, msgs1, ws2, msgs2, room_id]
  end

  def test_valid_move_broadcasts_board_to_both
    ws1, msgs1, ws2, msgs2, room_id = setup_game('u-mv-1', 'u-mv-2')

    ws1.send(JSON.generate({ action: 'move', room_id: room_id, index: 4 }))
    wait_for(msgs1, 4); wait_for(msgs2, 2)

    ws1.close; ws2.close

    assert_equal 'X', msgs1.last['payload']['board'][4]
    assert_equal msgs1.last['payload']['board'], msgs2.last['payload']['board']
  end

  def test_move_out_of_turn_returns_error
    ws1, _msgs1, ws2, msgs2, room_id = setup_game('u-oot-1', 'u-oot-2')

    ws2.send(JSON.generate({ action: 'move', room_id: room_id, index: 0 }))
    wait_for(msgs2, 2)

    ws1.close; ws2.close

    assert_equal 'error', msgs2.last['event']
  end

  # --- opponent_left ---

  def test_opponent_left_notifies_remaining_player
    ws1, msgs1, ws2, msgs2, _room_id = setup_game('u-disc-1', 'u-disc-2')

    ws2.close  # player 2 disconnects
    sleep 0.5  # give server time to process close

    # ws1 should receive opponent_left
    deadline = Time.now + TIMEOUT
    sleep 0.1 until msgs1.any? { |m| m['event'] == 'opponent_left' } || Time.now > deadline

    ws1.close

    assert msgs1.any? { |m| m['event'] == 'opponent_left' },
           "Expected opponent_left event, got: #{msgs1.map { |m| m['event'] }.inspect}"
  end

  # --- restart ---

  def test_restart_resets_board
    ws1, msgs1, ws2, _msgs2, room_id = setup_game('u-rs-1', 'u-rs-2')

    ws1.send(JSON.generate({ action: 'move', room_id: room_id, index: 0 }))
    wait_for(msgs1, 4)

    before = msgs1.length
    ws1.send(JSON.generate({ action: 'restart', room_id: room_id }))
    wait_for(msgs1, before + 1)

    ws1.close; ws2.close

    state = msgs1.last['payload']
    assert_equal Array.new(9, nil), state['board']
    assert_nil state['winner']
    refute state['draw']
  end

  # --- api/rooms ---

  def test_api_rooms_reflects_joined_room
    require 'net/http'
    ws1, msgs1, _ws2, _msgs2, room_id = setup_game('u-api-1', 'u-api-2')
    wait_for(msgs1, 3)

    uri  = URI("http://localhost:8080/api/rooms?user_id=u-api-1")
    resp = Net::HTTP.get_response(uri)
    body = JSON.parse(resp.body)

    assert_equal 200, resp.code.to_i
    assert body['rooms'].any? { |r| r['room_id'] == room_id },
           "Expected room #{room_id} in API response: #{body.inspect}"
  ensure
    _ws2&.close rescue nil
    ws1&.close  rescue nil
  end
end
