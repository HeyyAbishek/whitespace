import { currentUser } from "@clerk/nextjs/server";
import { Liveblocks } from "@liveblocks/node";

const liveblocks = new Liveblocks({
  secret: process.env.LIVEBLOCKS_SECRET_KEY!,
});

export async function POST(request: Request) {
  // Get the current user from Clerk
  const user = await currentUser();

  // Identify the user and set their info for the session
  const userInfo = user ? {
    name: user.firstName || "Anonymous",
    picture: user.imageUrl,
    id: user.id,
  } : {
    name: "Guest Recruiter",
    picture: "https://liveblocks.io/avatars/avatar-1.png",
    id: `guest-${crypto.randomUUID()}`,
  };

  const session = liveblocks.prepareSession(
    userInfo.id,
    { userInfo }
  );

  // Allow access to the room
  // Grant FULL_ACCESS to the guest session as requested
  session.allow("*", session.FULL_ACCESS);

  // Authorize the session and return the result
  const { status, body } = await session.authorize();
  return new Response(body, { status });
}
