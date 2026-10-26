# 🔗 Web Share

<p align="center">
  <a href="./README.EN.md">English</a>
  <a href="./README.md">中文</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/npm/l/@jl-org/cvs?color=blue" />
  <img alt="node.js" src="https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Vue.js-4FC08D?logo=vuedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white" />
</p>

<div style="display: flex; flex-wrap: wrap; gap: 1rem; justify-content: center; align-items: center;">
  <img src="./docAssets/theme.webp" width="300px" />
  <img src="./docAssets/save.webp" width="300px" />
  <img src="./docAssets/link.webp" width="300px" />
  <img src="./docAssets/drag.webp" width="300px" />
</div>

<br />

Enable **LAN** file transfer directly in browsers, no server collects information, making browsers great again!!

**Note (Mobile)**: When opening the system photo picker / file picker on mobile, the browser may suspend the page (pause JS execution/timers), which can stop heartbeats or temporarily drop the WebSocket connection and trigger refresh-like behaviors

## ✨ Core Feature Highlights

🚫 **No app installation required, runs purely in browser**
  - 🖱️ Drag-and-drop file transfer
  - 📋 Paste file transfer
  - 🖼️ File preview
  - 🔢 Room QRCode connection
  - 🔑 End-to-end encryption

#### ⚡ High-performance P2P transfer
- **💧 Streaming download**: Traditional frontend downloads require saving all chunks to memory, large transfers may crash. To ensure a proper download on mobile, use Chrome
- **⬇️ Unlimited file size transfer**: Uses Service Worker or File System Access API for background streaming download (requires browser support)
- **🔄 Flow control mechanism**: Intelligent buffer management prevents memory overflow and transfer blockage
- **🌐 Direct connection**: Browser-to-browser direct connection via WebRTC DataChannel

### 🔄 Smart Resume Transfer
> **Reliable solution for large file transfers**

- **🧠 Smart caching**: Generates unique hash IDs based on filename + file size for accurate resume
- **💾 Local persistence**: Uses IndexedDB to store transfer progress and data chunks, survives browser restarts
- **🔄 Auto-negotiation**: Sender/receiver automatically negotiate resume position via WebRTC
- **⚡ Instant resume**: Reconnects and continues from breakpoint, saving significant time
- **🛡️ Data integrity**: Multiple verification mechanisms ensure consistency

### 🎯 Convenient File Operations
> **Ultimate UX design**

- **🖱️ Drag-to-send**: Drag files directly into browser window
- **📋 Paste transfer**: Use `Ctrl + V` to paste files from clipboard
- **📁 Batch selection**: Transfer multiple files simultaneously
- **🔍 File preview**: Auto-generates previews before transfer
- **📊 Real-time progress**: Shows transfer speed and ETA

### 💬 Cross-device Text Sharing
> **Seamless text transfer**

- **📝 Instant transfer**: Supports plain/rich text, code snippets
- **🔄 Bidirectional sync**: Any device can send/receive
- **📋 One-click copy**: Easy clipboard integration
- **🎨 Format preservation**: Maintains original formatting
- **⚡ Millisecond transfer**: Near real-time sync

### 📱 QR Code Quick Connect
> **Best solution for mobile**

- **📲 Scan-to-connect**: Auto-generates HD QR codes
- **🔄 Dynamic updates**: QR codes contain real-time room status
- **📱 Mobile optimized**: Optimized QR size/recognition
- **🔒 Secure encoding**: Encrypted QR content
- **⏰ Smart expiration**: Auto-expires for security

### 🔢 Room Code Connection
> **Simple memorable connection**

- **🎲 Smart generation**: 6-digit room codes
- **🔄 Multi-connect**: Single code for multiple devices
- **📞 Voice-friendly**: Numbers easy to communicate

### 🚀 Other Technical Highlights

#### 🔐 End-to-end Encryption
- **🛡️ WebRTC native encryption**: DTLS/SRTP protocols
- **🚫 Zero server storage**: Files transfer directly
- **🔒 Session isolation**: Independent encryption per transfer

#### 🌍 Cross-platform Compatibility
- **💻 Desktop support**: Windows/macOS/Linux
- **📱 Mobile optimized**: iOS/Android browsers
- **🌐 Browser support**: Chrome/Firefox/Safari/Edge

