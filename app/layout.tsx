import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title:"SubnetLab | Plan. Allocate. Understand.", description:"Calculate IPv4 subnets, allocate VLSM blocks, manage addresses, and practice networking." };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
