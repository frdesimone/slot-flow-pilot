# Usamos una imagen oficial de Node.js (inmune a Heroku)
FROM node:20-alpine

# Seteamos la carpeta de trabajo
WORKDIR /app

# Copiamos los archivos de dependencias
COPY package.json package-lock.json* ./

# Instalamos las librerías
RUN npm install

# Copiamos el resto del código
COPY . .

# Compilamos React/Vite
RUN npm run build
