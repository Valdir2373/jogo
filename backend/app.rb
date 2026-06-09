require 'sinatra'
require 'faye/websocket'
require 'json'
require 'securerandom'
require_relative 'lib/game_engine'

Faye::WebSocket.load_adapter('puma')

ENGINE       = GameEngine.new
CONNECTIONS  = Hash.new { |h, k| h[k] = [] } # room_id => [ws]
WS_USER      = {}                              # ws      => user_id
USER_WS      = {}                              # user_id => ws  (inverse of WS_USER)
USER_ROOM    = {}                              # user_id => room_id  (survives disconnect)
CONN_MUTEX   = Mutex.new
VALID_UID    = /\A[a-zA-Z0-9\-]{1,64}\z/

ENGINE.set_broadcaster do |room_id, event, payload|
  conns = CONN_MUTEX.synchronize { CONNECTIONS[room_id].dup }
  msg   = JSON.generate({ event: event, payload: payload })
  conns.each { |c| c.send(msg) rescue nil }
end

configure do
  set :public_folder, File.join(__dir__, 'public')
end

get '/health' do
  'ok'
end

get '/api/room/:id' do
  rid  = params[:id].to_s.upcase.slice(0, 16)
  room = ENGINE.get_room(rid)
  halt 404, JSON.generate({ error: 'room not found' }) unless room
  content_type :json
  info = GameEngine::GAMES[room[:type]]
  JSON.generate({ game_type: room[:type], game_name: info&.dig(:name) })
end

get '/api/rooms' do
  user_id = request.params['user_id'].to_s
  halt 400, 'invalid user_id' unless user_id.match?(VALID_UID)

  room_id = CONN_MUTEX.synchronize { USER_ROOM[user_id] }
  room    = room_id ? ENGINE.get_room(room_id) : nil

  content_type :json
  if room
    info = GameEngine::GAMES[room[:type]]
    JSON.generate({ rooms: [{ room_id: room_id, room_name: room[:name], game_type: room[:type], game_name: info&.dig(:name), ready: room[:players].length >= 2 }] })
  else
    # Room was cleaned up — remove stale reference
    CONN_MUTEX.synchronize { USER_ROOM.delete(user_id) } if room_id
    JSON.generate({ rooms: [] })
  end
end

