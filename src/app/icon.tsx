import { ImageResponse } from 'next/og';

// Route segment config
export const runtime = 'edge';
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000000',
          borderRadius: '128px',
          border: '16px solid #00E5FF',
          boxShadow: '0 0 100px #00E5FF',
        }}
      >
        <svg
          width="256"
          height="256"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#00E5FF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" fill="#00E5FF" />
          <circle cx="18" cy="16" r="3" fill="#00E5FF" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
