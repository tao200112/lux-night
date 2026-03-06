import Link from 'next/link';
import Image from 'next/image';
import { Drop } from '@lux-night/shared/types';
// import classnames removed

interface DropCardProps {
  drop: Drop;
  className?: string;
}


export default function DropCard({ drop, className }: DropCardProps) {
  const publishedDate = drop.published_at ? new Date(drop.published_at) : new Date(drop.created_at);
  const dateStr = publishedDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York'
  }).replace(/,/g, '/'); // simple format preference 2026/1/29 or similar

  const displaySubtitle = drop.subtitle || drop.content.split('\n')[0];

  return (
    <Link href={`/drops/${drop.id}`} className={`block group relative w-full overflow-hidden rounded-2xl bg-surface-dark border border-white/10 shadow-lg active:scale-[0.98] transition-all duration-200 ${className || ''}`}>
      {/* Aspect Ratio Container: 4:5 for vertical impact */}
      <div className="relative aspect-[4/5] w-full">
        {drop.poster_url ? (
          <Image
            src={drop.poster_url}
            alt={drop.title}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-white/5">
             <span className="material-symbols-outlined text-white/20 text-4xl">image</span>
          </div>
        )}
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

        {/* Content Layer */}
        <div className="absolute inset-0 flex flex-col justify-end p-5">
          {/* Badge */}
          <div className="absolute top-4 right-4 translate-y-[-4px] opacity-0 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
              <span className="rounded-full bg-white/20 backdrop-blur-md px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm border border-white/10">
                  New Drop
              </span>
          </div>

          <h3 className="text-2xl font-bold text-white leading-tight line-clamp-2 drop-shadow-md mb-1">
            {drop.title}
          </h3>
          
          <p className="text-sm text-white/80 font-medium line-clamp-1 mb-4 drop-shadow-sm">
            {displaySubtitle}
          </p>

          <div className="flex items-center justify-between border-t border-white/20 pt-3 mt-1">
              <span className="text-[10px] uppercase tracking-widest text-white/60">
                  {new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'America/New_York' }).format(publishedDate).replace(/(\d+)\/(\d+)\/(\d+)/, '$3/$1/$2')}
              </span>
              <span className="material-symbols-outlined text-white/50 text-sm group-hover:translate-x-1 transition-transform">
                  arrow_forward
              </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
