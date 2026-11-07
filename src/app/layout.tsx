import type { Metadata } from "next";
import "./globals.css";
import { DataProvider } from "@/components/data-provider";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "SeedFlow — YFS Seed Management",
  description:
    "Seed request, inventory, packing and delivery management prototype built for Youth in Food Systems at CommuniHacks 2026.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <DataProvider>
          <AppShell>{children}</AppShell>
        </DataProvider>
      </body>
    </html>
  );
}