#### 🎨 Modern UI
- **📱 Responsive design**: Adapts to all screen sizes
- **🌙 Dark mode**: Eye-friendly themes

---

## 📋 Table of Contents

- [📚 Usage Guide](#-usage-guide)
  - [Server environment variables](#server-environment-variables)
- [🎯 Project Overview](#-project-overview)
- [🏗️ Architecture](#️-architecture)
- [🔧 Technical Deep Dive](#-technical-deep-dive)
  - [WebRTC Connection Mechanism](#webrtc-connection-mechanism)
  - [Resume Transfer Mechanism](#resume-transfer-mechanism)
- [🛠️ Tech Stack](#️-tech-stack)
- [❓ FAQ](#-faq)

---

## 📚 Usage Guide

### Requirements

- **Node.js**: >= 22.0.0
- **pnpm**: >= 9.7.1
- **Modern browsers**: WebRTC supported (Chrome 60+, Firefox 55+, Safari 14+)

### Installation

#### Clone Project

```bash
git clone https://github.com/beixiyo/web-share
cd web-share
```

#### Go Single-binary Deployment

Download a platform-specific Go deployment package with the frontend embedded in the executable from [GitHub Releases](https://github.com/beixiyo/web-share/releases). See the [release and deployment guide (Chinese)](./docs/releasing.md) for build automation and HTTPS configuration.

The Go backend embeds the frontend into one executable, so the target server needs no Docker, Node.js, or Go installation. See the [Go backend build and run guide (Chinese)](./packages/server-go/README.md#构建和运行) for build, development, and cross-compilation instructions.

#### Docker Deployment

1. modify `docker-compose.yml` file's `VITE_SERVER_URL` environment variable to your WebSocket server address
2. (optional) to tune timeouts or invite policy, set server env vars in `docker-compose.yml`; see [Server environment variables](#server-environment-variables)
3. start docker containers
  ```bash
  docker compose down && docker compose up -d
  ```

#### Local Development

```bash
# Install pnpm globally
npm i -g pnpm@9.7.1

# Install dependencies
pnpm i

# Start dev (run twice first time to build common package)
pnpm run dev

# Start services individually
pnpm run dev:server  # Signaling server
pnpm run dev:client  # Frontend client
pnpm run dev:common  # Build common types
```

#### Production Build

```bash
# Build all
pnpm run build

# Build individually
pnpm run build:common  # Build common package first
pnpm run build:server  # Server build
pnpm run build:client  # Client build
```

### Server environment variables

TS and Go use the same environment variable names and defaults. See the [shared configuration reference (Chinese)](./README.md#服务端环境变量) for ports, HTTPS certificates, heartbeat timeouts, reconnect grace periods, and invite settings. Go-specific configuration and validation are documented in the [Go backend guide (Chinese)](./packages/server-go/README.md#环境变量). Duration values are in milliseconds.

LAN discovery uses the server's IPv4 interface prefixes at startup, choosing the longest matching prefix. Set `LAN_CIDRS=192.168.4.0/23,10.0.0.0/24` to override discovery, especially with Docker bridge networking or a remote reverse proxy. Invalid or IPv6 CIDRs reject startup. Unmatched IPv4 addresses and IPv6 addresses remain isolated by full address; invitations and room codes still work across networks. Restart the backend after network or configuration changes.

Client addresses are read from `CF-Connecting-IP`, the first `X-Forwarded-For` entry, or the socket address, in that order, without extra configuration. Public IPv6 users are grouped by their complete address. Invalid or incomplete TLS configuration prevents startup rather than falling back to HTTP.

### Basic Usage

#### 🏠 Create Connection

**Join by room code (others)**
1. Click **Link Code Management** in the toolbar
2. Switch to the **Enter code** tab and type the 6-digit code
3. Click **Join room** to enter the same room

**Join by QR or link**
- Host clicks **QR Code** on the invite card for others to scan, or **Link** to copy and share; opening the link in a browser joins the same room

#### 📁 File Transfer

**Send Files**:
1. Select files (or `Ctrl + V` paste)
2. Preview files
3. Click "Send"
4. Wait for receiver confirmation

**Receive Files**:
1. Receive transfer request
2. Preview file info
3. Accept/decline
4. Auto-download on accept

#### ⚡ Resume Transfer

**Auto-resume**:
- Saves progress automatically
- Prompts to continue after reconnect
- Supports cache cleanup

**Manual Management**:
- Click "Clear Cache" in toolbar
- Select cleanup policy (all/expired/failed)
- View cache usage

---

## 🛠️ Tech Stack

### Frontend

#### 🎨 Core Frameworks
- **Vue 3.5.13**
- **TypeScript 5.7.2**
- **Vite**
- **Vue Router 4.4.5**

#### 🎯 UI/Styling
- **UnoCSS**
- **Tailwind CSS**
- **Lucide Vue Next**

#### 🔧 Utilities
- **@jl-org/tool**
- **LocalForage**
- **QRCode**

### Backend

#### 🌐 Server
- **Express 5.1.0**
- **WebSocket (ws 8.18.2)**
- **Connect History API Fallback**

#### 🔧 Utilities
- **UA Parser JS**
- **Unique Names Generator**

### Dev Tools

#### 📦 Package Management
- **pnpm**
- **Monorepo**

#### 🔍 Code Quality
- **ESLint**
- **@antfu/eslint-config**

---

## ❓ FAQ

### 🔧 Technical Issues

**Q: Download failed？**
A: It's hard to debug browsers on mobile phones, and using Chrome directly can avoid all problems

**Q: WebRTC connection fails?**
A: Try:
1. Disable browser extensions/use incognito
2. Check browser support
3. Check network/NAT settings

### 🚀 Deployment

**Q: Docker deployment issues?**
A: Verify:
1. WebSocket URL config
2. Port mapping
3. Firewall settings
4. HTTPS/WSS certificates

### 📱 Compatibility

**Q: File size limits?**
A: Theoretically unlimited with streaming

### 🔒 Security

**Q: Is transfer secure?**
A: Yes:
1. WebRTC end-to-end encryption
2. No server storage
3. Session isolation
4. Room code expiry

---

## 🎯 Project Overview

See [Core Feature Highlights](#-core-feature-highlights) for features and [Architecture](#️-architecture) for module responsibilities. The diagram below shows how browsers connect through the signaling server.

### Architecture

```
┌─────────────────┐    WebSocket     ┌─────────────────┐
│   Client A      │◄────────────────►│   Signal Server │
│                 │                  │                 │
│  ┌─────────────┐│                  │  ┌─────────────┐│
│  │ Vue3 + TS   ││                  │  │ Express +   ││
│  │ WebRTC      ││                  │  │ WebSocket   ││
│  │ LocalForage ││                  │  │ Server      ││
│  └─────────────┘│                  │  └─────────────┘│
└─────────────────┘                  └─────────────────┘
         │                                    ▲
         │                                    │
         │          WebRTC P2P                │
         │         DataChannel                │
         ▼                                    │
┌─────────────────┐    WebSocket     ┌───────┴─────────┐
│   Client B      │◄─────────────────┤                 │
│                 │                  │                 │
│  ┌─────────────┐│                  │                 │
│  │ Vue3 + TS   ││                  │                 │
│  │ WebRTC      ││                  │                 │
│  │ LocalForage ││                  │                 │
│  └─────────────┘│                  │                 │
└─────────────────┘                  └─────────────────┘
```

---

## 🏗️ Architecture

### Structure

```
web-share/
├── packages/
│   ├── client/          # Frontend
│   │   ├── src/
│   │   │   ├── ClientServer/     # WebRTC
│   │   │   ├── utils/           # Utilities
│   │   │   ├── views/           # Pages
│   │   │   └── components/      # Components
│   │   └── package.json
│   ├── server/          # Signaling
│   │   ├── src/
│   │   │   ├── WSServer.ts      # WebSocket
│   │   │   └── main.ts          # Entry
│   │   └── package.json
│   └── common/          # Shared
│       ├── src/
│       │   ├── generated/protocol.ts # Generated protocol types and runtime values
│       │   ├── RTCData.ts       # WebRTC
│       │   └── index.ts         # Public exports
│       └── package.json
└── package.json         # Root
```

### Core Modules

#### 📦 client - Frontend

**Responsibilities**:
- UI/UX
- WebRTC management
- File transfer logic
- Resume cache

**Components**:
- `RTCPeer`: WebRTC connection
- `FileSendManager`: Sender
- `FileDownloadManager`: Receiver
- `ResumeManager`: Resume logic

#### 🌐 server - Signaling

**Responsibilities**:
- WebRTC signaling
- Room management
- Connection state
- Heartbeat

**Features**:
- WebSocket management
- Room code generation
- Reconnect handling
- Message routing

#### 📋 common - Shared

**Responsibilities**:
- Type definitions
- Constants
- Generated Go message protocols; see the [protocol generation guide (Chinese)](./packages/server-go/README.md#协议与-common-包)

**Contents**:
- Action enums
- WebRTC types
- File transfer types
- Resume data

---

## 🔧 Technical Deep Dive

### WebRTC Connection Mechanism

#### 🔄 Connection Flow

**1. Initialization**
```typescript
class RTCConnect {
  private pc: RTCPeerConnection | null = null
  private config: any

  private initialize(): void {
    this.pc = new RTCPeerConnection({
      iceServers: this.config.iceServers,
    })

    this.pc.ondatachannel = this.onDataChannel
    this.pc.onicecandidate = this.onIceCandidate
    this.pc.onconnectionstatechange = this.onConnectionStateChange
  }

  private onDataChannel(event: RTCDataChannelEvent) {}
  private onIceCandidate(event: RTCPeerConnectionIceEvent) {}
  private onConnectionStateChange(event: Event) {}
}
```

**2. Signaling**

```mermaid
sequenceDiagram
    participant A as Client A
    participant S as Signal Server
    participant B as Client B

    A->>S: 1. Create Offer
    S->>B: 2. Forward Offer
    B->>S: 3. Create Answer
    S->>A: 4. Forward Answer
    A->>S: 5. Send ICE
    S->>B: 6. Forward ICE
    B->>S: 7. Send ICE
    S->>A: 8. Forward ICE
    A->>B: 9. P2P Established
```

**3. Key Steps**

**Step 1: Create Offer**
- Generates SDP Offer
- Sends via signaling server

**Step 2: Handle Answer**
- Processes remote SDP Answer
- Begins ICE exchange

**Step 3: ICE Exchange**
- Gathers network candidates
- Establishes optimal path

**Step 4: Data Channel**
- Opens transfer channel
- Begins file transfer

#### 🔧 Signaling Server Role

1. **SDP relay**: Forwards Offers/Answers
2. **ICE relay**: Shares connection candidates
3. **Room management**: Tracks connections
4. **Health monitoring**: Checks connection status

#### 📡 Data Channel

```typescript
const channelOptions = {
  ordered: true,
  maxRetransmits: 3,
}

if (this.channel.bufferedAmount > threshold) {
  await this.waitUntilChannelIdle()
}
```

**Flow Control**:
- Monitors `bufferedAmount`
- Implements backpressure
- Supports pause/resume

---

### Resume Transfer Mechanism

#### 🏗️ Architecture

Components:
1. **ResumeManager**: Cache
2. **FileSendManager**: Sender logic
3. **FileDownloadManager**: Receiver logic
4. **WebRTC**: Offset negotiation

#### 🔍 Code Flow Tags

Key positions marked with `@number. description` format

![流程图](./docAssets/code-flow.webp)

**How to view**:

1. **Use VSCode Todo Tree Enhanced**:
   - Configured in `.vscode/settings.json`
   - View in "TODO TREE Enhanced" panel
   - Click to navigate

2. **Manual search**:
   - Search for `@01.` `@02.` etc.

#### 🔄 Offset Negotiation

```mermaid
sequenceDiagram
    participant S as Sender
    participant R as Receiver

    S->>R: 1. FileMetas
    R->>R: 2. Check cache
    R->>S: 3. ResumeInfo (offset)
    S->>S: 4. Set FileChunker

    S->>R: 5. NewFile
    S->>R: 6. Data chunks
    R->>R: 7. Rebuild file
    S->>R: 8. FileDone
```

---

<div align="center">

**🌟 If you find this useful, give it a ⭐!**

---

**📧 Contact**

[![Email](https://img.shields.io/badge/Email-Contact-blue?style=flat-square&logo=gmail)](mailto:2662442385@qq.com)

</div>
