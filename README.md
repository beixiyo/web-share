# WebRTC file share

Developing ...

## Demo

http://35.235.112.89:7001/fileTransfer

---

## Build and run

```bash
docker build \
--build-arg VITE_SERVER_URL_ARG=ws://YourHost:YourPort \
-t web-share . 


docker run -d \
  --name=web-share \
  -p 7001:3001 \
  -e PORT=3001 \
  --restart=always \
  web-share
```
