import type { Metadata } from "next";
import { AuthProvider } from "@/app/context/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "SaaS Dashboard",
  description: "Product management dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
