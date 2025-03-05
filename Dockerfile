FROM node:18-alpine

# Tạo thư mục app và cấp quyền
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app

WORKDIR /home/node/app

# Chạy bằng quyền root để cài npm
USER root

COPY package*.json ./
RUN npm install

# Sau khi cài xong, chạy lại bằng user node để bảo mật hơn
USER node

COPY . .
EXPOSE 5000
CMD ["node", "index.js"]