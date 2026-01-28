
import { redirect } from 'next/navigation';

export default async function AdminEventDetailPageOld({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/events-v2/${id}/week`);
}
