import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: "MUN Evaluador - Consejo de Seguridad",
  description: "Sistema Oficial de Evaluación del Modelo de Naciones Unidas",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={`${montserrat.className} bg-[#0b0f17] text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}