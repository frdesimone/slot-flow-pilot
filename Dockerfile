# Etapa 1: Build
FROM node:20-alpine AS build
WORKDIR /app

# --- ESTA ES LA MAGIA ---
# Declaramos que vamos a recibir estas variables durante el BUILD
ARG VITE_API_URL
ARG VITE_API_TOKEN

# Las convertimos en variables de entorno para que Vite las vea al compilar
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_API_TOKEN=$VITE_API_TOKEN

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Etapa 2: Runtime
FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["serve", "-s", "dist", "-l", "8080"]
