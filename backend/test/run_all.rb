require 'minitest/reporters'
Minitest::Reporters.use! Minitest::Reporters::SpecReporter.new

require_relative 'unit/test_tic_tac_toe'
require_relative 'unit/test_hangman'
require_relative 'unit/test_game_engine'
require_relative 'controller/test_app'
