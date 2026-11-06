# Site estatico FECAM.
FROM nginx:stable-alpine
COPY site/ /usr/share/nginx/html/
EXPOSE 80
