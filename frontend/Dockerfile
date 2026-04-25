FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# --host exposes Vite outside the container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
