import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "REACH",
  description: "AI-powered marketing and customer-acquisition platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
