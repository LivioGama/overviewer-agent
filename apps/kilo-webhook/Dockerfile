FROM oven/bun:1 AS base
WORKDIR /app

RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash && \
    . ~/.nvm/nvm.sh && \
    nvm install 20 && \
    nvm use 20 && \
    npm install -g @kilocode/cli

COPY package.json ./
RUN bun install --production

RUN mkdir -p ~/.kilocode/cli
COPY kilo-config.json ~/.kilocode/cli/config.json

COPY index.js ./

EXPOSE 3001

ENV PATH="/root/.nvm/versions/node/v20.19.0/bin:${PATH}"

CMD ["bun", "start"]

