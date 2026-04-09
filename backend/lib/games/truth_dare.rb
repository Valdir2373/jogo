class TruthDare
  TRUTHS = [
    'Qual foi o pior presente que você já recebeu?',
    'Qual é o seu maior medo que você nunca contou para ninguém?',
    'O que você faria se tivesse um dia invisível?',
    'Qual música você canta no chuveiro mas nunca admitiria?',
    'Qual foi a mentira mais boba que você já contou?',
    'Você já teve um crush em alguém do círculo de amigos?',
    'Qual é o seu hábito mais estranho?',
    'O que você fez que nunca contou para os seus pais?',
    'Qual é a coisa mais estranha que você já comeu?',
    'Você já fingiiu estar doente para não ir a algum lugar?',
    'Qual o pior mico que você já passou em público?',
    'Se você pudesse mudar uma coisa no seu passado, o que seria?',
    'Qual é a sua maior insegurança?',
    'Você já riu de algo que não devia?',
    'Qual é a coisa mais ridícula que você já acreditou?',
  ].freeze

  DARES = [
    'Fale em voz alta o último texto que você recebeu.',
    'Imite um animal por 30 segundos.',
    'Escreva algo bonitinho para todos lerem.',
    'Conte uma piada (boa ou ruim).',
    'Diga 5 coisas que você admira em cada pessoa da sala.',
    'Cante os primeiros 30 segundos de uma música.',
    'Tente fazer uma careta engraçada e descreva ela.',
    'Fale com sotaque diferente por 2 minutos.',
    'Diga algo sincero e bonito para a pessoa à sua direita.',
    'Invente um discurso de 30 segundos sobre qualquer tema.',
    'Diga 3 coisas que você gosta em você mesmo.',
    'Fale como um robô por 1 minuto.',
    'Tente dizer "estatísticas de estrangeiros" três vezes rápido.',
    'Descreva seu prato favorito como se fosse um chef estrelado.',
    'Escreva uma mensagem emotiva para o grupo inteiro.',
  ].freeze

  def self.handle(room, user_id, data)
    case data['action']
    when 'join'           then handle_join(room, user_id)
    when 'choose'         then handle_choose(room, user_id, data)
    when 'vote_question'  then handle_vote(room, user_id, data)
    when 'confirm_done'   then handle_confirm(room, user_id)
    when 'skip'           then handle_skip(room, user_id)
    when 'restart_vote'   then handle_restart_vote(room, user_id)
    else { error: 'unknown action' }
    end
  end

  def self.initial_state
    {
      phase:          'choosing',   # choosing | voting | confirming | done
      current_player_index: 0,
      current_type:   nil,          # 'verdade' | 'desafio'
      options:        [],           # 3 question/dare options shown to others
      votes:          {},           # user_id => option_index
      chosen_option:  nil,
      players:        [],
      history:        [],
      restart_votes:  []
    }
  end

  private

  def self.handle_join(room, user_id)
    players = room[:players]
    players << user_id unless players.include?(user_id)
    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_choose(room, user_id, data)
    state   = room[:state]
    players = room[:players]
    return { error: 'not your turn' }   unless players[state[:current_player_index]] == user_id
    return { error: 'wrong phase' }     unless state[:phase] == 'choosing'

    type = data['type'].to_s
    return { error: "type must be 'verdade' or 'desafio'" } unless %w[verdade desafio].include?(type)

    pool = type == 'verdade' ? TRUTHS : DARES
    state[:current_type] = type
    state[:options]      = pool.sample(3)
    state[:votes]        = {}
    state[:chosen_option] = nil
    state[:phase]        = 'voting'

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_vote(room, user_id, data)
    state   = room[:state]
    players = room[:players]
    return { error: 'wrong phase' }         unless state[:phase] == 'voting'
    return { error: 'not a voter' }         if players[state[:current_player_index]] == user_id
    return { error: 'already voted' }       if state[:votes].key?(user_id)

    opt = data['option'].to_i
    return { error: 'invalid option' } unless (0...state[:options].length).include?(opt)

    state[:votes][user_id] = opt

    # All non-current players voted
    voters = players.reject { |p| p == players[state[:current_player_index]] }
    if voters.all? { |p| state[:votes].key?(p) }
      # Most voted option wins (ties: first)
      counts = Array.new(state[:options].length, 0)
      state[:votes].each_value { |v| counts[v] += 1 }
      state[:chosen_option] = counts.index(counts.max)
      state[:phase] = 'confirming'
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_confirm(room, user_id)
    state   = room[:state]
    players = room[:players]
    return { error: 'not your turn' }  unless players[state[:current_player_index]] == user_id
    return { error: 'wrong phase' }    unless state[:phase] == 'confirming'

    state[:history] << {
      player: user_id,
      type:   state[:current_type],
      text:   state[:options][state[:chosen_option]]
    }

    advance(state, players)
    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_skip(room, user_id)
    state   = room[:state]
    players = room[:players]
    return { error: 'not your turn' }  unless players[state[:current_player_index]] == user_id

    state[:history] << { player: user_id, type: state[:current_type], text: '(pulou)' }
    advance(state, players)
    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_restart_vote(room, user_id)
    state   = room[:state]
    players = room[:players]
    return { error: 'not a player' } unless players.include?(user_id)

    state[:restart_votes] << user_id unless state[:restart_votes].include?(user_id)

    if state[:restart_votes].length >= players.length
      room[:state] = initial_state
      room[:state][:players] = players.dup
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.advance(state, players)
    state[:current_player_index] = (state[:current_player_index] + 1) % players.length
    state[:current_type] = nil
    state[:options]      = []
    state[:votes]        = {}
    state[:chosen_option] = nil
    state[:phase]        = 'choosing'
  end

  def self.public_payload(room, viewer_id)
    state   = room[:state]
    players = room[:players]
    current = players[state[:current_player_index]]

    {
      phase:          state[:phase],
      current_player: current,
      current_type:   state[:current_type],
      options:        state[:options],
      votes:          state[:votes],
      chosen_option:  state[:chosen_option],
      history:        state[:history].last(10),
      players:        players,
      restart_votes:  state[:restart_votes],
      ready:          players.length >= 3
    }
  end
end
