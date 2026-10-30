import type { Metadata } from "next";
import "./styles.css";
export const metadata: Metadata = {
  title: "Newbert — Ideas worth explaining",
  description:
    "A personal studio for Hindi and Hinglish educational motion graphics.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
