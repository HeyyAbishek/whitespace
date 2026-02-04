import { createClient, LiveList } from "@liveblocks/client";
import { createRoomContext } from "@liveblocks/react";

const client = createClient({
  authEndpoint: "/api/liveblocks-auth",
});

type Storage = {
  elements: LiveList<any>;
  messages: LiveList<{ user: string; text: string; color: string }>;
};

type Presence = {
  cursor: { x: number; y: number } | null;
  selection: string[];
};

type UserMeta = {
  id: string;
  info: {
    name: string;
    picture: string;
    id: string;
  };
};

export const {
  RoomProvider,
  useStorage,
  useMutation,
  useOthers,
  useSelf,
  useUndo,
  useRedo,
  useMyPresence,
  useHistory,
} = createRoomContext<Presence, Storage, UserMeta>(client);
