import { createClient, LiveList } from "@liveblocks/client";
import { createRoomContext } from "@liveblocks/react";

const client = createClient({

  publicApiKey: "pk_dev_atzRSv6JNUP3WPjvcQ2njFRZIRWMbX2SZ39cCt19iYZ_b0NC3h4ZqjKnwxswCKb8",
});

type Storage = {
  elements: LiveList<any>;
  messages: LiveList<{ user: string; text: string; color: string }>;
};

type Presence = {
  cursor: { x: number; y: number } | null;
  selection: string[];
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
} = createRoomContext<Presence, Storage>(client);