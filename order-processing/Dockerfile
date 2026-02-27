FROM node:25-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY instrumentation.js app.js ./

CMD ["node", "--import", "./instrumentation.js", "app.js"]
