/** Wire shape for a media-library item (shared by the upload + library APIs). */
export type MediaItem = {
  id: string; url: string; thumbUrl: string; width: number; height: number; sizeBytes: number;
  title: string; alt: string; folder: string; isPrivate: boolean; originalName: string;
  uploadedBy: string | { id: string; name: string }; createdAt: string;
  kind: "image" | "video" | "pdf"; mime: string; caption: string; altSource: "ai" | "user" | "auto";
  aiStatus: "pending" | "done" | "failed" | "skipped"; placeholder: string; color: string; driver: "local" | "cdn";
};

export function toMediaItem(d: any): MediaItem {
  return {
    id: String(d._id), url: d.url, thumbUrl: d.thumbUrl || d.url, width: d.width, height: d.height, sizeBytes: d.sizeBytes,
    title: d.title || "", alt: d.alt || "", folder: d.folder, isPrivate: !!d.isPrivate, originalName: d.originalName || "",
    uploadedBy: d.uploadedBy && typeof d.uploadedBy === "object" && "name" in d.uploadedBy
      ? { id: String(d.uploadedBy._id), name: d.uploadedBy.name } : String(d.uploadedBy),
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    kind: d.kind || "image", mime: d.mime || "image/webp", caption: d.caption || "", altSource: d.altSource || "auto",
    aiStatus: d.aiStatus || "skipped", placeholder: d.placeholder || "", color: d.color || "", driver: d.driver || "local",
  };
}
