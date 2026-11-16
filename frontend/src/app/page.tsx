'use client';

import { useRouter } from 'next/navigation';
import { Logo } from '@/components/atoms/Logo';
import { Button } from '@/components/atoms/Button';
import { useFadeThrough } from '@/components/game';

export default function TitleScreen() {
  const router = useRouter();
  // The title plays its own intro out of black, so the overlay starts clear.
  const { overlay, leave } = useFadeThrough({ startDark: false });

  return (
    <div className="ts-screen">
      {/* Logo with pixelation */}
      <div className="ts-logo">
        <Logo size={120} fill="var(--primary)" className="ts-logo-img" />
      </div>

      {/* Title + Tagline group */}
      <div className="ts-title-group">
        <h1 className="ts-heading">
          {'PARTY WIPE'.split('').map((char, i) => (
            <span
              key={i}
              className="ts-letter"
              style={{ animationDelay: `${1.2 + i * 0.08}s` }}
            >
              {char === ' ' ? '\u00A0' : char}
            </span>
          ))}
        </h1>
        <p className="ts-tagline text-body-sm">The dungeon awaits...</p>
      </div>

      {/* Start button */}
      <div className="ts-button">
        <Button size="lg" onClick={() => leave(() => router.push('/draft'))}>Begin</Button>
      </div>
      {overlay}
    </div>
  );
}
