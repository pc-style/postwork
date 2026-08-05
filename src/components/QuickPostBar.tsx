import { useRef, useState } from "react";
import { Button } from "./Button";
import { NewPostDialog } from "./NewPostDialog";

export function QuickPostBar() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      {/* offset by the sidebar width on md+ so the button centers on the
          content column, not the full viewport */}
      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:left-[clamp(12rem,18vw,15rem)]">
        <div className="pointer-events-auto mx-auto flex max-w-3xl justify-center">
          <Button
            ref={triggerRef}
            size="lg"
            onClick={() => setOpen(true)}
            className="min-w-36"
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            <PlusIcon />
            new post
          </Button>
        </div>
      </div>
      {open ? <NewPostDialog onClose={() => setOpen(false)} returnFocusRef={triggerRef} /> : null}
    </>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="-ms-0.5 size-4" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
