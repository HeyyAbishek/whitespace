# Whitespace - Real-Time Collaborative Design Engine

![Project Status](https://img.shields.io/badge/Status-Production%20Ready-success)
![Tech Stack](https://img.shields.io/badge/Stack-Next.js%20%7C%20TypeScript%20%7C%20Liveblocks-blue)

**Whitespace** is a high-performance, real-time collaborative whiteboard built to solve complex state synchronization challenges using **CRDTs** and a secure, multi-provider identity handshake.

<img src="https://github.com/user-attachments/assets/957d48d1-154b-477e-b81b-fca861eb2451" alt="Demo Screenshot" width="100%" />

## 🚀 Live Demo
[**View Live Deployment**](https://whitespace-lilac.vercel.app)

## 📚 Documentation
I have documented the engineering decisions and system design in detail:

* **[System Architecture](./docs/architecture.md)**: Breakdown of the Auth Handshake, WebSocket infrastructure, and Tech Stack.
* **[Technical Challenges](./docs/challenges.md)**: Deep dive into CRDTs, race conditions, and vector rendering performance.
* **[Local Setup Guide](./docs/setup.md)**: Instructions to run the project locally.

## ✨ Key Features
* **Multiplayer Collaboration:** Real-time cursor tracking and state syncing.
* **Vector Engine:** Resolution-independent shapes and paths.
* **Level 4 Identity:** Secure server-to-server validation using Clerk & Liveblocks.
* **Time Travel:** Robust Undo/Redo history.

---
*Built by [Abishek Jha](https://github.com/HeyyAbishek)*
