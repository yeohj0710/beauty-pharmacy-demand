import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "프라이빗 약국 데이터 인텔리전스 | 웰니스박스",
  description:
    "파트너 약국의 비공개 POS 매출과 5개 채널 시장 수요를 통합한 데이터 인텔리전스",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
