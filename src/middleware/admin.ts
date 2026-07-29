import type { NextFunction, Response } from "express";
import { pool } from "../db/pool.js";
import type { AuthedRequest } from "./auth.js";

/** Must run after requireAuth — checks the authenticated user's is_admin flag. */
export async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const { rows } = await pool.query<{ is_admin: boolean }>("SELECT is_admin FROM users WHERE id = $1", [req.userId]);
  if (!rows[0]?.is_admin) {
    res.status(403).json({ error: "This action requires an admin account" });
    return;
  }
  next();
}
