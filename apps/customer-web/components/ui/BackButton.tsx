'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface BackButtonProps {
  href?: string;
  onClick?: () => void;
  className?: string;
}

export default function BackButton({ href, onClick, className = '' }: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (href) {
      router.push(href);
    } else {
      router.back();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`flex items-center justify-center w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors ${className}`}
      aria-label="Go back"
    >
      <span className="material-symbols-outlined">arrow_back</span>
    </button>
  );
}
