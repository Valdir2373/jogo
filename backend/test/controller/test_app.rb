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
