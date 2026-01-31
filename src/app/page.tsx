"use client";

import { RoomProvider } from "@/liveblocks.config";
import Canvas from "@/components/canvas/Canvas";
import { ClientSideSuspense } from "@liveblocks/react";
import { LiveList } from "@liveblocks/client"; // Import this

export default function Home() {
  return (
    <RoomProvider 
      id="my-room-final-v1" 
      initialPresence={{ cursor: null, selection: [] }} 
      initialStorage={{ elements: new LiveList([]) }} // Explicit initialization 
    >
      <ClientSideSuspense fallback={<div className="text-white flex items-center justify-center h-screen">Loading Board...</div>}>
        {() => <Canvas />}
      </ClientSideSuspense>
    </RoomProvider>
  );
}
