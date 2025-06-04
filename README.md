# WebRTC file share


```bash
docker build -t web-share:v1 . 


docker run -d \
  --name=web-share \
  -p 7001:3001 \
  -e PORT=3001 \
  -e VITE_SERVER_URL=http://35.235.112.89 \
  --restart=always \
  web-share:v1
```