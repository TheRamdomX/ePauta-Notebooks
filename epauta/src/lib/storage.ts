import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Cloudflare R2 configuration
const r2Client = new S3Client({
  region: 'auto',
  endpoint: import.meta.env.R2_ENDPOINT, // e.g., https://<account_id>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: import.meta.env.R2_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.R2_SECRET_ACCESS_KEY,
  },
})

// Bucket name is configured via environment variables or passed directly
// const _BUCKET_NAME = import.meta.env.R2_BUCKET_NAME || 'epauta'

interface FileObject {
  name: string
  id: string
  updated_at: string | null
  created_at: string | null
  last_accessed_at: string | null
  metadata: Record<string, unknown> | null
}

interface ListOptions {
  limit?: number
  offset?: number
  sortBy?: {
    column: string
    order: 'asc' | 'desc'
  }
}

/**
 * Storage interface compatible with Supabase Storage API
 * but using Cloudflare R2 under the hood
 */
export const storage = {
  from: (bucket: string) => ({
    /**
     * List files in a path
     */
    list: async (path: string = '', options: ListOptions = {}) => {
      try {
        const command = new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: path ? `${path}/` : '',
          MaxKeys: options.limit || 100,
        })

        const response = await r2Client.send(command)

        const files: FileObject[] = (response.Contents || []).map((item) => ({
          name: item.Key?.split('/').pop() || '',
          id: item.ETag || '',
          updated_at: item.LastModified?.toISOString() || null,
          created_at: item.LastModified?.toISOString() || null,
          last_accessed_at: null,
          metadata: null,
        }))

        // Apply sorting if specified
        if (options.sortBy) {
          files.sort((a, b) => {
            const aVal = a[options.sortBy!.column as keyof FileObject] as string
            const bVal = b[options.sortBy!.column as keyof FileObject] as string

            if (options.sortBy!.order === 'asc') {
              return aVal > bVal ? 1 : -1
            } else {
              return aVal < bVal ? 1 : -1
            }
          })
        }

        return { data: files, error: null }
      } catch (error) {
        console.error('Error listing files:', error)
        return { data: null, error }
      }
    },

    /**
     * Get public URL for a file
     * For R2, we'll generate a signed URL or use the public URL if the bucket is public
     */
    getPublicUrl: (path: string) => {
      // If using R2 public bucket with custom domain
      const publicDomain = import.meta.env.R2_PUBLIC_DOMAIN

      if (publicDomain) {
        // Direct public URL
        return {
          data: {
            publicUrl: `${publicDomain}/${path}`,
          },
        }
      } else {
        // For private buckets, we need to generate signed URLs
        // This is a placeholder - in production you'd generate signed URLs
        return {
          data: {
            publicUrl: `${import.meta.env.R2_ENDPOINT}/${bucket}/${path}`,
          },
        }
      }
    },

    /**
     * Get a signed URL for private files (optional, for future use)
     */
    createSignedUrl: async (path: string, expiresIn: number = 3600) => {
      try {
        const command = new GetObjectCommand({
          Bucket: bucket,
          Key: path,
        })

        const signedUrl = await getSignedUrl(r2Client, command, {
          expiresIn,
        })

        return {
          data: {
            signedUrl,
          },
          error: null,
        }
      } catch (error) {
        console.error('Error creating signed URL:', error)
        return {
          data: null,
          error,
        }
      }
    },
  }),
}
