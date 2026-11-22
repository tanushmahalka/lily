import { GoogleGenAI, createPartFromUri, type Schema } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

/** Structured JSON answer. `files` are Gemini file handles from uploadVideo/uploadFile. */
export async function json<T>(opts: {
  prompt: string; schema: Schema; model?: string;
  files?: { uri: string; mimeType: string }[];
  inline?: { data: string /* base64 */; mimeType: string }[];
}): Promise<T> {
  const parts: any[] = [
    ...(opts.files ?? []).map((f) => createPartFromUri(f.uri, f.mimeType)),
    ...(opts.inline ?? []).map((i) => ({ inlineData: { data: i.data, mimeType: i.mimeType } })),
    { text: opts.prompt },
  ];
  const res = await ai.models.generateContent({
    model: opts.model ?? MODEL,
    contents: [{ role: "user", parts }],
    config: { responseMimeType: "application/json", responseSchema: opts.schema },
  });
  return JSON.parse(res.text ?? "null") as T;
}

/** Upload a local file (video or image) and wait until Gemini can use it. */
export async function uploadFile(path: string, mimeType: string) {
  let file = await ai.files.upload({ file: path, config: { mimeType } });
  while (file.state === "PROCESSING") {
    await Bun.sleep(2000);
    file = await ai.files.get({ name: file.name! });
  }
  if (file.state === "FAILED") throw new Error(`gemini file processing failed: ${file.name}`);
  return { uri: file.uri!, mimeType: file.mimeType ?? mimeType };
}
export const uploadVideo = (path: string) => uploadFile(path, "video/mp4");
export { Type } from "@google/genai";
