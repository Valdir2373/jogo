require 'sinatra'
require 'faye/websocket'
require 'json'
require 'securerandom'
require_relative 'lib/game_engine'

Faye::WebSocket.load_adapter('puma')

ENGINE = GameEngine.new

CONNECTIONS     = Hash.new { |h, k| h[k] = [] } # room_id  => [ws]
WS_USER         = {}                              # ws       => user_id
USER_ROOM       = {}                              # user_id  => room_id
CONN_MUTEX      = Mutex.new

VALID_USER_ID   = /\A[a-zA-Z0-9\-]{1,64}\z/

configure do
  set :public_folder, File.join(__dir__, 'public')
end

get '/health' do
  'ok'
end

get '/api/rooms' do
  user_id = request.params['user_id'].to_s
  halt 400, 'invalid user_id' unless user_id.match?(VALID_USER_ID)

  room_id = CONN_MUTEX.synchronize { USER_ROOM[user_id] }
  room    = room_id ? ENGINE.get_room(room_id) : nil

  content_type :json
  if room
    JSON.generate({
      rooms: [{
        room_id:   room_id,
        game_type: room[:type],
        ready:     room[:players].length == 2
      }]
    })
  else
    JSON.generate({ rooms: [] })
  end
end

get '/ws' do
  unless Faye::WebSocket.websocket?(request.env)
    halt 400, 'WebSocket only'
  end

  ws      = Faye::WebSocket.new(request.env)
  user_id = request.params['user_id'].to_s

  unless user_id.match?(VALID_USER_ID)
    ws.close(4001, 'invalid user_id')
    return ws.rack_response
  end

  current_room_id = nil

  ws.on :message do |event|
    begin
      raw = event.data
      if raw.bytesize > 4096
        ws.send(JSON.generate({ event: 'error', payload: { message: 'message too large' } }))
        next
      end

      data   = JSON.parse(raw)
      next unless data.is_a?(Hash)

      action  = data['action']&.to_s&.slice(0, 64)
      room_id = data['room_id']&.to_s&.slice(0, 16)
      data['action']  = action
      data['room_id'] = room_id

      unless action&.match?(/\A[a-z_]{1,64}\z/)
        ws.send(JSON.generate({ event: 'error', payload: { message: 'invalid action' } }))
        next
      end

      result = ENGINE.process_event(user_id, data)

      if result[:event] == 'room_created'
        current_room_id = result[:payload][:room_id]
        CONN_MUTEX.synchronize do
          CONNECTIONS[current_room_id] << ws
          WS_USER[ws]             = user_id
          USER_ROOM[user_id]      = current_room_id
        end
        ws.send(JSON.generate({ event: result[:event], payload: result[:payload] }))

      elsif result[:broadcast]
        if action == 'join' && room_id
          CONN_MUTEX.synchronize do
            unless CONNECTIONS[room_id].include?(ws)
              CONNECTIONS[room_id] << ws
              current_room_id       = room_id
              WS_USER[ws]           = user_id
              USER_ROOM[user_id]    = room_id
            end
          end
        end
        broadcast(room_id || current_room_id, result[:event], result[:payload])

      elsif result[:error]
        ws.send(JSON.generate({ event: 'error', payload: { message: result[:error] } }))

      else
        ws.send(JSON.generate({ event: result[:event], payload: result[:payload] }))
      end

    rescue JSON::ParserError
      ws.send(JSON.generate({ event: 'error', payload: { message: 'invalid json' } }))
    rescue => e
      STDERR.puts "WebSocket error: #{e.message}"
      ws.send(JSON.generate({ event: 'error', payload: { message: 'internal error' } }))
    end
  end

  ws.on :close do
    uid    = nil
    rid    = nil

    CONN_MUTEX.synchronize do
      uid = WS_USER.delete(ws)
      if uid
        rid = USER_ROOM.delete(uid)
        if rid
          CONNECTIONS[rid].delete(ws)
          CONNECTIONS.delete(rid) if CONNECTIONS[rid].empty?
        end
      end
    end

    # Notify remaining player that opponent left — room is over
    if rid
      ENGINE.close_room(rid)
      broadcast(rid, 'opponent_left', { message: 'O outro jogador saiu. A sala foi encerrada.' })
      CONN_MUTEX.synchronize { CONNECTIONS.delete(rid) }
    end
  end

  ws.rack_response
end

# Serve frontend SPA — must come after all API/WS routes
get '/*' do
  index = File.join(settings.public_folder, 'index.html')
  if File.exist?(index)
    send_file index
  else
    halt 404, 'Not found'
  end
end

def broadcast(room_id, event, payload)
  conns = CONN_MUTEX.synchronize { CONNECTIONS[room_id].dup }
  conns.each { |c| c.send(JSON.generate({ event: event, payload: payload })) }
end
