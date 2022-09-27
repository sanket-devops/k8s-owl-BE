### STAGE 1: Build ###
FROM node:16.15.1-alpine

# Set workdir for working dir default path
WORKDIR /app

# Copy all project content to workdir
COPY . .

# Copy kubectl Binary to /usr/bin
COPY kubectl /usr/bin

# Install app dependencies
RUN cd /app && npm set progress=false && npm cache clear --force && npm install

# Exposing port
EXPOSE 8008

#CMD ["npm", "run", "start"]
ENTRYPOINT npm run start