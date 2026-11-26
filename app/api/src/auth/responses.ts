// Response shapes for auth endpoints (F1.AC12). Only these fields ever leave the server.

export interface UserView {
  id: number;
  email: string;
}

/** The public view of a user: id and email only. Never password or password_hash (F1.AC12). */
export function userView(user: { id: number; email: string }): UserView {
  return { id: user.id, email: user.email };
}
