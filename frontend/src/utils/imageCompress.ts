/**
 * 端侧图片压缩（头像与 demo 封面共用）—— 唯一入口。
 *
 * 为什么要有它：封面在端侧**零校验零压缩**（12MB 手机照原样上传），而带宽是本站的明确约束
 * （见 docs/预览架构与排坑记录.md 的"带宽与成本意识"）；头像原先还打算设 1MB 前端硬限，
 * 比封面（后端 200MB）严 200 倍。统一做法：**放宽接收、端侧先压、用户无感**。
 *
 * 与服务端形成"两级压缩、各留余量"：端侧只做粗降（封面 1600 / 头像 512、q0.82），
 * 服务端 compress_cover()/save_avatar() 再做最终归一（1280 / 512、q0.82）——
 * 参数刻意错开，避免两次同参压缩叠加失真。
 *
 * 三条硬约束：
 *   ① 任何环节失败都**不阻断上传**（回退为原文件直传，交服务端兜底）；
 *   ② 大图**解码即缩放**（createImageBitmap 的 resizeWidth 单参），避免 8000×6000 整张进内存（移动端会崩）；
 *   ③ 幂等：本来就小的图**原样直通**，不做无意义重编码（越压越糊）。
 */

export interface FitResult {
  w: number
  h: number
  /** 1 = 不需要缩放 */
  scale: number
}

/** 等比缩到最长边 ≤ maxEdge（只缩不放） */
export function fitWithin(w: number, h: number, maxEdge: number): FitResult {
  if (w <= 0 || h <= 0) return { w: 0, h: 0, scale: 1 }
  const longest = Math.max(w, h)
  if (longest <= maxEdge) return { w, h, scale: 1 }
  const scale = maxEdge / longest
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)), scale }
}

export interface SquareRect {
  sx: number
  sy: number
  size: number
}

/** 取中间正方形（宽高取小者；偏移取整且不越界） */
export function centerSquare(w: number, h: number): SquareRect {
  const size = Math.max(1, Math.min(w, h))
  const sx = Math.max(0, Math.floor((w - size) / 2))
  const sy = Math.max(0, Math.floor((h - size) / 2))
  return { sx, sy, size }
}

export interface CompressOptions {
  /** 最长边上限（封面 1600 / 头像由 square 决定） */
  maxEdge?: number
  /** 输出正方形边长（头像用；给了就居中裁方） */
  square?: number
  /** 编码质量 */
  quality?: number
  /** 幂等阈值：小于它且尺寸达标就原样直通 */
  skipBelowBytes?: number
}

export interface CompressResult {
  /** 可直接上传的文件（失败时就是原文件） */
  file: File
  /** false = 原样直通（小图 / 解码或编码失败） */
  compressed: boolean
  width: number
  height: number
  originalBytes: number
  outputBytes: number
  /** 降级原因（供调用方决定要不要给一句中性提示） */
  reason?: 'skip-small' | 'decode-failed' | 'encode-failed' | 'unsupported'
}

const DEFAULT_QUALITY = 0.82
const DEFAULT_SKIP_BYTES = 400 * 1024
/** 与后端 max_file_size 一致：只拦异常大的文件，不做"图片太大"式限制 */
export const MAX_RAW_BYTES = 200 * 1024 * 1024

export function shouldSkip(
  originalBytes: number,
  w: number,
  h: number,
  opts: CompressOptions = {},
): boolean {
  const maxEdge = opts.square ?? opts.maxEdge ?? 1600
  const skipBelow = opts.skipBelowBytes ?? DEFAULT_SKIP_BYTES
  const withinEdge = Math.max(w, h) <= maxEdge
  // 正方形目标还要求本来就是方的，否则裁切也算有意义的操作
  const alreadySquare = !opts.square || Math.abs(w - h) <= 2
  return originalBytes <= skipBelow && withinEdge && alreadySquare
}

/** 把 blob 包成 File（保留原文件名，扩展名随编码格式） */
function toFile(blob: Blob, original: File, mime: string): File {
  const ext = mime === 'image/webp' ? 'webp' : mime === 'image/png' ? 'png' : 'jpg'
  const base = original.name.replace(/\.[^.]+$/, '') || 'image'
  try {
    return new File([blob], `${base}.${ext}`, { type: mime, lastModified: Date.now() })
  } catch {
    // 极端环境（老 Safari）不支持 File 构造：退化为 Blob + 手工 name
    const b = blob as Blob & { name?: string }
    b.name = `${base}.${ext}`
    return b as unknown as File
  }
}

