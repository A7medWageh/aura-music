import { NextRequest } from "next/server";
import { GET as ytdownloadHandler } from "../ytdownload/route";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!url.searchParams.get("videoId") && url.searchParams.get("id")) {
    url.searchParams.set("videoId", url.searchParams.get("id")!);
  }
  url.searchParams.set("download", "true");
  url.searchParams.set("attachment", "true");
  const modReq = new NextRequest(url.toString(), {
    headers: req.headers,
    signal: req.signal,
  });
  return ytdownloadHandler(modReq);
}
