import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "제품 수요 대시보드 | 웰니스박스",
  description: "약국 실판매와 온라인 관심 신호를 비교하는 제품 수요 인텔리전스",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
