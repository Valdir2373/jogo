class Quiz
  QUESTIONS_PER_GAME = 10
  TIME_PER_Q         = 15   # seconds

  QUESTION_BANK = [
    { q: 'Qual é a capital do Brasil?',                         a: 'brasília',        opts: ['Rio de Janeiro', 'Brasília', 'São Paulo', 'Salvador'] },
    { q: 'Quantos estados tem o Brasil?',                       a: '26',              opts: ['24', '25', '26', '27'] },
    { q: 'Qual planeta é o maior do sistema solar?',            a: 'júpiter',         opts: ['Saturno', 'Júpiter', 'Urano', 'Netuno'] },
    { q: 'Quantos lados tem um hexágono?',                      a: '6',               opts: ['5', '6', '7', '8'] },
    { q: 'Em que ano o Brasil ganhou sua primeira Copa do Mundo?', a: '1958',         opts: ['1950', '1954', '1958', '1962'] },
    { q: 'Qual o animal mais rápido do mundo?',                 a: 'guepardo',        opts: ['Leão', 'Guepardo', 'Falcão-peregrino', 'Cavalo'] },
    { q: 'Quantos continentes existem?',                        a: '7',               opts: ['5', '6', '7', '8'] },
    { q: 'Qual o maior oceano?',                                a: 'pacífico',        opts: ['Atlântico', 'Pacífico', 'Índico', 'Ártico'] },
    { q: 'Qual é o idioma mais falado no mundo?',               a: 'inglês',          opts: ['Mandarim', 'Inglês', 'Espanhol', 'Hindi'] },
    { q: 'Quem pintou a Mona Lisa?',                            a: 'leonardo da vinci', opts: ['Michelangelo', 'Rafael', 'Leonardo da Vinci', 'Botticelli'] },
    { q: 'Qual o menor país do mundo?',                         a: 'vaticano',        opts: ['Mônaco', 'Vaticano', 'San Marino', 'Liechtenstein'] },
    { q: 'Quantas horas tem um dia?',                           a: '24',              opts: ['12', '20', '24', '48'] },
    { q: 'Em que continente fica o Egito?',                     a: 'áfrica',          opts: ['Ásia', 'Europa', 'África', 'Oriente Médio'] },
    { q: 'Qual instrumento tem 88 teclas?',                     a: 'piano',           opts: ['Órgão', 'Piano', 'Acordeão', 'Cravo'] },
    { q: 'Quantos jogadores tem um time de futebol?',           a: '11',              opts: ['9', '10', '11', '12'] },
    { q: 'O que H₂O representa?',                              a: 'água',            opts: ['Sal', 'Água', 'Açúcar', 'Álcool'] },
    { q: 'Qual a montanha mais alta do mundo?',                 a: 'everest',         opts: ['K2', 'Everest', 'Aconcágua', 'Kilimanjaro'] },
    { q: 'Em que país fica a Torre Eiffel?',                    a: 'frança',          opts: ['Itália', 'Espanha', 'França', 'Alemanha'] },
    { q: 'Quantos anéis tem a bandeira olímpica?',              a: '5',               opts: ['4', '5', '6', '7'] },
    { q: 'Qual é o elemento químico do símbolo Fe?',            a: 'ferro',           opts: ['Fluoreto', 'Ferro', 'Fósforo', 'Flúor'] },
    { q: 'Quantos metros tem 1 quilômetro?',                    a: '1000',            opts: ['100', '500', '1000', '10000'] },
    { q: 'Qual o rio mais longo do mundo?',                     a: 'nilo',            opts: ['Amazonas', 'Nilo', 'Yangtzé', 'Mississippi'] },
    { q: 'Em que ano o homem pisou na lua pela primeira vez?',  a: '1969',            opts: ['1965', '1967', '1969', '1972'] },
    { q: 'Qual desses é um mamífero?',                          a: 'baleia',          opts: ['Tubarão', 'Baleia', 'Atum', 'Polvo'] },
    { q: 'Qual o autor de Dom Casmurro?',                       a: 'machado de assis', opts: ['José de Alencar', 'Machado de Assis', 'Eça de Queirós', 'Graciliano Ramos'] },
    { q: 'Quantos graus tem um triângulo?',                     a: '180',             opts: ['90', '120', '180', '360'] },
    { q: 'Qual desses países não faz fronteira com o Brasil?',  a: 'chile',           opts: ['Peru', 'Chile', 'Bolívia', 'Venezuela'] },
    { q: 'O que significa o acrônimo DNA?',                     a: 'ácido desoxirribonucleico', opts: ['Ácido Desoxirribonucleico', 'Ácido Nucleico Dublado', 'Dados Numéricos Avançados', 'Desenvolvimento Neuronal Ativo'] },
    { q: 'Qual é o capital da Argentina?',                      a: 'buenos aires',    opts: ['Córdoba', 'Buenos Aires', 'Rosário', 'Mendoza'] },
    { q: 'Quantos lados tem um octógono?',                      a: '8',               opts: ['6', '7', '8', '9'] },
  ].freeze

  def self.handle(room, user_id, data)
    case data['action']
    when 'join'          then handle_join(room, user_id)
    when 'answer'        then handle_answer(room, user_id, data)
    when 'next_question' then handle_next_question(room, user_id)
    when 'restart_vote'  then handle_restart_vote(room, user_id)
    else { error: 'unknown action' }
    end
  end

  def self.initial_state
    {
      phase:          'waiting',   # waiting | question | scored | done
      questions:      [],          # selected question indices
      question_index: 0,
      answers:        {},          # user_id => option_index answered
      scores:         {},
      current_q:      nil,
      players:        [],
      restart_votes:  []
    }
  end

  private

  def self.handle_join(room, user_id)
    players = room[:players]
    players << user_id unless players.include?(user_id)
    state = room[:state]
    state[:scores][user_id] ||= 0

    if players.length >= 2 && state[:phase] == 'waiting'
      start_quiz(state)
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.start_quiz(state)
    state[:questions]      = QUESTION_BANK.sample(QUESTIONS_PER_GAME)
    state[:question_index] = 0
    state[:answers]        = {}
    state[:current_q]      = state[:questions][0]
    state[:phase]          = 'question'
  end

  def self.handle_answer(room, user_id, data)
    state = room[:state]
    return { error: 'no active question' }   unless state[:phase] == 'question'
    return { error: 'not a player' }         unless room[:players].include?(user_id)
    return { error: 'already answered' }     if state[:answers].key?(user_id)

    opt_idx = data['option'].to_i
    q = state[:current_q]
    return { error: 'invalid option' } unless (0...q[:opts].length).include?(opt_idx)

    state[:answers][user_id] = opt_idx

    chosen = q[:opts][opt_idx].downcase
    if chosen == q[:a]
      state[:scores][user_id] = (state[:scores][user_id] || 0) + 1
    end

    # All answered → move to scored
    if room[:players].all? { |p| state[:answers].key?(p) }
      state[:phase] = 'scored'
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_next_question(room, user_id)
    state = room[:state]
    return { error: 'not in scored phase' } unless state[:phase] == 'scored'
    return { error: 'not a player' }        unless room[:players].include?(user_id)

    state[:question_index] += 1

    if state[:question_index] >= state[:questions].length
      state[:phase] = 'done'
      state[:current_q] = nil
    else
      state[:current_q] = state[:questions][state[:question_index]]
      state[:answers]   = {}
      state[:phase]     = 'question'
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.handle_restart_vote(room, user_id)
    state   = room[:state]
    players = room[:players]
    return { error: 'not a player' }  unless players.include?(user_id)
    return { error: 'game ongoing' }  unless state[:phase] == 'done'

    state[:restart_votes] << user_id unless state[:restart_votes].include?(user_id)

    if state[:restart_votes].length >= players.length
      scores = state[:scores].dup
      room[:state] = initial_state
      room[:state][:scores]  = scores
      room[:state][:players] = players.dup
      players.each { |p| room[:state][:scores][p] ||= 0 }
      start_quiz(room[:state])
    end

    { broadcast: true, event: 'state', payload: public_payload(room, user_id) }
  end

  def self.public_payload(room, viewer_id)
    state = room[:state]
    q = state[:current_q]
    {
      phase:          state[:phase],
      question_index: state[:question_index],
      total_questions: state[:questions].length,
      question:       q ? { text: q[:q], opts: q[:opts] } : nil,
      correct_answer: state[:phase] == 'scored' || state[:phase] == 'done' ? q&.dig(:a) : nil,
      answers:        state[:phase] == 'scored' ? state[:answers] : { viewer_id => state[:answers][viewer_id] }.compact,
      my_answer:      state[:answers][viewer_id],
      scores:         state[:scores],
      players:        room[:players],
      restart_votes:  state[:restart_votes],
      ready:          room[:players].length >= 2,
      time_per_q:     TIME_PER_Q
    }
  end
end
