import ReturnDetailView from './view';

/**
 * See products/[id]/page.tsx.
 *
 * The static demo carries no return requests, but `output: 'export'` rejects a
 * dynamic route that yields zero paths — it reports it identically to one
 * missing this function entirely. So a single placeholder is emitted to satisfy
 * the build. Nothing links to it: the returns list is empty, so the only way
 * here is typing the URL, which lands on the view's not-found state.
 */
export function generateStaticParams() {
  return [{ id: 'demo-unavailable' }];
}

export default function Page() {
  return <ReturnDetailView />;
}
