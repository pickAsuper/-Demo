# API 只安装服务端依赖，不把 Electron、浏览器或本地数据库二进制放进镜像。
FROM node:24-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
USER node
EXPOSE 3001
CMD ["node", "server/index.mjs"]
