# syntax=docker/dockerfile:1
ARG NODE_VERSION=20.1.0
FROM --platform=linux/amd64 node:${NODE_VERSION}-alpine as base

WORKDIR /usr/src/app

COPY . .

RUN npm install
RUN npm run build

# ENV NODE_ENV production

USER node

CMD npm run start
