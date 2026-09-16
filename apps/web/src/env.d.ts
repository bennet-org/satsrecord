declare namespace App {
  interface Locals {
    user: import("@satsrecord/core").Session["user"] | null;
    session: import("@satsrecord/core").Session["session"] | null;
    /** The active organisation and the user's role in it. */
    org: { id: string; name: string; slug: string; role: string } | null;
    isOperator: boolean;
  }
}
