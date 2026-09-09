import './globals.css'

export const metadata = {
  title: 'Power Anomaly Dashboard - Telecom Operations',
  description: 'Analisa Power AC/DC Multi-Vendor (ZTE & Hariff)',
}

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
