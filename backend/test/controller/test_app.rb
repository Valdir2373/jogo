require 'minitest/autorun'
require 'rack/test'
require_relative '../../app'

class TestAppController < Minitest::Test
  include Rack::Test::Methods

  def app
    Sinatra::Application
  end

  # --- /health ---

  def test_health_returns_ok
    get '/health'
    assert_equal 200, last_response.status
    assert_equal 'ok', last_response.body
  end

  # --- /api/rooms ---

  def test_rooms_invalid_user_id_returns_400
    get '/api/rooms?user_id='
    assert_equal 400, last_response.status
  end

  def test_rooms_valid_user_with_no_room_returns_empty
    get '/api/rooms?user_id=some-valid-user-id'
    assert_equal 200, last_response.status
    body = JSON.parse(last_response.body)
    assert_equal [], body['rooms']
  end

  def test_rooms_content_type_is_json
    get '/api/rooms?user_id=test-user-123'
    assert last_response.content_type.include?('application/json')
  end

  # --- static frontend ---

  def test_root_returns_index_html
    get '/'
    assert_equal 200, last_response.status
    assert last_response.body.include?('<div id="root">'),
           'Expected SPA index.html to be served'
  end

  def test_unknown_route_returns_index_html
    get '/some/deep/route'
    assert_equal 200, last_response.status
    assert last_response.body.include?('<div id="root">'),
           'Expected SPA fallback for unknown routes'
  end

  # --- /ws (non-websocket request) ---

  def test_ws_endpoint_rejects_plain_http
    get '/ws?user_id=test-user'
    assert_equal 400, last_response.status
  end
end
