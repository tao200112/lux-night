/**
 * QR Code Generation Utilities
 * QR 码生成工具
 */

/**
 * 生成 QR 码 Data URL
 * @param text 要编码的文本
 * @returns Data URL (base64)
 */
export async function generateQRCodeUrl(text: string): Promise<string> {
  try {
    // 使用动态导入避免服务端渲染问题
    const QRCode = (await import('qrcode')).default;
    
    const dataUrl = await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    return dataUrl;
  } catch (error) {
    console.error('QR code generation failed:', error);
    
    // Fallback: 返回一个占位图
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+UVIgQ29kZTwvdGV4dD48L3N2Zz4=';
  }
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
