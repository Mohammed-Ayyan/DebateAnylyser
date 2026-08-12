export type PresignedUploadRequest = {
  ownerId: string
  filename: string
  contentType: string
  size: number
  ttlSeconds: number
}

export type PresignedUpload = {
  uploadUrl: string
  mediaKey: string
  expiresAt: Date
}

export type StoredObject = {
  contentType: string | null
  size: number | null
  metadata: Readonly<Record<string, string | undefined>>
}

export type ImmutableObjectWrite = {
  mediaKey: string
  bytes: Uint8Array
  contentType: string
  metadata?: Readonly<Record<string, string>>
}

export interface ObjectStorage {
  createPresignedUpload(request: PresignedUploadRequest): Promise<PresignedUpload>
  createPresignedDownload(mediaKey: string, ttlSeconds: number): Promise<string>
  writeImmutableObject(request: ImmutableObjectWrite): Promise<void>
  readObject(mediaKey: string, maxBytes: number): Promise<Uint8Array>
  headObject(mediaKey: string): Promise<StoredObject | null>
  deleteObject(mediaKey: string): Promise<void>
}
