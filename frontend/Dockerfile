FROM node:22-alpine AS build

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ARG NEXT_PUBLIC_BASEMAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
ARG NEXT_PUBLIC_BASEMAP_ATTRIBUTION=&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_BASEMAP_TILE_URL=${NEXT_PUBLIC_BASEMAP_TILE_URL}
ENV NEXT_PUBLIC_BASEMAP_ATTRIBUTION=${NEXT_PUBLIC_BASEMAP_ATTRIBUTION}

WORKDIR /app

COPY frontend/package.json /app/package.json
RUN npm install

COPY frontend /app
RUN npm run build

FROM nginx:1.27-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
