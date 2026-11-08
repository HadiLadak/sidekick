import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Shantell_Sans, Noto_Nastaliq_Urdu, Noto_Naskh_Arabic } from "next/font/google";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson", subsets: ["latin", "latin-ext"] });
const shantell = Shantell_Sans({ variable: "--font-shantell", subsets: ["latin"], weight: ["500", "700"] });
const nastaliq = Noto_Nastaliq_Urdu({ variable: "--font-nastaliq", subsets: ["arabic"], preload: false });
const naskh = Noto_Naskh_Arabic({ variable: "--font-naskh", subsets: ["arabic"], preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://sidekick-eosin-seven.vercel.app"),
  title: "Sid, your tech sidekick",
  description:
    "Send Sid a screenshot or ask a question. Sid shows you exactly where to tap, fixes errors, spots scams and explains tech in plain words, in your language.",
  applicationName: "Sid",
  appleWebApp: { capable: true, title: "Sid", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  openGraph: {
    title: "Sid, your tech sidekick",
    description: "Screenshot in, plain-language help out. Shows you where to tap, spots scams, speaks your language.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The app opens light whatever the device setting, so the browser bar matches it
  themeColor: "#f2f4fc",
};

// Applies saved theme, language and Simple mode before paint so nothing flashes.
const boot = `(function(){try{var d=document.documentElement;var s=JSON.parse(localStorage.getItem('sid:prefs')||'{}');var dark=s.theme==='dark';d.classList.toggle('dark',dark);d.dataset.simple=String(s.simple!==false);if(s.lang){d.lang=s.lang;d.dir=(s.lang==='ur'||s.lang==='ar')?'rtl':'ltr';}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      dir="ltr"
      suppressHydrationWarning
      className={`${atkinson.variable} ${shantell.variable} ${nastaliq.variable} ${naskh.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: boot }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
