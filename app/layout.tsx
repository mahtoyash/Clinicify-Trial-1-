import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Clinicify | Intelligent OPD flow", description: "Doctor-specific live OPD queue forecasting" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
