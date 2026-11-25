import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Aangan: your family's courtyard, wherever you are",
  description:
    "Aangan helps NRIs look after parents in India. AI agents book care, pay bills and raise the alarm, and nothing big happens without your approval.",
};

export const viewport: Viewport = { themeColor: "#0E5E6F", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${jakarta.variable} ${fraunces.variable} h-full`}>
      <head>
        {/* Apply the saved theme before first paint so there is no light/dark flash. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("aangan.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}` }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
