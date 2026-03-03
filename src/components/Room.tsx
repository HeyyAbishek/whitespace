"use client";

import { ReactNode } from "react";
import { RoomProvider } from "@/liveblocks.config";
import { ClientSideSuspense } from "@liveblocks/react/suspense";
import { LiveList } from "@liveblocks/client";

export function Room({ children }: { children: ReactNode }) {
  return (
    <RoomProvider 
      id="whiteboard-rescue-mission-v1" 
      initialPresence={{ 
        cursor: null, 
        selection: [] 
      }}
      initialStorage={{
        elements: new LiveList([]),
        messages: new LiveList([])
      }}
    >
      <ClientSideSuspense fallback={
        <div className="flex items-center justify-center w-full h-screen bg-[#121212] text-white">
           Loading...
        </div>
      }>
        {() => children}
      </ClientSideSuspense>
    </RoomProvider>
  );
}
