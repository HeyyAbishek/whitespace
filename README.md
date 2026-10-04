# Whitespace - Real-Time Collaborative Design Engine

![Project Status](https://img.shields.io/badge/Status-Production%20Ready-success)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![WebSockets](https://img.shields.io/badge/WebSockets-Liveblocks-7B61FF)
![CRDTs](https://img.shields.io/badge/CRDTs-Conflict--Free%20Sync-orange)
![HTML5 Canvas](https://img.shields.io/badge/HTML5%20Canvas%20API-E34F26?logo=html5&logoColor=white)
![Clerk](https://img.shields.io/badge/Clerk-Auth-6C47FF?logo=clerk&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-06B6D4?logo=tailwindcss&logoColor=white)

**Whitespace** is a high-performance, real-time collaborative whiteboard built to solve complex state synchronization challenges using **CRDTs** and a secure, multi-provider identity handshake. It leverages the **HTML5 Canvas API** to deliver smooth, low-latency drawing capabilities, while **Liveblocks** and **WebSockets** handle seamless multi-user presence, cursor tracking, and instant state replication. The platform is engineered on a robust **Next.js** and **TypeScript** architecture, styled with **Tailwind CSS**, and secured by **Clerk** for scalable user authentication and session management.

<img src="https://github.com/user-attachments/assets/957d48d1-154b-477e-b81b-fca861eb2451" alt="Demo Screenshot" width="100%" />

## 🚀 Live Demo


https://github.com/user-attachments/assets/e5879c3a-d312-4f7d-b6b7-fea0b60eab8e


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
