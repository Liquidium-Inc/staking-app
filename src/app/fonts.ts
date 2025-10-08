import localFont from 'next/font/local';

export const ttCommonsPro = localFont({
  // Put regular 400 weight first so it becomes the default rendered weight
  src: [
    // Essential weights only – normal style
    { path: './fonts/TT_Commons_Pro_Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/TT_Commons_Pro_Light.woff2', weight: '300', style: 'normal' },
    { path: './fonts/TT_Commons_Pro_Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/TT_Commons_Pro_DemiBold.woff2', weight: '600', style: 'normal' },
    { path: './fonts/TT_Commons_Pro_Bold.woff2', weight: '700', style: 'normal' },
    // --- Additional weights and styles kept for future use ---
    // { path: './fonts/TT_Commons_Pro_Italic.woff2', weight: '400', style: 'italic' },
    // { path: './fonts/TT_Commons_Pro_Thin.woff2', weight: '100', style: 'normal' },
    // { path: './fonts/TT_Commons_Pro_Thin_Italic.woff2', weight: '100', style: 'italic' },
    // { path: './fonts/TT_Commons_Pro_ExtraLight.woff2', weight: '200', style: 'normal' },
    // { path: './fonts/TT_Commons_Pro_ExtraLight_Italic.woff2', weight: '200', style: 'italic' },
    // { path: './fonts/TT_Commons_Pro_Light_Italic.woff2', weight: '300', style: 'italic' },
    // { path: './fonts/TT_Commons_Pro_Normal.woff2', weight: '450', style: 'normal' },
    // { path: './fonts/TT_Commons_Pro_Normal_Italic.woff2', weight: '450', style: 'italic' },
    // { path: './fonts/TT_Commons_Pro_Medium_Italic.woff2', weight: '500', style: 'italic' },
    // { path: './fonts/TT_Commons_Pro_DemiBold_Italic.woff2', weight: '600', style: 'italic' },
    // { path: './fonts/TT_Commons_Pro_Bold_Italic.woff2', weight: '700', style: 'italic' },
    // { path: './fonts/TT_Commons_Pro_ExtraBold.woff2', weight: '800', style: 'normal' },
    // { path: './fonts/TT_Commons_Pro_ExtraBold_Italic.woff2', weight: '800', style: 'italic' },
    // { path: './fonts/TT_Commons_Pro_Black.woff2', weight: '900', style: 'normal' },
    // { path: './fonts/TT_Commons_Pro_Black_Italic.woff2', weight: '900', style: 'italic' },
    // { path: './fonts/TT_Commons_Pro_ExtraBlack.woff2', weight: '950', style: 'normal' },
    // { path: './fonts/TT_Commons_Pro_ExtraBlack_Italic.woff2', weight: '950', style: 'italic' },
  ],
  display: 'swap',
  variable: '--font-tt-commons-pro',
  fallback: ['system-ui', 'sans-serif'],
});
