import type { Metadata, Viewport } from 'next'
import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'KOVAI — The Creative Intelligence Workspace',
  description: 'One workspace. Every model. Zero friction.',
  applicationName: 'KOVAI',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f6f5' },
    { media: '(prefers-color-scheme: dark)', color: '#08080a' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom is left alone. Capping it stops a double-tap zooming the page
  // on iOS, but it also stops anyone who needs to magnify text from doing so,
  // and that is not a trade the layout is entitled to make. Inputs are sized
  // at 16px on small screens instead, which is what actually causes the
  // unwanted zoom-on-focus.
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Theme is resolved before first paint so the workspace never flashes
          the wrong background. It reads the same persisted store the settings
          panel writes to.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
              var raw = localStorage.getItem('kovai.settings');
              var pref = raw ? (JSON.parse(raw).state || {}).theme : 'system';
              var dark = pref === 'dark' || ((!pref || pref === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches);
              if (dark) document.documentElement.classList.add('dark');
            }catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