async function encode(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob | null> {
  if ('convertToBlob' in canvas) {
    try {
      return await canvas.convertToBlob({ type: mime, quality })
    } catch {
      return null
    }
  }
  return await new Promise<Blob | null>((resolve) => {
    ;(canvas as HTMLCanvasElement).toBlob((b) => resolve(b), mime, quality)
  })
}

/** 解码：优先"解码即缩放"（大图不进内存），回退 <img>，再失败返回 null */
async function decode(file: File, maxEdge: number): Promise<{ src: ImageBitmap | HTMLImageElement; w: number; h: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      // imageOrientation: 'from-image' 处理 EXIF（竖拍照片不躺倒）；
      // 只给 resizeWidth → 浏览器按比例算高度，峰值内存降一个量级。
      const bmp = await createImageBitmap(file, {
        imageOrientation: 'from-image',
        resizeWidth: maxEdge,
        resizeQuality: 'high',
      } as ImageBitmapOptions)
      return { src: bmp, w: bmp.width, h: bmp.height }
    } catch {
      /* 回退 */
    }
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
      return { src: bmp, w: bmp.width, h: bmp.height }
    } catch {
      /* 回退 */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('decode'))
      el.src = url
    })
    return { src: img, w: img.naturalWidth, h: img.naturalHeight }
  } catch {
    URL.revokeObjectURL(url)
    return null
  } finally {
    // <img> 已在内存里，可安全回收 objectURL（bitmap 分支没有 URL）
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<CompressResult> {
  const quality = opts.quality ?? DEFAULT_QUALITY
  const targetEdge = opts.square ?? opts.maxEdge ?? 1600
  const base: CompressResult = {
    file,
    compressed: false,
    width: 0,
    height: 0,
    originalBytes: file.size,
    outputBytes: file.size,
  }

  if (file.size > MAX_RAW_BYTES) return { ...base, reason: 'unsupported' }
  if (!/^image\//.test(file.type)) return { ...base, reason: 'unsupported' }

  const decoded = await decode(file, targetEdge)
  if (!decoded) return { ...base, reason: 'decode-failed' }

  const { src, w, h } = decoded
  if (shouldSkip(file.size, w, h, opts)) {
    if ('close' in src) src.close()
    return { ...base, width: w, height: h, reason: 'skip-small' }
  }

  // 目标尺寸：正方形目标 → 先按最长边缩到 ≥square，再居中裁方
  const square = opts.square
  const fit = fitWithin(w, h, square ? Math.max(square, Math.min(Math.max(w, h), targetEdge)) : targetEdge)
  const outW = square ?? fit.w
  const outH = square ?? fit.h
  const srcW = square ? fit.w : fit.w
  const srcH = square ? fit.h : fit.h
  const crop = square ? centerSquare(srcW, srcH) : { sx: 0, sy: 0, size: 0 }

  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(outW, outH)
      : Object.assign(document.createElement('canvas'), { width: outW, height: outH })
  const ctx = (canvas as HTMLCanvasElement).getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  if (!ctx) {
    if ('close' in src) src.close()
    return { ...base, reason: 'unsupported' }
  }

  // 背景：jpeg 不支持透明 → 填白，避免透明区域变黑
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, outW, outH)
  if (square) {
    ctx.drawImage(src as CanvasImageSource, crop.sx, crop.sy, crop.size, crop.size, 0, 0, outW, outH)
  } else {
    ctx.drawImage(src as CanvasImageSource, 0, 0, w, h, 0, 0, outW, outH)
  }
  if ('close' in src) src.close()

  let mime = 'image/webp'
  let blob = await encode(canvas, mime, quality)
  if (!blob || blob.size === 0) {
    mime = 'image/jpeg'
    blob = await encode(canvas, mime, quality)
  }
  if (!blob || blob.size === 0) return { ...base, width: outW, height: outH, reason: 'encode-failed' }

  // 压完反而更大（极小图/高熵图）→ 用原图，别做负优化
  if (blob.size >= file.size * 0.95 && !square) {
    return { ...base, width: outW, height: outH, reason: 'skip-small' }
  }

  return {
    file: toFile(blob, file, mime),
    compressed: true,
    width: outW,
    height: outH,
    originalBytes: file.size,
    outputBytes: blob.size,
  }
}
