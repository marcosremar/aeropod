import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const SESSION_COOKIE_NAME = "aeropod_session";
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

export interface Session {
  userId: string;
  email: string;
  name?: string;
  plan?: string;
}

// Generate a random session ID
export function generateSessionId(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

// Get the current session from cookies
export async function getSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

    if (!sessionCookie?.value) {
      return null;
    }

    // Parse the session data
    const sessionData = JSON.parse(sessionCookie.value);

    // Validate session expiry
    if (sessionData.expiresAt && Date.now() > sessionData.expiresAt) {
      await clearSession();
      return null;
    }

    // Verify user still exists in database
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, sessionData.userId))
      .limit(1);

    if (!user) {
      await clearSession();
      return null;
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name || undefined,
      plan: user.plan || undefined,
    };
  } catch (error) {
    console.error("Error getting session:", error);
    return null;
  }
}

// Set a new session
export async function setSession(session: Session): Promise<void> {
  const cookieStore = await cookies();

  const sessionData = {
    ...session,
    expiresAt: Date.now() + SESSION_DURATION,
  };

  cookieStore.set(SESSION_COOKIE_NAME, JSON.stringify(sessionData), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION / 1000, // in seconds
    path: "/",
  });
}

// Clear the current session
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

// Get or create user by email (for MVP auto-login)
export async function getOrCreateUser(email: string, name?: string) {
  // Try to find existing user
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    return existingUser;
  }

  // Create new user. `password` is NOT NULL in the schema, so we must set one.
  // For passwordless auto-login flows we store a random, unusable hash; the user
  // can later set a real password via a reset flow.
  const randomPassword = generateSessionId();
  const hashedPassword = await bcrypt.hash(randomPassword, 10);

  const [newUser] = await db
    .insert(users)
    .values({
      email,
      password: hashedPassword,
      name: name || email.split("@")[0],
      plan: "free",
    })
    .returning();

  return newUser;
}
