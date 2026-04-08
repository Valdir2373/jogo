# Stage 1: build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Ruby backend + serve frontend
FROM ruby:3.3-slim AS app
WORKDIR /app

# System deps for native gems
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY backend/Gemfile backend/Gemfile.lock* ./
RUN bundle install --jobs 4 --retry 3

COPY backend/ ./

# Copy built frontend into public/ so Sinatra can serve it
COPY --from=frontend-build /app/frontend/dist ./public

EXPOSE 8080

CMD ["bundle", "exec", "puma", "-C", "config/puma.rb", "config.ru"]
