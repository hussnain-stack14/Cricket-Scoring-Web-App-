'use client';

export default function InlineScript({ id, code }) {
  return (
    <script
      id={id}
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}
