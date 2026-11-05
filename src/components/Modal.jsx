import { useEffect, useId, useRef } from 'react';

export default function Modal({ title, wide, busy, onClose, children }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  function close() {
    if (busy) return;
    ref.current.close();
    onClose();
  }

  return (
    <dialog ref={ref} aria-labelledby={titleId} aria-busy={busy || undefined}
      onCancel={event => { event.preventDefault(); close(); }}
      className={`fixed inset-0 m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-xl backdrop:bg-slate-950/40 sm:w-[calc(100%-3rem)] ${wide ? 'max-w-6xl' : 'max-w-2xl'}`}>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <h2 id={titleId} className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
        <button type="button" className="secondary-button flex size-10 shrink-0 items-center justify-center p-0"
          aria-label="关闭" onClick={close} disabled={busy}>
          <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      {children}
    </dialog>
  );
}
