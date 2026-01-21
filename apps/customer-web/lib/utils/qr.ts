/**
 * QR Code Generation Utilities
 * QR 码生成工具
 */

/**
 * 生成 QR 码 URL（使用外部服务，简单快速）
 * @param text 要编码的文本
 * @returns QR 码图片 URL
 */
export function generateQRCodeUrl(text: string): string {
  // 使用外部 QR 码服务（简单、无需依赖）
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}`;
}

/**
 * 验证 QR 码文本格式
 * @param text QR 码文本
 * @returns boolean
 */
export function validateQRCode(text: string): boolean {
  if (!text || text.length === 0) {
    return false;
  }

  // 最大长度限制（QR 码容量）
  if (text.length > 2000) {
    return false;
  }

  return true;
}

/**
 * 为 ticket 生成 QR 码内容（JSON 格式）
 * @param ticketId Ticket ID
 * @param eventId Event ID
 * @param venueId Venue ID
 * @returns JSON string
 */
export function generateTicketQRData(
  ticketId: string,
  eventId: string,
  venueId: string
): string {
  return JSON.stringify({
    type: 'TICKET',
    ticketId,
    eventId,
    venueId,
    timestamp: Date.now(),
  });
}

/**
 * 解析 ticket QR 码内容
 * @param qrData QR 码数据
 * @returns Parsed data 或 null
 */
export function parseTicketQRData(qrData: string): {
  type: string;
  ticketId: string;
  eventId: string;
  venueId: string;
} | null {
  try {
    const parsed = JSON.parse(qrData);
    if (parsed.type === 'TICKET' && parsed.ticketId && parsed.eventId && parsed.venueId) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
