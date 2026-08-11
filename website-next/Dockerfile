FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Baked into the browser bundle at build time (Next.js NEXT_PUBLIC_* semantics).
# Sourced from ~/secrets/server.env on the deploy box (WEBSITE_NEXT_PUBLIC_* keys),
# not GitHub Secrets/Variables — see .github/workflows/deploy*.yml. Empty by
# default so VoiceWidget.tsx's own hardcoded fallback applies when no
# --build-arg is passed, instead of silently going blank.
ARG NEXT_PUBLIC_API_BASE=""
ARG NEXT_PUBLIC_ELLO_API_KEY=""
ARG NEXT_PUBLIC_ELLO_ASSISTANT_ID=""
ARG NEXT_PUBLIC_ELLO_API_BASE=""
ARG NEXT_PUBLIC_ELLO_WS_URL=""
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_ELLO_API_KEY=$NEXT_PUBLIC_ELLO_API_KEY
ENV NEXT_PUBLIC_ELLO_ASSISTANT_ID=$NEXT_PUBLIC_ELLO_ASSISTANT_ID
ENV NEXT_PUBLIC_ELLO_API_BASE=$NEXT_PUBLIC_ELLO_API_BASE
ENV NEXT_PUBLIC_ELLO_WS_URL=$NEXT_PUBLIC_ELLO_WS_URL

RUN npm run build
EXPOSE 4002
CMD ["npm", "start"]
