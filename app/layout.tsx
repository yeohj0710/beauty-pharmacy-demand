import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "뷰티 약국 수요 데이터 | 웰니스박스",
  description:
    "성수·명동 뷰티 약국의 실매출과 온라인 관심 신호를 한곳에서 보는 수요 인텔리전스",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
