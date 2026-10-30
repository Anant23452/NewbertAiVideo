import Link from "next/link";
export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Newbert home">
      <span className="brand-mark">N</span>newbert
      <span className="brand-ai">AI VIDEO</span>
    </Link>
  );
}
export function Arrow() {
  return <span aria-hidden="true">↗</span>;
}
