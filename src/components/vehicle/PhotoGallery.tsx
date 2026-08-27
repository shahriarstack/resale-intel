"use client";

import { useState } from "react";
import { Lightbox } from "@/components/ui/Lightbox";

interface Photo {
  id: string;
  url: string;
  label: string;
}

export function PhotoGallery({ photos }: { photos: Photo[] }) {
  const [viewIdx, setViewIdx] = useState<number | null>(null);

  return (
    <>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {photos.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setViewIdx(i)}
            className="group relative block aspect-square cursor-zoom-in overflow-hidden rounded-lg border border-rule transition-[border-color,box-shadow] duration-200 hover:border-accent hover:shadow-md"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.label} loading="lazy" width={640} height={640} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
            <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[9px] uppercase text-white">
              {p.label}
            </span>
            <div className="absolute inset-0 bg-accent/0 transition-colors group-hover:bg-accent/5" />
          </button>
        ))}
      </div>

      {viewIdx !== null && (
        <Lightbox
          src={photos[viewIdx].url}
          alt={photos[viewIdx].label}
          onClose={() => setViewIdx(null)}
          onPrev={viewIdx > 0 ? () => setViewIdx(viewIdx - 1) : undefined}
          onNext={viewIdx < photos.length - 1 ? () => setViewIdx(viewIdx + 1) : undefined}
        />
      )}
    </>
  );
}
