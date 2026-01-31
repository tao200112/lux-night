'use client';

import { useEffect, useState, useRef } from 'react';

interface PosterPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
}

export default function PosterPreviewModal({ isOpen, onClose, imageUrl }: PosterPreviewModalProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Reset state on open
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape' && isOpen) onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDoubleClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (scale === 1) {
      setScale(2.5);
    } else {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  };

  const handleDragStart = (clientX: number, clientY: number) => {
    if (scale > 1) {
      setIsDragging(true);
      dragStartRef.current = { x: clientX - position.x, y: clientY - position.y };
    }
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (isDragging && dragStartRef.current) {
        // e.preventDefault(); // Often needed in raw listeners, but in React synthetic events might generally work.
        // For touch, preventDefault is handled in styles usually (touch-action: none)
      setPosition({
        x: clientX - dragStartRef.current.x,
        y: clientY - dragStartRef.current.y
      });
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // Mouse Events
  const onMouseDown = (e: React.MouseEvent) => handleDragStart(e.clientX, e.clientY);
  const onMouseMove = (e: React.MouseEvent) => handleDragMove(e.clientX, e.clientY);
  const onMouseUp = () => handleDragEnd();

  // Touch Events
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };
  const onTouchEnd = () => handleDragEnd();

  return (
    <div 
        className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200"
        onClick={onClose} // Click background to close
    >
        {/* Close Button */}
        <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="absolute top-6 right-6 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors backdrop-blur-md"
        >
            <span className="material-symbols-outlined text-white text-2xl">close</span>
        </button>

        {/* Content Container */}
        <div 
            className="relative w-full h-full flex items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking content area
        >
            <img
                ref={imgRef}
                src={imageUrl}
                alt="Full Poster"
                draggable={false}
                className={`
                    max-w-[95vw] max-h-[85vh] object-contain transition-transform duration-200 ease-out select-none
                    ${scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}
                `}
                style={{
                    transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                    touchAction: scale > 1 ? 'none' : 'auto'
                }}
                onDoubleClick={handleDoubleClick}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            />
        </div>

        {/* Hint text */}
        <div className="absolute bottom-6 left-0 right-0 text-center pointer-events-none opacity-50 text-white text-xs">
            {scale === 1 ? 'Double tap to zoom' : 'Drag to pan • Double tap to reset'}
        </div>
    </div>
  );
}
