/** 统一错误文案：429 限流给专门提示，其余透出后端 detail */
export function errorMessage(e: unknown, fallback = '操作失败，请稍后再试'): string {
  const err = e as Error & { cause?: unknown }
  if (err.cause === 429) return '操作过于频繁，请稍后再试'
  return err.message || fallback
}
