import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DJI Field Data Extractor",
  description: "Extract and download GeoJSON data from DJI field responses",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
