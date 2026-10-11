# ProxiSpeak — Geospatial Proximity Audio Ecosystem

ProxiSpeak is a real-time virtual office application that allows users to interact in a shared workspace. It combines multiplayer positioning, geospatial proximity detection, and proximity-based voice communication to create a more immersive virtual collaboration experience.

## 🚀 Current Features

- **Real-Time Multiplayer:** Multiple users can join the same virtual office and see each other's avatars.
- **Live Position Synchronization:** User movement is synchronized between browser windows using Socket.IO.
- **Interactive Virtual Office:** Canvas-based workspace with desks, office boundaries, and a dedicated meeting room.
- **Collision Detection:** Prevents avatars from moving through desks and meeting-room walls while allowing entry through the doorway.
- **Proximity Detection:** Detects nearby users within a 100-pixel radius.
- **MongoDB Atlas Integration:** Stores and updates user position data in the `user_positions` collection.
- **Backend Health Check:** Provides an API endpoint to check server availability and database connectivity.
- **Voice Chat Development:** Microphone access, voice-readiness events, and WebRTC signaling handlers have been implemented. Peer-to-peer audio is currently being debugged.

## 🛠️ Technology Stack

| Component | Technologies |
|---|---|
| Frontend | React, Vite, JavaScript, HTML5 Canvas |
| Backend | Node.js, Express.js |
| Real-Time Communication | Socket.IO |
| Voice Communication | WebRTC, Web Audio API |
| Database | MongoDB Atlas |
| Development Tools | VS Code, npm, Git, GitHub |

## 🏗️ Architecture

1. The React frontend renders the virtual office and handles user movement.
2. Socket.IO synchronizes user positions and presence through the Node.js backend.
3. MongoDB Atlas stores user position data.
4. The backend calculates proximity and communicates nearby-user information.
5. WebRTC is used to establish peer-to-peer voice connections, with Socket.IO relaying signaling messages.

## ⚙️ Local Setup

### Prerequisites

- Node.js and npm
- MongoDB Atlas account and connection URI
- Git

### 1. Clone the repository

```bash
git clone https://github.com/Likhitha730/ProxiSpeak.git
cd ProxiSpeak
```

### 2. Configure the backend

```bash
cd server
npm install
```

Create a `.env` file inside the `server` directory:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
```

Replace the placeholder with your MongoDB Atlas connection URI. Do not commit your actual `.env` file or database credentials.

### 3. Start the backend

```bash
npm run dev
```

If your backend does not have a `dev` script, use the start command configured in `server/package.json`.

### 4. Start the frontend

Open a second terminal:

```bash
cd client
npm install
npm run dev
```

Open the local URL printed by Vite in your browser.

### 5. Verify the backend

Visit:

`http://localhost:5000/api/health`

The endpoint should report that the backend is running and indicate the database connection status.

## 🧪 Current Testing Status

- [x] Virtual office renders correctly.
- [x] Two users can connect to the office.
- [x] User positions synchronize in real time.
- [x] Desk collision detection works.
- [x] Meeting-room walls and doorway behavior work.
- [x] Proximity radius is displayed.
- [x] MongoDB Atlas integration has been implemented.
- [ ] Verify voice-readiness events reach the backend.
- [ ] Complete WebRTC offer/answer and ICE-candidate exchange.
- [ ] Verify microphone audio is received and played between users.
- [ ] Test voice communication across separate devices or networks.

## 🔮 Planned Improvements

- Complete and validate proximity-based voice chat.
- Improve voice connection status and error handling.
- Refine the virtual office interface.
- Add further collaboration features for remote teams.

## 👩‍💻 Project Status

**Active development.** The multiplayer office, real-time movement, collision detection, meeting room, and database integration are implemented. Peer-to-peer voice communication remains under development.

## 📄 License

Add a license if you intend to distribute or reuse the project publicly.
