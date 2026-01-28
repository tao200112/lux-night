/**
 * Event Week Utilities
 * 活动周配置工具函数
 */

/**
 * 计算某天的时间窗口（统一算法）
 * 
 * @param weekStartDate 周一开始日期
 * @param dow 星期几 (0=Monday, 1=Tuesday, ..., 6=Sunday)
 * @param startTime 开始时间 (HH:MM)
 * @param endTime 结束时间 (HH:MM)
 * @param endNextDay 是否跨天
 * @param timezone 时区 (默认 America/New_York)
 * @returns { validStartAt: Date, validEndAt: Date }
 */
export function calculateDayValidityWindow(
  weekStartDate: Date,
  dow: number,
  startTime: string, // "16:00"
  endTime: string, // "02:00"
  endNextDay: boolean,
  timezone: string = 'America/New_York'
): { validStartAt: Date; validEndAt: Date } {
  // 计算目标日期（weekStartDate + dow days）
  const targetDate = new Date(weekStartDate);
  targetDate.setDate(targetDate.getDate() + dow);

  // 解析时间字符串
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);

  // 计算 valid_start_at: (target_date + start_time) in timezone -> timestamptz
  const validStartAt = new Date(targetDate);
  validStartAt.setHours(startHour, startMinute, 0, 0);

  // 计算 valid_end_at
  let validEndAt: Date;
  if (endNextDay) {
    // 跨天：结束时间是次日
    validEndAt = new Date(targetDate);
    validEndAt.setDate(validEndAt.getDate() + 1);
    validEndAt.setHours(endHour, endMinute, 0, 0);
  } else {
    // 不跨天
    validEndAt = new Date(targetDate);
    validEndAt.setHours(endHour, endMinute, 0, 0);
  }

  // 注意：这里返回的是本地时间，实际使用时需要转换为 UTC
  // 在生产环境中，应该使用服务器端函数或时区库（如 date-fns-tz）来处理时区转换
  return { validStartAt, validEndAt };
}

/**
 * 计算本周的 week_start_date（周一 00:00）
 * 
 * @param forDate 任意日期
 * @param timezone 时区 (默认 America/New_York)
 * @returns 周一开始日期
 */
export function calculateWeekStartDate(
  forDate: Date,
  timezone: string = 'America/New_York'
): Date {
  // JavaScript Date.getDay() 返回 0=Sunday, 1=Monday, ..., 6=Saturday
  // 我们需要转换为 0=Monday, 1=Tuesday, ..., 6=Sunday
  const dayOfWeek = forDate.getDay();
  const mondayOffset = (dayOfWeek === 0 ? 6 : dayOfWeek - 1); // 0=Monday

  const weekStart = new Date(forDate);
  weekStart.setDate(weekStart.getDate() - mondayOffset);
  weekStart.setHours(0, 0, 0, 0);

  return weekStart;
}

/**
 * 格式化星期几名称
 */
export function getDayName(dow: number): string {
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return names[dow] || 'Unknown';
}

/**
 * 格式化星期几短名称
 */
export function getDayShortName(dow: number): string {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return names[dow] || 'Unknown';
}
