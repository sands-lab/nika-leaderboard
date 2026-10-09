import type { ReactNode } from 'react'
import type { EntryLink, EntryLinkKind } from '../lib/data'

const ICONS: Record<EntryLinkKind, ReactNode> = {
  github: (
    <path
      fill="currentColor"
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
    />
  ),
  // A stack of records: the run's raw trajectories on the Hub.
  trajectories: (
    <g fill="none" stroke="currentColor" strokeWidth="1.4">
      <ellipse cx="8" cy="3.5" rx="5.5" ry="2" />
      <path d="M2.5 3.5v4.5c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2V3.5" />
      <path d="M2.5 8v4.5c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2V8" />
    </g>
  ),
  report: (
    <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M3.5 1.5h6l3 3v10h-9z" />
      <path d="M9.5 1.5v3h3M5.5 8h5M5.5 10.5h5" />
    </g>
  ),
  site: (
    <g fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M1.5 8h13M8 1.5c-2.2 2.3-2.2 10.7 0 13M8 1.5c2.2 2.3 2.2 10.7 0 13" />
    </g>
  ),
  model: (
    <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M8 1.5l6 3.25v6.5L8 14.5l-6-3.25v-6.5z" />
      <path d="M2 4.75L8 8l6-3.25M8 8v6.5" />
    </g>
  ),
}

export function LinkIcon({ link }: { link: EntryLink }) {
  return (
    <a
      className="link-icon"
      href={link.href}
      target="_blank"
      rel="noreferrer"
      title={link.label}
      aria-label={link.label}
    >
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        {ICONS[link.kind]}
      </svg>
    </a>
  )
}

/** Icon-only links; the label is in the tooltip and for screen readers. */
export function EntryLinks({ links }: { links: EntryLink[] }) {
  if (links.length === 0) return <span className="muted">—</span>
  return (
    <span className="links">
      {links.map((l) => (
        <LinkIcon key={l.kind} link={l} />
      ))}
    </span>
  )
}
