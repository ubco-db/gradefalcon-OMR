# syntax=docker/dockerfile:1.4

# if you're doing anything beyond your local machine, please pin this to a specific version at https://hub.docker.com/_/node/
FROM node:lts AS development

# set our node environment, either development or production
# defaults to production, compose overrides this to development on build and run
ARG NODE_ENV=production
ENV NODE_ENV $NODE_ENV

WORKDIR /code

# default to port 80 for node, and 9229 and 9230 (tests) for debug
ARG PORT=80
ENV PORT $PORT
EXPOSE $PORT 9229 9230

COPY package.json /code/package.json
COPY package-lock.json /code/package-lock.json
RUN npm ci

# # Install PostgreSQL client and TeX Live
RUN apt-get update && apt-get install -y \
  postgresql-client \
  texlive-latex-base \
  texlive-fonts-recommended \
  texlive-fonts-extra \
  texlive-latex-extra

# Use this instead to avoid long build times (or use prebuild images)
# Install PostgreSQL client and a minimal TeX Live installation
# RUN apt-get update && apt-get install -y \
# postgresql-client \
# texlive-latex-base \
# texlive-fonts-recommended


# check every 30s to ensure this service returns HTTP 200
HEALTHCHECK --interval=30s \
  CMD node src/healthcheck.js

# copy in our source code last, as it changes the most
COPY . /code

# Build TypeScript for production
RUN npm run build

# if you want to use npm start instead, then use `docker run --init in production`
# so that signals are passed properly. Note the code in index.js is needed to catch Docker signals
# using node here is still more graceful stopping then npm with --init afaik
# I still can't come up with a good production way to run with npm and graceful shutdown
CMD [ "node", "dist/index.js" ]

FROM development as dev-envs
RUN <<EOF
apt-get update
apt-get install -y --no-install-recommends git
EOF

FROM node:lts AS prod

WORKDIR /code

# Copy package files
COPY package.json package-lock.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=development /code/dist ./dist
COPY --from=development /code/src/healthcheck.js ./src/

# Install production system dependencies including LaTeX (same as development)
RUN apt-get update && apt-get install -y \
    postgresql-client \
    texlive-latex-base \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    texlive-latex-extra

# Health check
HEALTHCHECK --interval=30s CMD node src/healthcheck.js

# Set production environment
ENV NODE_ENV=production
ENV PORT=80
EXPOSE 80

# Create directories that need write permissions
RUN mkdir -p /code/uploads /code/dist/assets/custom

# Run as non-root user
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nodejs && \
    chown -R nodejs:nodejs /code/uploads /code/dist/assets
USER nodejs

CMD ["node", "dist/index.js"]
