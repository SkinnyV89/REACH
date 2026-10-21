// Exercises the real Better Auth handler and Prisma against a database.
// Opt-in: set TEST_DATABASE_URL to a disposable, migrated database.
// It only deletes the users it creates (emails under @reach-test.invalid).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const run = describe.skipIf(!url);

run("auth (integration)", () => {
  let auth: typeof import("@/lib/auth").auth;
  let db: typeof import("@/lib/db").db;
  const email = `seller-${Date.now()}@reach-test.invalid`;
  const password = "correct-horse-battery";
  const base = "http://localhost:3000/api/auth";

  const post = (path: string, body: unknown, cookie?: string) =>
    auth.handler(
      new Request(`${base}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
      }),
    );

  const sessionCookie = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-at-least-32-characters";
    ({ auth } = await import("@/lib/auth"));
    ({ db } = await import("@/lib/db"));
  });

  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { email: { endsWith: "@reach-test.invalid" } } });
    await db.$disconnect();
  });

  it("signs up a seller with no brand membership and starts a session", async () => {
    const res = await post("/sign-up/email", { name: "Thandi", email, password, role: "ADMIN" });
    expect(res.status).toBe(200);

    const cookie = sessionCookie(res);
    expect(cookie).toContain("better-auth.session_token=");

    const sessionRes = await auth.handler(
      new Request(`${base}/get-session`, { headers: { cookie } }),
    );
    const session = await sessionRes.json();
    expect(session.user.email).toBe(email);
  });

  it("never sets role from sign-up input", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.role).toBe("SELLER");
  });

  it("stores an argon2id hash, not the password", async () => {
    const account = await db.account.findFirstOrThrow({ where: { user: { email }, providerId: "credential" } });
    expect(account.password).toMatch(/^\$argon2id\$/);
    expect(account.password).not.toContain(password);
  });

  it("rejects a duplicate sign-up", async () => {
    const res = await post("/sign-up/email", { name: "Someone", email, password });
    expect(res.status).toBe(422);
    expect(await db.user.count({ where: { email } })).toBe(1);
  });

  it("rejects a wrong password with a generic error", async () => {
    const res = await post("/sign-in/email", { email, password: "wrong-password-123" });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("signs in with the right password", async () => {
    const res = await post("/sign-in/email", { email, password });
    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toContain("better-auth.session_token=");
  });

  it("rejects passwords shorter than the minimum", async () => {
    const res = await post("/sign-up/email", { name: "Short", email: `short-${email}`, password: "short" });
    expect(res.status).toBe(400);
  });
});
