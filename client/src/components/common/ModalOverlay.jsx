import { createPortal } from 'react-dom';

/**
 * Portals its content straight to document.body instead of rendering inline. A modal
 * rendered inline can get trapped inside an ancestor's stacking context / containing
 * block — e.g. Layout's page-transition wrapper, whose fade-in-up animation leaves a
 * non-`none` computed `transform` on the page root, which turns it into a containing
 * block for `position:fixed` descendants. Once trapped, a LATER sibling on the same page
 * (any card/table rendered after the modal in the DOM) can paint OVER the modal instead of
 * under it — confirmed via document.elementFromPoint() landing on a page card instead of
 * the modal's own button. Rendering at the document root sidesteps this entire class of
 * bug regardless of which page/ancestor would otherwise be at fault.
 * @param {{onDismiss:()=>void, children:React.ReactNode}} props
 */
export function ModalOverlay({ onDismiss, children }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onDismiss}>
      {children}
    </div>,
    document.body,
  );
}
