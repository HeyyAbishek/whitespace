import { currentUser } from "@clerk/nextjs/server";
import { Liveblocks } from "@liveblocks/node";

const liveblocks = new Liveblocks({
  secret: process.env.LIVEBLOCKS_SECRET_KEY!,
});

export async function POST(request: Request) {
  // Get the current user from Clerk
  const user = await currentUser();

  if (!user) {
    return new Response("Unauthorized", { status: 403 });
  }

  // Identify the user and set their info for the session
  const session = liveblocks.prepareSession(
    user.id,
    {
      userInfo: {
        name: user.firstName || "Anonymous",
        picture: user.imageUrl,
        id: user.id,
      },
    }
  );

  // Allow access to the room
  // In a real app, you'd check permissions here.
  // For now, we allow full access to any room.
  session.allow("*", session.FULL_ACCESS);

  // Authorize the session and return the result
  const { status, body } = await session.authorize();
  return new Response(body, { status });
}
