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
  // This info will be available to other users in the session
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

  // Give the user access to the room
  // Since we don't have complex permissions yet, we allow full access
  // In a real app, you might check if the user is allowed in this specific room
  // const { room } = await request.json();
  // session.allow(room, session.FULL_ACCESS);
  
  // For now, allow access to any room they try to join (simple wildcard)
  session.allow("*", session.FULL_ACCESS);

  // Authorize the session and return the result
  const { status, body } = await session.authorize();
  return new Response(body, { status });
}
