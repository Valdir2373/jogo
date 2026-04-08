# CLAUDE.md — tic-tac-love

## Visão Geral

Plataforma multi-game em tempo real com temática romântica, feita para a Veronica. O primeiro jogo é Tic-Tac-Toe, mas a arquitetura suporta novos jogos sem refatorar o core. Comunicação via WebSocket com eventos JSON.

## Stack

- **Backend:** Ruby (Sinatra + Faye-WebSocket), servido via `config.ru`
- **Frontend:** React (TypeScript/TSX) com Vite
- **Infra:** Docker (compose local, Dockerfile unificado para Render)
- **Deploy:** Render (Web Service, environment Docker, HTTPS automático)

## Estrutura do Projeto

```
/tic-tac-love
├── docker-compose.yml
├── Dockerfile
├── backend/
│   ├── app.rb                  # Entry point do Sinatra
│   ├── config.ru
│   ├── Gemfile
│   └── lib/
│       ├── game_engine.rb      # Gerenciador de salas e roteamento de eventos
│       └── games/              # Um arquivo .rb por jogo
│           └── tic_tac_toe.rb
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx
        ├── components/         # UI reutilizável (botões, modais, inputs)
        └── games/              # Um componente .tsx por jogo
            └── TicTacToe.tsx
```

## Convenções de Código

### Backend (Ruby)

- Cada jogo novo vive em `backend/lib/games/` como uma classe própria (ex: `Cards` em `cards.rb`).
- `GameEngine` é o único ponto de roteamento; ele delega para o jogo correto via `room[:type]`.
- Salas são armazenadas in-memory (`Hash`). Não usamos banco de dados.
- Limpeza automática: uma `Thread` roda a cada 1h removendo salas inativas há 30+ minutos para evitar OOM.
- Estilo: snake_case para métodos e variáveis, PascalCase para classes.

### Frontend (React/TSX)

- Componentes funcionais com hooks — nada de classes.
- Um componente por jogo dentro de `src/games/`.
- Componentes de UI compartilhados ficam em `src/components/`.
- Identificação do usuário via cookie (`user_id`, UUID v4, expira em 365 dias).
- Clipboard: sempre usar `navigator.clipboard.writeText` com fallback `document.execCommand('copy')`.
- Estilo visual: gradiente rosa/vermelho (`from-pink-50 to-red-50`), fonte sans-serif, tom romântico.

### WebSocket

- Protocolo: JSON puro. Cada mensagem deve conter pelo menos `{ room_id, action, ... }`.
- O WebSocket é um túnel genérico — ele não conhece regras de jogo, apenas repassa eventos para `GameEngine`.

## Como Adicionar um Novo Jogo

1. **Backend:** criar `backend/lib/games/nome_do_jogo.rb` com uma classe que responda a `.handle(room, user_id, data)`.
2. **Backend:** registrar o novo tipo no `case` de `GameEngine#process_event`.
3. **Frontend:** criar `frontend/src/games/NomeDoJogo.tsx`.
4. **Frontend:** adicionar rota/botão em `App.tsx` para acessar o novo jogo.

## Segurança (Perfil Cybersecurity)

- Cookies com `secure: true` em produção (Render = HTTPS).
- `SESSION_SECRET` vem de variável de ambiente, nunca hardcoded.
- Sanitizar todo input recebido via WebSocket antes de processar.
- Validar `room_id` e `user_id` em cada evento — nunca confiar no client.
- Monitorar uso de memória; salas órfãs são o principal vetor de DoS acidental.

## Comandos

```bash
# Subir local com Docker
docker compose up --build

# Servidor roda na porta 8080
# http://localhost:8080
```

## Deploy (Render)

1. Push para o GitHub.
2. Criar Web Service na Render, conectar o repo.
3. Environment: Docker.
4. Definir variável `SESSION_SECRET` no painel da Render.
5. Render lê o Dockerfile, builda tudo e sobe.

## Notas

- Sem banco de dados — tudo em memória. Restart do servidor = estado perdido (aceitável para jogos casuais).
- Mensagens temáticas para a Veronica estão nos componentes de UI e podem ser editadas livremente.
- O projeto não requer Ruby ou Node.js instalados na máquina local; Docker resolve tudo.