import { OutputHistory } from "../../../../../components/output-history";
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <OutputHistory projectId={projectId} />;
}