get '/ws' do
  halt 400, 'WebSocket only' unless Faye::WebSocket.websocket?(request.env)

  ws      = Faye::WebSocket.new(request.env)
  user_id = request.params['user_id'].to_s

  unless user_id.match?(VALID_UID)
    ws.close(4001, 'invalid user_id')
    return ws.rack_response
  end

  CONN_MUTEX.synchronize do
    WS_USER[ws]      = user_id
    USER_WS[user_id] = ws
  end

  current_room_id = nil

  ws.on :message do |event|
    begin
      raw = event.data
      if raw.bytesize > 4096
        ws.send(json_event('error', { message: 'message too large' }))
        next
      end

      data = JSON.parse(raw)
      next unless data.is_a?(Hash)

      action  = data['action']&.to_s&.slice(0, 64)
      room_id = data['room_id']&.to_s&.slice(0, 16)
      data['action']  = action
      data['room_id'] = room_id

      unless action&.match?(/\A[a-z_]{1,64}\z/)
        ws.send(json_event('error', { message: 'invalid action' }))
        next
      end

      result = ENGINE.process_event(user_id, data)

      if result[:event] == 'presence_announced'
        ws.send(json_event(result[:event], result[:payload]))
        pms = ENGINE.get_private_history(user_id)
        ws.send(json_event('private_history', { messages: pms }))
        broadcast_online_users
        next
      elsif result[:private_pm]
        msg_payload = result[:msg]
        send_to_user(user_id, 'private_message', msg_payload)
        send_to_user(result[:recipient_id], 'private_message', msg_payload)
        next
      elsif result[:event] == 'room_created'
        current_room_id = result[:payload][:room_id]
        CONN_MUTEX.synchronize do
          CONNECTIONS[current_room_id] << ws
          USER_ROOM[user_id]   = current_room_id
        end
        ws.send(json_event(result[:event], result[:payload]))

      elsif result[:game_changed]
        rid = room_id || current_room_id
        # Notify kicked players before broadcasting to remaining
        result[:kicked].each do |kicked_uid|
          kicked_ws = CONN_MUTEX.synchronize do
            kws = USER_WS[kicked_uid]
            if kws
              CONNECTIONS[rid].delete(kws)
              WS_USER.delete(kws)
              USER_WS.delete(kicked_uid)
              USER_ROOM.delete(kicked_uid)
            end
            kws
          end
          kicked_ws&.send(json_event('player_kicked', { game_type: result[:payload][:game_type] }))
        end
        broadcast(rid, result[:event], result[:payload])

      elsif result[:broadcast]
        if action == 'join' && room_id
          reconnecting = false
          CONN_MUTEX.synchronize do
            unless CONNECTIONS[room_id].include?(ws)
              room         = ENGINE.get_room(room_id)
              reconnecting = room && room[:players].include?(user_id)
              CONNECTIONS[room_id] << ws
              current_room_id    = room_id
              WS_USER[ws]        = user_id
              USER_WS[user_id]   = ws
              USER_ROOM[user_id] = room_id
            end
          end
          broadcast(room_id, 'player_reconnected', { user_id: user_id }) if reconnecting
          room = ENGINE.get_room(room_id)
          if room
            ws.send(json_event('chat_history', { messages: room[:chat_messages] || [] }))
          end
        end
        broadcast(room_id || current_room_id, result[:event], result[:payload])

      elsif result[:error]
        ws.send(json_event('error', { message: result[:error] }))

      else
        ws.send(json_event(result[:event], result[:payload]))
      end

    rescue JSON::ParserError
      ws.send(json_event('error', { message: 'invalid json' }))
    rescue => e
      STDERR.puts "WebSocket error: #{e.message}"
      ws.send(json_event('error', { message: 'internal error' }))
    end
  end

  ws.on :close do
    uid = nil
    rid = nil

    CONN_MUTEX.synchronize do
      uid = WS_USER.delete(ws)
      if uid
        USER_WS.delete(uid)
        ENGINE.remove_online_user(uid)
        rid = USER_ROOM[uid]       # keep USER_ROOM — room persists
        if rid
          CONNECTIONS[rid].delete(ws)
          CONNECTIONS.delete(rid) if CONNECTIONS[rid].empty?
        end
      end
    end

    # Room stays alive — just tell the other player the opponent is offline
    broadcast(rid, 'player_disconnected', { user_id: uid }) if rid && uid
    broadcast_online_users
  end

  ws.rack_response
end

# SPA fallback — after all API/WS routes
get '/*' do
  index = File.join(settings.public_folder, 'index.html')
  File.exist?(index) ? send_file(index) : halt(404, 'Not found')
end

def json_event(event, payload)
  JSON.generate({ event: event, payload: payload })
end

def broadcast(room_id, event, payload)
  conns = CONN_MUTEX.synchronize { CONNECTIONS[room_id].dup }
  msg   = json_event(event, payload)
  conns.each { |c| c.send(msg) }
end

def broadcast_online_users
  users = CONN_MUTEX.synchronize {
    connected_uids = USER_WS.keys
    ENGINE.online_users.select { |uid, _| connected_uids.include?(uid) }.map do |uid, name|
      { user_id: uid, name: name }
    end
  }
  msg = json_event('online_users', { users: users })
  CONN_MUTEX.synchronize { USER_WS.values.each { |c| c.send(msg) rescue nil } }
end

def send_to_user(user_id, event, payload)
  ws = CONN_MUTEX.synchronize { USER_WS[user_id] }
  if ws
    ws.send(json_event(event, payload)) rescue nil
  end
end
