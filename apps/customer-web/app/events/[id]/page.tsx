
import { redirect } from 'next/navigation';

export default async function EventPageOld({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/events-v2/${id}`);
}
