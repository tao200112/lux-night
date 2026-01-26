/**
 * Server-only: Google Places Details -> 结构化地址；slug 生成
 */

import type { PlaceDetailsResponse } from '@lux-night/shared/types';

function getComponent(
  comp: Array<{ long_name: string; short_name: string; types: string[] }>,
  type: string,
  useShort = false
): string {
  const c = comp.find((x) => x.types.includes(type));
  return c ? (useShort ? c.short_name : c.long_name) : '';
}

export async function getPlaceDetails(place_id: string): Promise<PlaceDetailsResponse | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', place_id);
  url.searchParams.set('fields', 'address_components,formatted_address,geometry');
  url.searchParams.set('key', key);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.status !== 'OK' || !data.result) return null;

  const r = data.result;
  const comp = r.address_components || [];
  const geo = r.geometry?.location;

  const streetNumber = getComponent(comp, 'street_number');
  const route = getComponent(comp, 'route');
  const address_line1 = [streetNumber, route].filter(Boolean).join(' ') || r.formatted_address || '';
  const address_line2 = getComponent(comp, 'subpremise') || getComponent(comp, 'premise') || '';
  const city = getComponent(comp, 'locality') || getComponent(comp, 'sublocality') || getComponent(comp, 'sublocality_level_1') || '';
  const state = getComponent(comp, 'administrative_area_level_1', true) || '';
  const postal_code = getComponent(comp, 'postal_code') || '';
  const country = getComponent(comp, 'country', true) || getComponent(comp, 'country') || '';

  return {
    place_id,
    formatted_address: r.formatted_address || address_line1,
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    country,
    lat: typeof geo?.lat === 'number' ? geo.lat : 0,
    lng: typeof geo?.lng === 'number' ? geo.lng : 0,
  };
}

export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'region';
}
