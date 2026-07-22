FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public

EXPOSE 5173

CMD ["npm", "run", "dev"]
