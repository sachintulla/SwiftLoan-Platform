FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Baked into the browser bundle at build time (Next.js NEXT_PUBLIC_* semantics).
# Empty by default so SiteScripts.tsx's own hardcoded fallback applies when no
# --build-arg is passed, instead of silently going blank.
ARG NEXT_PUBLIC_API_BASE=""
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE

RUN npm run build
EXPOSE 4002
CMD ["npm", "start"]
