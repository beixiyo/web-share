/**
 * ## 混合编码工具：将元数据与二进制数据合并为单一ArrayBuffer
 *
 * @example
 * ```ts
 * const metadata = { offset: 1024, type: "video" }
 * const buffer = new Uint8Array([0x01, 0x02, 0x03]).buffer
 *
 * // 默认使用Uint16（2字节存储元数据长度）
 * const encoded = BinaryMetadataEncoder.encode(metadata, buffer)
 *
 * // 显式指定Uint32（4字节存储长度）
 * const encodedLarge = BinaryMetadataEncoder.encode(metadata, buffer, "Uint32")
 *
 * // 解码数据
 * const result = BinaryMetadataEncoder.decode<{ offset: number; type: string }>(encoded)
 * console.log(result.metadata); // { offset: 1024, type: "video" }
 * console.log(new Uint8Array(result.buffer)); // Uint8Array [1, 2, 3]
 *```
 */
export class BinaryMetadataEncoder {
  /**
   * 配置选项
   */
  public static readonly Config = {
    MetaLengthType: {
      Uint8: 1,
      Uint16: 2,
      Uint32: 4,
    } as Record<MetaLengthType, number>,
  }

  /**
   * ### 编码元数据和二进制数据
   * - [元数据长度 (x字节)] + [元数据JSON字符串 (n字节)] + [文件块二进制数据 (m字节)]
   *
   * @param metadata 元数据对象（可JSON序列化）
   * @param buffer 二进制数据（ArrayBuffer或TypedArray）
   * @param metaLengthType 元数据长度存储类型（默认Uint16）
   * @returns 合并后的ArrayBuffer
   */
  public static encode(
    metadata: any,
    buffer: ArrayBuffer | ArrayBufferView,
    metaLengthType: MetaLengthType = 'Uint16',
  ): ArrayBuffer {
    // 1. 序列化元数据
    const metaStr = JSON.stringify(metadata)
    const metaBuffer = new TextEncoder().encode(metaStr)
    /** 元数据长度 */
    const metaLength = metaBuffer.length

    // 2. 验证元数据长度是否超出范围
    const maxMetaLength = BinaryMetadataEncoder.getMaxMetaLength(metaLengthType)
    if (metaLength > maxMetaLength) {
      throw new Error(`Metadata too large (${metaLength} > ${maxMetaLength}). Consider increasing metaLengthType.`)
    }

    // 3. 获取二进制数据（处理ArrayBufferView）
    const dataBuffer = buffer instanceof ArrayBuffer
      ? buffer
      : buffer.buffer

    // 4. 创建总Buffer

    /** 类型长度 */
    const lengthBytes = BinaryMetadataEncoder.Config.MetaLengthType[metaLengthType]
    /**
     * 总长度
     * 类型长度 + 元数据长度 + 二进制数据长度
     */
    const totalBuffer = new Uint8Array(lengthBytes + metaLength + dataBuffer.byteLength)
    const view = new DataView(totalBuffer.buffer)

    // 5. 写入元数据长度
    switch (metaLengthType) {
      case 'Uint8':
        view.setUint8(0, metaLength)
        break
      case 'Uint16':
        view.setUint16(0, metaLength, false) // false表示大端序
        break
      case 'Uint32':
        view.setUint32(0, metaLength, false)
        break
      default:
        throw new Error(`Unsupported metaLengthType: ${metaLengthType}`)
    }

    // 6. 写入元数据和二进制数据
    totalBuffer.set(metaBuffer, lengthBytes)
    totalBuffer.set(new Uint8Array(dataBuffer), lengthBytes + metaLength)

    return totalBuffer.buffer
  }

  /**
   * 解码混合数据
   * @param combinedBuffer 编码后的ArrayBuffer
   * @param metaLengthType 元数据长度存储类型（需与编码时一致）
   * @returns 解构出的元数据和二进制数据
   */
  public static decode<T extends Record<string, any>>(
    combinedBuffer: ArrayBuffer,
    metaLengthType: MetaLengthType = 'Uint16',
  ): { metadata: T, buffer: ArrayBuffer } {
    const view = new DataView(combinedBuffer)
    const lengthBytes = BinaryMetadataEncoder.Config.MetaLengthType[metaLengthType]

    // 1. 读取元数据长度
    let metaLength: number
    switch (metaLengthType) {
      case 'Uint8':
        metaLength = view.getUint8(0)
        break
      case 'Uint16':
        metaLength = view.getUint16(0, false)
        break
      case 'Uint32':
        metaLength = view.getUint32(0, false)
        break
      default:
        throw new Error(`Unsupported metaLengthType: ${metaLengthType}`)
    }

    // 2. 提取元数据
    const metaBuffer = new Uint8Array(combinedBuffer, lengthBytes, metaLength)
    const metadataStr = new TextDecoder().decode(metaBuffer)
    const metadata = JSON.parse(metadataStr) as T

    // 3. 提取二进制数据
    const bufferStart = lengthBytes + metaLength
    const buffer = combinedBuffer.slice(bufferStart)

    return { metadata, buffer }
  }

  public static getMaxMetaLength(
    type: MetaLengthType,
  ): number {
    const lenMap = {
      Uint8: 255,
      Uint16: 65535,
      Uint32: 4294967295,
    }

    const res = lenMap[type]
    if (!res) {
      throw new Error(`Unknown type: ${type}`)
    }
    return res
  }
}

export type MetaLengthType = 'Uint8' | 'Uint16' | 'Uint32'
