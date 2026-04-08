require 'sinatra'
require 'faye/websocket'
require 'json'
require 'securerandom'
require_relative 'lib/game_engine'

Faye::WebSocket.load_adapter('puma')

ENGINE = GameEngine.new

# Track open WebSocket connections per room
CONNECTIONS = Hash.new { |h, k| h[k] = [] } # room_id => [ws, ...]
CONNECTIONS_MUTEX = Mutex.new

configure do
  set :session_secret, ENV.fetch('SESSION_SECRET', SecureRandom.hex(64))
  enable :sessions
  set :public_folder, File.join(__dir__, 'public')
end

get '/health' do
  'ok'
end

# Serve frontend SPA for any non-API, non-WebSocket route
get '/*' do
  index = File.join(settings.public_folder, 'index.html')
  if File.exist?(index)
    send_file index
  else
    [404, {}, ['Not found']]
  end
end

get '/ws' do
  if Faye::WebSocket.websocket?(request.env)
    ws = Faye::WebSocket.new(request.env)
    user_id = request.params['user_id']

    if user_id.nil? || user_id.empty? || user_id.length > 64
      ws.close(4001, 'invalid user_id')
      return ws.rack_response
    end

    # Sanitize user_id: only allow alphanumeric + hyphens (UUID format)
    unless user_id.match?(/\A[a-zA-Z0-9\-]{1,64}\z/)
      ws.close(4001, 'invalid user_id')
      return ws.rack_response
    end

    current_room_id = nil

    ws.on :message do |event|
      begin
        raw = event.data
        # Limit message size to prevent DoS
        if raw.bytesize > 4096
          ws.send(JSON.generate({ event: 'error', payload: { message: 'message too large' } }))
          next
        end

        data = JSON.parse(raw)
        next unless data.is_a?(Hash)

        # Sanitize and validate fields
        action = data['action']&.to_s&.slice(0, 64)
        room_id = data['room_id']&.to_s&.slice(0, 16)
        data['action'] = action
        data['room_id'] = room_id

        unless action&.match?(/\A[a-z_]{1,64}\z/)
          ws.send(JSON.generate({ event: 'error', payload: { message: 'invalid action' } }))
          next
        end

        result = ENGINE.process_event(user_id, data)

        if result[:event] == 'room_created'
          current_room_id = result[:payload][:room_id]
          CONNECTIONS_MUTEX.synchronize do
            CONNECTIONS[current_room_id] << ws
          end
          ws.send(JSON.generate({ event: result[:event], payload: result[:payload] }))

        elsif result[:broadcast]
          # Register connection to room on first join
          if action == 'join' && room_id
            CONNECTIONS_MUTEX.synchronize do
              unless CONNECTIONS[room_id].include?(ws)
                CONNECTIONS[room_id] << ws
                current_room_id = room_id
              end
            end
          end

          broadcast(room_id || current_room_id, result[:event], result[:payload], user_id)

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
      if current_room_id
        CONNECTIONS_MUTEX.synchronize do
          CONNECTIONS[current_room_id].delete(ws)
          CONNECTIONS.delete(current_room_id) if CONNECTIONS[current_room_id].empty?
        end
      end
    end

    ws.rack_response
  else
    [400, {}, ['WebSocket only']]
  end
end

def broadcast(room_id, event, payload, sender_id = nil)
  conns = CONNECTIONS_MUTEX.synchronize { CONNECTIONS[room_id].dup }
  room = ENGINE.get_room(room_id)
  players = room&.dig(:players) || []

  conns.each do |conn|
    # Per-connection personalization: send your_symbol based on player order
    personal_payload = payload.dup
    # We need to know which user owns this connection — we don't track that here directly,
    # so we broadcast the full payload and let the frontend figure out symbol from players array.
    conn.send(JSON.generate({ event: event, payload: personal_payload }))
  end
end
