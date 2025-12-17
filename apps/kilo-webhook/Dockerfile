FROM oven/bun:1 AS base
WORKDIR /app

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash
RUN npm install -g @kilocode/cli

COPY package.json ./
RUN bun install --production

RUN mkdir -p ~/.kilocode/cli
COPY kilo-config.json ~/.kilocode/cli/config.json

COPY index.js ./

EXPOSE 3001

CMD ["bun", "start"]

