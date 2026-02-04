"use client";

import { RoomProvider } from "@/liveblocks.config";
import Canvas from "@/components/canvas/Canvas";
import { ClientSideSuspense } from "@liveblocks/react";
import { LiveList } from "@liveblocks/client";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <>
      <SignedOut>
        <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-[#121212] text-center p-4">
          <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">Welcome to Whitespace</h1>
          <p className="text-xl mb-8 text-gray-600 dark:text-gray-300">
            A real-time collaborative whiteboard for your team.
          </p>
          <SignInButton mode="modal">
            <button className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">
              Sign In to Start Collaborating
            </button>
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        <RoomProvider 
          id="whiteboard-rescue-mission-v1"
          initialPresence={{ cursor: null, selection: [] }}
          initialStorage={{ 
            elements: new LiveList([]),
            messages: new LiveList([]) 
          }} 
        >
          <ClientSideSuspense fallback={<div className="text-white flex items-center justify-center h-screen bg-[#121212]">Loading Board...</div>}>
            {() => <Canvas />}
          </ClientSideSuspense>
        </RoomProvider>
      </SignedIn>
    </>
  );
}
