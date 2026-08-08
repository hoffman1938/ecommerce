import type { ReactNode } from 'react';

/**
 * Shared frame for sign-in, registration and password screens.
 *
 * A single narrow column on a plain page: these are short, high-intent forms,
 * so the layout gets out of the way rather than dressing them in a card.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container-page">
      <div className="mx-auto w-full max-w-[26rem] py-12 lg:py-20">{children}</div>
    </div>
  );
}
