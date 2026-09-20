import type { APIRoute } from "astro";
import { handleWidgetRequest, SingleSigDeriver } from "@satsrecord/core";
import { appUrl, crypto, db, mail, mailer } from "../../../lib/services";
export const ALL: APIRoute = ({ request, params, clientAddress }) =>
  handleWidgetRequest(request, params.org!, clientAddress, {
    db,
    crypto: crypto(),
    deriver: new SingleSigDeriver(),
    mailer,
    from: mail.from,
    appUrl,
  });
