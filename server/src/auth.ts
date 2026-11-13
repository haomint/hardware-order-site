import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { argon2id, hash, verify } from "argon2";
import { AdminSessionDays, LoginSchema } from "../../shared/index.ts";
import { transaction } from "./db.ts";
import { ApiFailure } from "./errors.ts";

const loginWindow = 15 * 60 * 1000;
const ipFailureLimit = 10;
const siteFailureLimit = 100;
const sessionLifetime = AdminSessionDays * 24 * 60 * 60 * 1000;
type Login = ReturnType<typeof LoginSchema.parse>;
type Administrator = { username: string; password_hash: string };

function discardExpiredFailures(failures: number[], timestamp: number) {
  while (failures.length && failures[0] <= timestamp - loginWindow) failures.shift();
}

function tokenHash(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  return createHash("sha256").update(token).digest("hex");
}

export async function setAdministrator(db: DatabaseSync, input: Login) {
  const { username, password } = LoginSchema.parse(input);
  const passwordHash = await hash(password, { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  transaction(db, () => {
    db.prepare(`
      INSERT INTO administrator (id, username, password_hash) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET username = excluded.username, password_hash = excluded.password_hash
    `).run(username, passwordHash);
    db.exec("DELETE FROM admin_sessions");
  });
}

export function createAuth(db: DatabaseSync, now: () => number) {
  const admin = db.prepare("SELECT username, password_hash FROM administrator WHERE id = 1");
  const findSession = db.prepare(`
    SELECT a.username FROM admin_sessions s CROSS JOIN administrator a
    WHERE s.token_hash = ? AND s.expires_at > ?
  `);
  const createSession = db.prepare("INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)");
  const revokeSession = db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?");
  const renewSession = db.prepare(`
    UPDATE admin_sessions SET expires_at = max(expires_at, :expiresAt)
    WHERE token_hash = :digest AND expires_at > :requestTime RETURNING expires_at
  `);
  const deleteExpired = db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?");
  const failuresByIp = new Map<string, number[]>();
  const siteFailures: number[] = [];
  let verifying = false;

  return {
    async login(input: Login, ip: string, oldToken?: string) {
      const startedAt = now();
      discardExpiredFailures(siteFailures, startedAt);
      const ipFailures = failuresByIp.get(ip) ?? [];
      discardExpiredFailures(ipFailures, startedAt);
      if (ipFailures.length >= ipFailureLimit || siteFailures.length >= siteFailureLimit || verifying) {
        throw new ApiFailure("TOO_MANY_REQUESTS");
      }
      verifying = true;
      try {
        const account = admin.get() as Administrator | undefined;
        if (!account || !(await verify(account.password_hash, input.password)) || account.username !== input.username) {
          const failedAt = now();
          ipFailures.push(failedAt);
          siteFailures.push(failedAt);
          failuresByIp.set(ip, ipFailures);
          throw new ApiFailure("INVALID_CREDENTIALS");
        }
        const session = transaction(db, () => {
          const current = admin.get();
          if (current?.username !== account.username || current.password_hash !== account.password_hash) {
            throw new ApiFailure("INVALID_CREDENTIALS");
          }
          const oldDigest = tokenHash(oldToken);
          if (oldDigest) revokeSession.run(oldDigest);
          const token = randomBytes(32).toString("hex");
          const digest = createHash("sha256").update(token).digest("hex");
          const expiresAt = now() + sessionLifetime;
          createSession.run(digest, expiresAt);
          return { username: account.username, token, expiresAt };
        });
        failuresByIp.delete(ip);
        return session;
      } finally {
        verifying = false;
      }
    },
    requireSession(token: string | undefined, requestTime: number) {
      const digest = tokenHash(token);
      const username = digest && findSession.get(digest, requestTime)?.username;
      if (!digest || typeof username !== "string") throw new ApiFailure("UNAUTHENTICATED");
      return { digest, username, requestTime };
    },
    renew({ digest, requestTime }: { digest: string; requestTime: number }) {
      const expiresAt = requestTime + sessionLifetime;
      return renewSession.get({ digest, requestTime, expiresAt })?.expires_at as number | undefined;
    },
    logout(token?: string) {
      const digest = tokenHash(token);
      if (digest) revokeSession.run(digest);
    },
    cleanup() {
      const timestamp = now();
      deleteExpired.run(timestamp);
      discardExpiredFailures(siteFailures, timestamp);
      for (const [ip, failures] of failuresByIp) {
        discardExpiredFailures(failures, timestamp);
        if (!failures.length) failuresByIp.delete(ip);
      }
    },
  };
}
