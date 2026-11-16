import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_JP } from "next/font/google";
import { DeviceFrame, ViewModeProvider } from "@/components/ViewMode";
import "./globals.css";

const noto = Noto_Sans_JP({ variable: "--font-noto", weight: ["400", "500", "700"], preload: false });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "共通知・人物マップ",
  description: "訪問の記録を音声で残し、人物・タグ・案件のつながりをたどる",
};

export const viewport: Viewport = {
  themeColor: "#14161C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${noto.variable} ${inter.variable} antialiased`}>
      <body>
        <ViewModeProvider>
          <DeviceFrame>{children}</DeviceFrame>
        </ViewModeProvider>
      </body>
    </html>
  );
}
