# 🏗️ System Architecture

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Real-Time Engine:** Liveblocks (WebSocket Infrastructure)
- **Auth:** Clerk (Identity Provider)
- **State Management:** Liveblocks Storage (CRDTs)
- **Styling:** Tailwind CSS

## Authentication Flow (Level 4 Identity)

Whitespace implements a secure "Identity Handshake" to prevent unauthorized WebSocket connections:

1.  **Client Request:** User logs in via Clerk (Frontend).
2.  **Server Validation:** Next.js API Route (`/api/liveblocks-auth`) verifies the session using `CLERK_SECRET_KEY`.
3.  **Token Generation:** If valid, the server signs a custom JWT using `LIVEBLOCKS_SECRET_KEY` containing the user's real name and avatar.
4.  **WebSocket Connection:** The client receives this token and establishes a persistent connection to the Liveblocks Real-time edge network.

## Data Structure

The whiteboard state is not stored in a traditional SQL database but in a distributed **LiveStorage** structure:

- `LiveMap<LayerId, Layer>`: Stores all shape data (O(1) lookup).
- `LiveList<LayerId>`: Maintains the z-index order of layers.
