FROM golang:1.27.3-trixie

WORKDIR /app

RUN apt-get update && \
  apt-get install -y --no-install-recommends just make && \
  rm -rf /var/lib/apt/lists/*

RUN curl -L https://github.com/golang-migrate/migrate/releases/latest/download/migrate.linux-amd64.tar.gz \
  -o /tmp/migrate.tar.gz && \
  tar -xzf /tmp/migrate.tar.gz -C /tmp && \
  mv /tmp/migrate /usr/local/bin/migrate && \
  rm -rf /tmp/migrate*

COPY go.mod go.sum ./
RUN go mod download

COPY . .

EXPOSE 4000

CMD ["sh", "-c", "cp .envrc.docker .envrc && just db-migrations-up && just run"]
