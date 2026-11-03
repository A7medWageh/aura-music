import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

/**
 * Root HTML template for Expo Router Web.
 * Ensures the Google CDN / YouTube thumbnails never fail with 403 Forbidden
 * by setting no-referrer at the initial HTML document level.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1.00001, viewport-fit=cover, user-scalable=no"
        />
        <meta name="referrer" content="no-referrer" />
        <meta name="theme-color" content="#0A0908" />
        <meta name="description" content="Aura Music — منصة استماع للموسيقى العربية بجودة عالية." />
        <title>Aura Music</title>
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root {
                height: 100%;
                background-color: #0A0908;
                color: #F5F0E6;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                user-select: none;
                -webkit-user-select: none;
                overflow: hidden;
              }
              /* Hide standard scrollbars for sleek app feel */
              ::-webkit-scrollbar {
                display: none;
              }
              * {
                -ms-overflow-style: none;
                scrollbar-width: none;
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

