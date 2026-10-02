import { NextResponse } from "next/server";
import { saveIconUpload, UploadError } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * POST /api/icons/upload — multipart "file" field. Persists the image under
 * data/icons/ and returns the tiles.icon value ("upload:<filename>").
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field" }, { status: 400 });
  }

  try {
    const icon = await saveIconUpload(file);
    return NextResponse.json({ icon });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("icon upload failed", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
