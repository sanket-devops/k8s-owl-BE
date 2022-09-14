### STAGE 1: Build ###
FROM node:16.15.1-alpine

WORKDIR /app

COPY . .

# Install app dependencies
RUN cd /app && npm set progress=false && npm cache clear --force && npm install

# Exposing port
EXPOSE 8002

#CMD ["npm", "run", "start"]
ENTRYPOINT npm run start

## docker file build ##

# docker build -t service-owl-be:latest .

# docker rm -f service-owl-be && docker run --name service-owl-be -p 8002:8002 --net=host service-owl-be:latest

