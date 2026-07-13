import crypto from "crypto";
import jwt from "jsonwebtoken";

// --- Approval link tokens ---
// The raw token goes out in the email link. Only its hash is ever stored,
// the same way a password would be, so a DB read alone can't forge a link.

export function generateApprovalToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashApprovalToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// --- JWT access/refresh tokens ---

export interface JwtPayload {
  sub: string; // user id
  role: "FINANCE" | "MANAGER" | "ADMIN";
}

export function signAccessToken(payload: JwtPayload) {
  const options: jwt.SignOptions = {
    expiresIn: (process.env.JWT_ACCESS_TTL || "15m") as jwt.SignOptions["expiresIn"],
  };
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET as string, options);
}

export function signRefreshToken(payload: JwtPayload) {
  const options: jwt.SignOptions = {
    expiresIn: (process.env.JWT_REFRESH_TTL || "7d") as jwt.SignOptions["expiresIn"],
  };
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET as string, options);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET as string) as JwtPayload;
}
