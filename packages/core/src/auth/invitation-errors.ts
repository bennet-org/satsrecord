import { isAPIError } from "better-auth/api";
import { reportFailure } from "../diagnostics";

export function invitationErrorMessage(error: unknown) {
  if (isAPIError(error) && error.statusCode < 500) return error.message;
  reportFailure("invitation", "acceptance", error);
  return "Could not accept the invitation. Please try again later.";
}
