import { useRef } from 'react'

export default function ScrollablePillRow({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  function scroll(direction: -1 | 1) {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <div className="relative flex items-center">
      <button
        onClick={() => scroll(-1)}
        aria-label="Scroll left"
        className="absolute left-0 z-10 flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border border-trove-border bg-trove-surface text-trove-muted shadow-md transition-colors hover:border-trove-accent hover:text-trove-text"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
      </button>

      <div ref={scrollRef} className="scrollbar-hide flex gap-2 overflow-x-auto px-9 pb-1">
        {children}
      </div>

      <button
        onClick={() => scroll(1)}
        aria-label="Scroll right"
        className="absolute right-0 z-10 flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border border-trove-border bg-trove-surface text-trove-muted shadow-md transition-colors hover:border-trove-accent hover:text-trove-text"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    </div>
  )
}
