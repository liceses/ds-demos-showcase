/**
 * 按"有没有内容"给实体分区（探索页：有作品的模型在前，"0 个作品"的折叠成一行）。
 *
 * 为什么需要它：探索页 5 个模型里 4 个是「0 个作品」，却与有内容的模型**同等视觉权重**
 * （实测：桌面 5 列等宽、移动端单列各占一行 70px）——用户扫一眼看到的主要是"没有作品"。
 *
 * 一条必须守住的边界：**若该段全部实体都没有内容，则不折叠**（collapsed=false）。
 * 否则折叠后页面看起来是空的，比"空实体同权"更糟。
 */
export interface Partitioned<T> {
  /** 有内容的（保持原顺序） */
  withContent: T[]
  /** 没有内容的（保持原顺序） */
  empty: T[]
  /** 是否折叠空实体：有空实体 **且** 至少有一个有内容的实体 */
  collapsed: boolean
}

export function partitionByContent<T>(items: readonly T[], countOf: (x: T) => number): Partitioned<T> {
  const withContent: T[] = []
  const empty: T[] = []
  for (const it of items) {
    if (countOf(it) > 0) withContent.push(it)
    else empty.push(it)
  }
  return { withContent, empty, collapsed: empty.length > 0 && withContent.length > 0 }
}
