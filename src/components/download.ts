"use client";

/** Download a CSV export from the server. */
export async function downloadExport(kind: string) {
  const res = await fetch(`/api/export/${kind}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Export failed");
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `${kind}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
