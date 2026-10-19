export function FloatingWhatsAppButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
      title="Escríbenos por WhatsApp"
      className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-transform duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366] active:scale-95 print:hidden"
    >
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="h-8 w-8 fill-current">
        <path d="M16.003 3C8.832 3 3 8.83 3 16c0 2.293.6 4.533 1.74 6.507L3 29l6.66-1.707A12.95 12.95 0 0 0 16.003 29C23.17 29 29 23.17 29 16S23.17 3 16.003 3Zm0 23.64c-1.96 0-3.88-.527-5.56-1.52l-.4-.24-3.953 1.013 1.053-3.853-.26-.4A10.6 10.6 0 0 1 5.36 16c0-5.867 4.773-10.64 10.643-10.64 5.867 0 10.64 4.773 10.64 10.64 0 5.867-4.773 10.64-10.64 10.64Zm5.84-7.973c-.32-.16-1.893-.933-2.187-1.04-.293-.107-.506-.16-.72.16-.213.32-.826 1.04-1.013 1.253-.187.213-.373.24-.693.08-.32-.16-1.353-.5-2.573-1.587-.953-.853-1.6-1.906-1.787-2.226-.187-.32-.02-.494.14-.654.144-.142.32-.373.48-.56.16-.186.213-.32.32-.533.107-.213.053-.4-.027-.56-.08-.16-.72-1.733-.986-2.373-.26-.624-.524-.54-.72-.55l-.614-.01c-.213 0-.56.08-.853.4-.293.32-1.12 1.093-1.12 2.667 0 1.573 1.147 3.093 1.307 3.307.16.213 2.253 3.44 5.46 4.826.763.33 1.358.527 1.822.674.766.244 1.463.21 2.014.127.614-.092 1.893-.774 2.16-1.52.267-.747.267-1.387.187-1.52-.08-.134-.293-.214-.613-.374Z" />
      </svg>
      <span
        aria-hidden="true"
        className="whatsapp-badge-pulse absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E11D48] px-1 text-[11px] leading-none font-bold text-white ring-2 ring-white"
      >
        1
      </span>
    </a>
  );
}
