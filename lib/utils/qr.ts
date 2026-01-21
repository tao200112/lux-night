// Generate QR code URL from token
export function generateQRCodeUrl(token: string): string {
  // Use a QR code service or generate client-side
  // For now, use a placeholder service
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(token)}`;
}
