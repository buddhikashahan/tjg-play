/**
 * Uploads an author photo through the server, which stores it in Firebase Storage.
 * Returns the photo's public download URL.
 */
export async function uploadAuthorAvatar(file: File, authorName: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("authorName", authorName);

  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Image upload failed");
  return data.url;
}
