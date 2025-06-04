# WebRTC file share

Developing ...

## Local development

```bash
npm i -g pnpm@9.7.1

pnpm i

# Note: if you are first run this command, you need to run it again. because the first time it will build common.
pnpm run dev
```

---


## Build and run

```bash
docker build \
# add your Web Socket server URL here
--build-arg VITE_SERVER_URL_ARG=ws://YourHost:YourPort \
-t web-share . 


docker run -d \
  --name=web-share \
  -p 7001:3001 \
  -e PORT=3001 \
  --restart=always \
  web-share
```
