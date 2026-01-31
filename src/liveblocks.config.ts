import { createClient, LiveList } from "@liveblocks/client"; // Added LiveList
import { createRoomContext } from "@liveblocks/react";

const client = createClient({
  publicApiKey: "pk_dev_atzRSv6JNUP3WPjvcQ2njFRZIRWMbX2SZ39cCt19iYZ_b0NC3h4ZqjKnwxswCKb8", // I will replace this manually
});

// Explicitly define elements as a LiveList
type Storage = {
  elements: LiveList<any>;
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
} = createRoomContext<Presence, Storage>(client);
