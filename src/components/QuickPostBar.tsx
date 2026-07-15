import { useRef, useState } from "react";
import { Button } from "./Button";
import { NewPostDialog } from "./NewPostDialog";

export function QuickPostBar() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
      {open ? (
        <NewPostDialog
          onClose={() => setOpen(false)}
          returnFocusRef={triggerRef}
        />
      ) : null}
    </>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
