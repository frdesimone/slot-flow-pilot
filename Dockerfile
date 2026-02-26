# Etapa 1: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Etapa 2: Runtime (Aquí es donde servimos los archivos)
FROM node:20-alpine
WORKDIR /app
# Instalamos serve de forma global
RUN npm install -g serve
# Copiamos solo los archivos compilados de la etapa anterior
COPY --from=build /app/dist ./dist

# EXPLICITAMENTE le decimos a serve que use el puerto 8080
# y que escuche en todas las interfaces (0.0.0.0)
EXPOSE 8080

# Comando para arrancar el servidor
CMD ["serve", "-s", "dist", "-l", "8080"]
